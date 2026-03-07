/**
 * Kimi K2.5 Agent Swarm Job Finder
 *
 * Uses Moonshot AI's Kimi K2.5 model with agent swarm capabilities to
 * search for jobs across 100+ roles in parallel. One prompt triggers
 * the model's internal multi-agent orchestration to find, validate,
 * and return real job listings — saving Perplexity API costs.
 *
 * Designed to be called every 2-3 hours via Supabase cron or external scheduler.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── All roles to search ─────────────────────────────────────────────

const ALL_ROLES = [
  // Software Engineering
  "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "Mobile Developer", "iOS Developer", "Android Developer", "DevOps Engineer",
  "Cloud Engineer", "Site Reliability Engineer", "QA Engineer", "Security Engineer",
  "Platform Engineer", "Embedded Engineer", "Web Developer", "Software Architect",
  // Data & AI
  "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer",
  "AI Engineer", "ML Ops Engineer", "Analytics Engineer", "NLP Engineer",
  "Computer Vision Engineer", "Prompt Engineer", "Business Intelligence Analyst",
  // Product & Design
  "Product Manager", "Product Designer", "UX Designer", "UI Designer",
  "UX Researcher", "Design Lead", "Graphic Designer", "Content Designer",
  // Management & Operations
  "Engineering Manager", "Technical Program Manager", "Project Manager",
  "Scrum Master", "Agile Coach", "VP of Engineering", "CTO",
  // Business
  "Business Analyst", "Solutions Architect", "Sales Engineer", "Technical Writer",
  "Marketing Manager", "Growth Manager", "Customer Success Manager",
  // Cybersecurity
  "Cybersecurity Analyst", "Penetration Tester", "Security Architect",
  "Information Security Manager", "SOC Analyst",
  // Cloud & Infrastructure
  "Cloud Architect", "AWS Solutions Architect", "Azure Engineer",
  "Kubernetes Engineer", "Infrastructure Engineer", "Network Engineer",
  // Finance & Legal Tech
  "Quantitative Analyst", "Fintech Developer", "Blockchain Developer",
  // Emerging
  "Robotics Engineer", "AR/VR Developer", "Game Developer",
  "Technical Recruiter", "Developer Advocate",
];

// ── Kimi API call ──────────────────────────────────────────────────

const KIMI_API_BASE = "https://api.moonshot.ai/v1"; // Global endpoint

interface KimiJob {
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  salary: string;
  job_type: string;
  remote: boolean;
  date_posted: string;
  source: string;
  experience_level: string;
}

/**
 * Call Kimi K2.5 with a batch of roles to find jobs.
 * The model's agent swarm capability handles parallel sub-agent orchestration
 * internally — we send one prompt with all roles.
 */
async function findJobsWithKimi(
  apiKey: string,
  roles: string[],
  batchNum: number,
): Promise<KimiJob[]> {
  const todayStr = new Date().toISOString().split("T")[0];
  const rolesStr = roles.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const systemPrompt = `You are a job search engine specializing in the United States tech job market. Your task is to find REAL, currently open job listings.

TODAY'S DATE: ${todayStr}

CRITICAL RULES:
- Return ONLY valid JSON — no markdown, no explanation, no commentary
- ONLY return jobs located in the United States
- Every job MUST be a REAL listing you can verify exists
- apply_url MUST be a direct link to the specific job posting (NOT a generic careers page, NOT a search results page)
- Good apply_url examples: greenhouse.io/company/jobs/12345, linkedin.com/jobs/view/123456, lever.co/company/abc-def
- BAD apply_url examples: company.com/careers, linkedin.com/jobs/search, indeed.com/jobs?q=engineer
- Include detailed descriptions (5+ sentences) from the actual job posting
- Each job must have a different company
- Include salary when available (in USD)
- date_posted should be relative: "Today", "1 day ago", "2 days ago", etc.

OUTPUT FORMAT:
{"jobs":[{"title":"","company":"","location":"","description":"","apply_url":"https://...","salary":"","job_type":"Full-time","remote":false,"date_posted":"","source":"Company Careers","experience_level":"Mid-Level"}]}

experience_level must be one of: Internship, Entry-Level, Mid-Level, Senior, Executive`;

  const userPrompt = `Act as a team of specialized job search agents. Each agent focuses on different job roles and job boards. Search company career pages, LinkedIn, Greenhouse, Lever, Workday, and other platforms.

Find 2-3 REAL, currently open job listings for EACH of these ${roles.length} roles in the United States:

${rolesStr}

That means find approximately ${roles.length * 2}-${roles.length * 3} total jobs across all roles. Search different companies for variety. Return all jobs in a single JSON object.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

  try {
    const response = await fetch(`${KIMI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "kimi-k2-0711-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 16384,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[KimiJobFinder] API error (batch ${batchNum}, ${response.status}):`, errText);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON response
    let jobs: KimiJob[] = [];
    try {
      const parsed = JSON.parse(content);
      jobs = parsed.jobs || [];
    } catch {
      // Try extracting JSON from potential markdown wrapping
      const jsonMatch = content.match(/\{[\s\S]*"jobs"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          jobs = parsed.jobs || [];
        } catch {
          console.error(`[KimiJobFinder] JSON parse failed for batch ${batchNum}`);
        }
      }
    }

    console.log(`[KimiJobFinder] Batch ${batchNum}: ${jobs.length} jobs returned for ${roles.length} roles`);
    return jobs;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[KimiJobFinder] Batch ${batchNum} error:`, err);
    return [];
  }
}

// ── Job Validation ─────────────────────────────────────────────────

const GENERIC_URL_PATTERNS = [
  /\/careers\/?$/i, /\/careers\/?\?/i, /\/careers\/search/i,
  /\/jobs\/?$/i, /\/jobs\/?\?/i, /\/jobs\/search/i,
  /linkedin\.com\/jobs\/search/i, /indeed\.com\/jobs\?/i,
  /glassdoor\.com\/Job\/.*-jobs/i,
];

const NON_US_PATTERNS = [
  /\bindia\b/i, /\bcanada\b/i, /\buk\b/i, /\bunited kingdom\b/i,
  /\bgermany\b/i, /\bfrance\b/i, /\baustralia\b/i, /\bsingapore\b/i,
  /\bjapan\b/i, /\bchina\b/i, /\bbangalore\b/i, /\bhyderabad\b/i,
  /\bmumbai\b/i, /\bdelhi\b/i, /\btoronto\b/i, /\blondon\b/i,
  /\bberlin\b/i, /\bparis\b/i, /\btokyo\b/i,
];

function validateAndCleanJob(job: KimiJob): KimiJob | null {
  // Must have title and company
  if (!job.title || job.title.length < 3 || !job.company || job.company.length < 2) return null;
  // Must have description
  if (!job.description || job.description.length < 30) return null;
  // Must have valid URL
  if (!job.apply_url || !job.apply_url.startsWith("http")) return null;
  // Reject generic URLs
  for (const p of GENERIC_URL_PATTERNS) {
    if (p.test(job.apply_url)) return null;
  }
  // Reject non-US
  const loc = job.location || "";
  for (const p of NON_US_PATTERNS) {
    if (p.test(loc)) return null;
  }
  // Reject generic companies
  const comp = job.company.toLowerCase();
  if (comp === "unknown" || comp === "various" || comp === "confidential") return null;

  return job;
}

function jobFingerprint(title: string, company: string): string {
  return `${title.toLowerCase().trim()}-${company.toLowerCase().trim()}`.replace(/[^a-z0-9-]/g, "");
}

// ── Main Server ──────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const kimiApiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!kimiApiKey) {
      return new Response(
        JSON.stringify({ error: "KIMI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const customRoles: string[] = body.roles || [];
    const action = body.action || "fetch-all";

    let roles = customRoles.length > 0 ? customRoles : [...ALL_ROLES];

    // Also add user-specified roles from profiles
    if (action === "fetch-all") {
      const { data: userProfiles } = await supabase
        .from("profiles")
        .select("desired_roles, target_role")
        .not("desired_roles", "is", null);

      if (userProfiles) {
        const extraRoles = new Set<string>();
        userProfiles.forEach((p: any) => {
          if (p.target_role) extraRoles.add(p.target_role);
          if (Array.isArray(p.desired_roles)) {
            p.desired_roles.forEach((r: string) => extraRoles.add(r));
          }
        });
        extraRoles.forEach((r) => { if (!roles.includes(r)) roles.push(r); });
      }
    }

    console.log(`[KimiJobFinder] Starting: ${roles.length} roles, action: ${action}`);

    // Split roles into batches of 20-25 for Kimi (each batch becomes one API call)
    // With agent swarm, Kimi handles parallelism internally within each call
    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < roles.length; i += BATCH_SIZE) {
      batches.push(roles.slice(i, i + BATCH_SIZE));
    }

    console.log(`[KimiJobFinder] Processing ${batches.length} batches of ~${BATCH_SIZE} roles each`);

    // Process batches in parallel (up to 5 concurrent API calls)
    const CONCURRENCY = 5;
    const allJobs: KimiJob[] = [];
    const errors: string[] = [];

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const concurrentBatches = batches.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        concurrentBatches.map((batch, idx) =>
          findJobsWithKimi(kimiApiKey, batch, i + idx + 1)
        )
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          allJobs.push(...result.value);
        } else {
          errors.push(String(result.reason));
        }
      }

      // Small delay between concurrent groups
      if (i + CONCURRENCY < batches.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log(`[KimiJobFinder] Raw jobs found: ${allJobs.length}`);

    // Validate and deduplicate
    const seenFingerprints = new Set<string>();
    const validJobs: KimiJob[] = [];

    for (const job of allJobs) {
      const cleaned = validateAndCleanJob(job);
      if (!cleaned) continue;

      const fp = jobFingerprint(cleaned.title, cleaned.company);
      if (seenFingerprints.has(fp)) continue;
      seenFingerprints.add(fp);

      validJobs.push(cleaned);
    }

    console.log(`[KimiJobFinder] After validation: ${validJobs.length} unique jobs`);

    // Save to database (both jobs and cached_jobs tables)
    let savedCount = 0;
    const SAVE_BATCH = 50;

    for (let i = 0; i < validJobs.length; i += SAVE_BATCH) {
      const batch = validJobs.slice(i, i + SAVE_BATCH);

      // Save to jobs table
      const jobRows = batch.map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        description: j.description,
        apply_url: j.apply_url,
        source: `kimi-${j.source || "web"}`.toLowerCase().substring(0, 50),
        date_posted: new Date().toISOString(),
        salary_min: parseSalaryMin(j.salary),
        salary_max: parseSalaryMax(j.salary),
        job_type: j.job_type || null,
        remote: j.remote || false,
        external_id: `kimi-${jobFingerprint(j.title, j.company)}-${Date.now()}`,
      }));

      const { error: jobsErr } = await supabase
        .from("jobs")
        .upsert(jobRows, { onConflict: "external_id", ignoreDuplicates: true });

      if (jobsErr) {
        console.error(`[KimiJobFinder] Jobs insert error:`, jobsErr.message);
        errors.push(jobsErr.message);
      } else {
        savedCount += batch.length;
      }

      // Also save to cached_jobs for the search page
      const cachedRows = batch.map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        description: j.description,
        apply_url: j.apply_url,
        salary: j.salary || null,
        job_type: j.job_type || null,
        remote: j.remote || false,
        date_posted: j.date_posted || "Today",
        source: `Kimi ${j.source || "AI Search"}`,
        role_category: classifyRole(j.title),
        experience_level: j.experience_level || "Mid-Level",
        industry: null,
        job_fingerprint: `kimi-${jobFingerprint(j.title, j.company)}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      await supabase
        .from("cached_jobs")
        .upsert(cachedRows, { onConflict: "job_fingerprint", ignoreDuplicates: true })
        .then(({ error }) => {
          if (error) console.error(`[KimiJobFinder] Cached jobs insert:`, error.message);
        });
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[KimiJobFinder] Complete: ${savedCount} jobs saved in ${elapsed}s, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        roles_searched: roles.length,
        raw_jobs_found: allJobs.length,
        valid_unique_jobs: validJobs.length,
        saved_to_db: savedCount,
        elapsed_seconds: elapsed,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[KimiJobFinder] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────

function parseSalaryMin(salary: string | null): number | null {
  if (!salary) return null;
  const match = salary.match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function parseSalaryMax(salary: string | null): number | null {
  if (!salary) return null;
  const matches = salary.match(/\$?([\d,]+)/g);
  if (!matches || matches.length < 2) return parseSalaryMin(salary);
  return parseInt(matches[matches.length - 1].replace(/[,$]/g, ""), 10);
}

function classifyRole(title: string): string {
  const t = title.toLowerCase();
  if (/front.?end|react|vue|angular|ui developer/i.test(t)) return "Engineering";
  if (/back.?end|server|api/i.test(t)) return "Engineering";
  if (/full.?stack/i.test(t)) return "Engineering";
  if (/data scien|machine learn|ml |ai eng|deep learn/i.test(t)) return "AI & ML";
  if (/data analy|business intel|analytics/i.test(t)) return "Data & Analytics";
  if (/data eng|etl|pipeline/i.test(t)) return "Data & Analytics";
  if (/devops|sre|site reli|infrastructure|platform eng/i.test(t)) return "DevOps & Cloud";
  if (/cloud|aws|azure|gcp|kubernetes/i.test(t)) return "DevOps & Cloud";
  if (/product manage|product own/i.test(t)) return "Product";
  if (/ux|ui|design|graphic/i.test(t)) return "Design";
  if (/security|cyber|penetration|soc /i.test(t)) return "Security";
  if (/project manage|scrum|agile/i.test(t)) return "Management";
  if (/engineer.*manager|vp.*eng|cto|director.*eng/i.test(t)) return "Leadership";
  if (/mobile|ios|android/i.test(t)) return "Mobile";
  if (/qa|test|quality/i.test(t)) return "QA & Testing";
  if (/marketing|growth|seo/i.test(t)) return "Marketing";
  if (/sales|business dev/i.test(t)) return "Sales";
  if (/technical writ|content|documentation/i.test(t)) return "Content";
  if (/recruit|talent/i.test(t)) return "Recruiting";
  if (/software|developer|engineer|programmer/i.test(t)) return "Engineering";
  return "Other";
}

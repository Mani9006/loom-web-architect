// Perplexity-powered Job Search with caching — returns real job listings via web search
// Strategy: check cache first → return cached if fresh → else call Perplexity → save to cache
// v13: Added pagination support — page param, skip_cache for next-page pre-fetch
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cache API key across warm invocations
let cachedPerplexityKey: string | null = null;

// ── Role Category Mapping ──────────────────────────────────────────────
const ROLE_CATEGORIES: Record<string, string[]> = {
  "Engineering": ["software engineer", "developer", "backend", "frontend", "full stack", "fullstack", "devops", "sre", "site reliability", "platform engineer", "systems engineer", "embedded", "firmware", "qa engineer", "test engineer", "sdet", "mobile developer", "ios developer", "android developer", "web developer"],
  "Data & Analytics": ["data scientist", "data analyst", "data engineer", "business intelligence", "bi analyst", "analytics", "statistician", "quantitative", "etl", "data warehouse"],
  "AI & Machine Learning": ["machine learning", "ml engineer", "ai engineer", "artificial intelligence", "deep learning", "nlp", "computer vision", "research scientist", "applied scientist"],
  "Cloud & Infrastructure": ["cloud engineer", "cloud architect", "aws", "azure", "gcp", "infrastructure", "network engineer", "solutions architect", "system administrator", "sysadmin"],
  "Cybersecurity": ["security engineer", "cybersecurity", "information security", "penetration tester", "security analyst", "soc analyst", "threat", "vulnerability"],
  "Product & Design": ["product manager", "product owner", "ux designer", "ui designer", "product designer", "user researcher", "interaction designer", "visual designer", "ux/ui"],
  "Project Management": ["project manager", "program manager", "scrum master", "agile coach", "delivery manager", "technical program manager", "tpm"],
  "Marketing": ["marketing manager", "digital marketing", "content marketing", "seo", "sem", "growth", "brand manager", "social media", "marketing analyst", "demand generation"],
  "Sales & Business Development": ["sales engineer", "account executive", "business development", "sales representative", "account manager", "customer success", "sales manager", "revenue"],
  "Finance & Accounting": ["financial analyst", "accountant", "controller", "treasury", "tax", "audit", "bookkeeper", "cfo", "finance manager"],
  "Human Resources": ["hr manager", "recruiter", "talent acquisition", "people operations", "human resources", "compensation", "benefits", "hrbp"],
  "Operations": ["operations manager", "supply chain", "logistics", "procurement", "warehouse", "inventory", "facilities"],
  "Healthcare": ["nurse", "physician", "medical", "clinical", "healthcare", "pharmacy", "therapist", "dentist", "surgeon", "rn ", "lpn"],
  "Legal": ["attorney", "lawyer", "legal counsel", "paralegal", "compliance", "regulatory"],
  "Creative": ["graphic designer", "creative director", "copywriter", "content creator", "video editor", "animator", "illustrator", "art director"],
  "Customer Support": ["customer service", "customer support", "help desk", "technical support", "support engineer", "support specialist"],
  "Education & Training": ["teacher", "instructor", "professor", "trainer", "curriculum", "education", "tutor", "academic"],
};

// ── Experience Level Detection ─────────────────────────────────────────
const EXPERIENCE_PATTERNS: { level: string; patterns: RegExp[] }[] = [
  { level: "Internship", patterns: [/\bintern\b/i, /\binternship\b/i, /\bco-?op\b/i] },
  { level: "Entry-Level", patterns: [/\bentry[- ]?level\b/i, /\bjunior\b/i, /\bjr\.?\b/i, /\b0-2 years?\b/i, /\b1-2 years?\b/i, /\bnew grad\b/i, /\bgraduate\b/i, /\bassociate\b/i] },
  { level: "Mid-Level", patterns: [/\bmid[- ]?level\b/i, /\b3-5 years?\b/i, /\b2-4 years?\b/i, /\b3-7 years?\b/i, /\bmid[- ]?senior\b/i] },
  { level: "Senior", patterns: [/\bsenior\b/i, /\bsr\.?\b/i, /\bstaff\b/i, /\b5\+? years?\b/i, /\b7\+? years?\b/i, /\blead\b/i, /\bprincipal\b/i] },
  { level: "Executive", patterns: [/\bdirector\b/i, /\bvp\b/i, /\bvice president\b/i, /\bc-?suite\b/i, /\bchief\b/i, /\bcto\b/i, /\bceo\b/i, /\bcfo\b/i, /\bcoo\b/i, /\bhead of\b/i, /\bexecutive\b/i] },
];

// ── Industry Detection ─────────────────────────────────────────────────
const INDUSTRY_PATTERNS: Record<string, RegExp[]> = {
  "Technology": [/\btech\b/i, /\bsoftware\b/i, /\bsaas\b/i, /\bcloud\b/i, /\bai\b/i, /\bfintech\b/i, /\bstartup\b/i],
  "Finance": [/\bbank\b/i, /\bfinancial\b/i, /\binvestment\b/i, /\binsurance\b/i, /\bhedge fund\b/i, /\basset management\b/i],
  "Healthcare": [/\bhospital\b/i, /\bmedical\b/i, /\bhealth\b/i, /\bpharma\b/i, /\bbiotech\b/i, /\bclinical\b/i],
  "Retail & E-Commerce": [/\bretail\b/i, /\be-?commerce\b/i, /\bshopping\b/i, /\bmerchant\b/i],
  "Manufacturing": [/\bmanufacturing\b/i, /\bindustrial\b/i, /\bproduction\b/i, /\bfactory\b/i],
  "Education": [/\buniversity\b/i, /\bcollege\b/i, /\bschool\b/i, /\beducation\b/i, /\bacademic\b/i],
  "Government": [/\bgovernment\b/i, /\bfederal\b/i, /\bstate\b/i, /\bmilitary\b/i, /\bdefense\b/i, /\bnasa\b/i],
  "Media & Entertainment": [/\bmedia\b/i, /\bentertainment\b/i, /\bgaming\b/i, /\bstreaming\b/i, /\bpublishing\b/i],
  "Consulting": [/\bconsulting\b/i, /\badvisory\b/i, /\bprofessional services\b/i],
  "Energy": [/\benergy\b/i, /\boil\b/i, /\bgas\b/i, /\brenewable\b/i, /\bsolar\b/i, /\butilities\b/i],
  "Transportation": [/\btransportation\b/i, /\blogistics\b/i, /\bshipping\b/i, /\bfreight\b/i, /\bairline\b/i],
  "Real Estate": [/\breal estate\b/i, /\bproperty\b/i, /\bconstruction\b/i],
};

// ── Helper Functions ───────────────────────────────────────────────────

function classifyRoleCategory(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  for (const [category, keywords] of Object.entries(ROLE_CATEGORIES)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return category;
    }
  }
  return "Other";
}

function detectExperienceLevel(title: string, description: string): string {
  const text = `${title} ${description}`;
  // Check in priority order: Executive > Senior > Entry > Intern (Mid is default)
  for (const { level, patterns } of EXPERIENCE_PATTERNS) {
    for (const p of patterns) {
      if (p.test(title)) return level; // title match is strongest signal
    }
  }
  // If not in title, check description (weaker signal)
  for (const { level, patterns } of EXPERIENCE_PATTERNS) {
    if (level === "Mid-Level") continue; // skip default
    for (const p of patterns) {
      if (p.test(text)) return level;
    }
  }
  return "Mid-Level";
}

function detectIndustry(company: string, description: string): string | null {
  const text = `${company} ${description}`.toLowerCase();
  for (const [industry, patterns] of Object.entries(INDUSTRY_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(text)) return industry;
    }
  }
  return null;
}

// Generate a normalized search key for cache lookups
function buildSearchKey(
  query: string,
  location?: string,
  salaryRange?: string,
  jobType?: string,
  datePosted?: string,
  experienceLevel?: string,
  remoteFilter?: string,
  searchSource?: string
): string {
  const parts = [
    (query || "").toLowerCase().trim(),
    (location || "").toLowerCase().trim(),
    (salaryRange || "any").toLowerCase(),
    (jobType || "all").toLowerCase(),
    (datePosted || "month").toLowerCase(),
    (experienceLevel || "all").toLowerCase(),
    (remoteFilter || "all").toLowerCase(),
    (searchSource || "direct").toLowerCase(),
  ];
  return parts.join("|");
}

// Sanitize date_posted — convert exact dates to relative labels, reject future dates
function sanitizeDatePosted(raw: string): string {
  if (!raw) return "Recently";
  const s = raw.trim();
  if (/ago|today|yesterday|recently|just now/i.test(s)) return s;
  let parsed: Date | null = null;
  const attempt = new Date(s);
  if (!isNaN(attempt.getTime())) {
    parsed = attempt;
  } else {
    const match = s.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
    if (match) {
      parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
      if (isNaN(parsed.getTime())) parsed = null;
    }
  }
  if (!parsed) return s;
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 0) return "Recently";
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

// Convert a relative date label to an ISO timestamp for the `jobs` table (timestamptz)
function relativeDateToTimestamp(label: string): string {
  if (!label) return new Date().toISOString();
  const s = label.trim().toLowerCase();
  const now = new Date();
  if (s === "today" || s === "just now" || s === "recently") return now.toISOString();
  if (s === "yesterday" || s === "1 day ago") return new Date(now.getTime() - 86400000).toISOString();
  const daysMatch = s.match(/^(\d+)\s*days?\s*ago$/);
  if (daysMatch) return new Date(now.getTime() - parseInt(daysMatch[1], 10) * 86400000).toISOString();
  const weeksMatch = s.match(/^(\d+)\s*weeks?\s*ago$/);
  if (weeksMatch) return new Date(now.getTime() - parseInt(weeksMatch[1], 10) * 7 * 86400000).toISOString();
  const monthsMatch = s.match(/^(\d+)\s*months?\s*ago$/);
  if (monthsMatch) return new Date(now.getTime() - parseInt(monthsMatch[1], 10) * 30 * 86400000).toISOString();
  const attempt = new Date(s);
  if (!isNaN(attempt.getTime())) return attempt.toISOString();
  return now.toISOString();
}

function jobFingerprint(job: { title: string; company: string; location: string }): string {
  return [
    (job.title || "").toLowerCase().trim(),
    (job.company || "").toLowerCase().trim(),
    (job.location || "").toLowerCase().trim(),
  ].join(":::");
}

// ── Quality Validation ─────────────────────────────────────────────────
// Returns true if a job passes quality checks, false if it should be rejected
function validateJob(job: any): { valid: boolean; reason?: string } {
  if (!job.title || job.title.length < 3) return { valid: false, reason: "missing/short title" };
  if (!job.company || job.company.length < 2) return { valid: false, reason: "missing company" };
  if (!job.location || job.location.length < 2) return { valid: false, reason: "missing location" };
  if (!job.apply_url || !job.apply_url.startsWith("http")) return { valid: false, reason: "invalid apply_url" };
  if (!job.description || job.description.length < 50) return { valid: false, reason: "description too short" };
  // Reject non-US locations
  const loc = (job.location || "").toLowerCase();
  const nonUSPatterns = [
    /\bindia\b/, /\bcanada\b/, /\buk\b/, /\bunited kingdom\b/, /\bgermany\b/,
    /\bfrance\b/, /\baustralia\b/, /\bsingapore\b/, /\bjapan\b/, /\bchina\b/,
    /\bbrazil\b/, /\bmexico\b/, /\bdubai\b/, /\bnigeria\b/, /\bphilippines\b/,
    /\bbangalore\b/, /\bhyderabad\b/, /\bmumbai\b/, /\bdelhi\b/, /\bpune\b/,
    /\bchennai\b/, /\btoronto\b/, /\bvancouver\b/, /\blondon\b/, /\bberlin\b/,
    /\bparis\b/, /\bsydney\b/, /\bmelbourne\b/, /\btokyo\b/,
  ];
  for (const p of nonUSPatterns) {
    if (p.test(loc)) return { valid: false, reason: `non-US location: ${job.location}` };
  }
  // Reject generic/spam company names
  const company = (job.company || "").toLowerCase();
  if (company === "unknown" || company === "various" || company === "confidential company")
    return { valid: false, reason: "generic company name" };
  return { valid: true };
}

// ── Main Server ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const {
      query,
      location,
      salary_range,
      job_type,
      date_posted,
      resume_text,
      user_id,
      experience_level,  // NEW: Entry-Level, Mid-Level, Senior, Executive
      remote_filter,     // NEW: remote-only, hybrid, on-site, all
      search_source,     // NEW: "direct" (company careers only) or "all" (include job boards)
      page,              // NEW: page number for pagination (1-based, default 1)
      skip_cache,        // NEW: skip cache for pagination fetches
    } = await req.json();

    const pageNum = parseInt(page, 10) || 1;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── 1. Check cache first (skip for pagination fetches) ─────────────
    const searchKey = buildSearchKey(
      query, location, salary_range, job_type, date_posted, experience_level, remote_filter, search_source
    );

    const shouldSkipCache = skip_cache === true || pageNum > 1;

    const { data: cachedSearch } = shouldSkipCache
      ? { data: null }
      : await sb
          .from("search_cache")
          .select("*")
          .eq("search_key", searchKey)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

    if (cachedSearch && cachedSearch.job_ids?.length > 0) {
      const { data: cachedJobs } = await sb
        .from("cached_jobs")
        .select("*")
        .in("id", cachedSearch.job_ids)
        .gt("expires_at", new Date().toISOString());

      if (cachedJobs && cachedJobs.length > 0) {
        let filteredJobs = cachedJobs;
        if (user_id) {
          const { data: seenJobs } = await sb
            .from("user_seen_jobs")
            .select("job_fingerprint")
            .eq("user_id", user_id);

          const seenSet = new Set((seenJobs || []).map((s: any) => s.job_fingerprint));
          filteredJobs = cachedJobs.filter((j: any) => !seenSet.has(j.job_fingerprint));

          if (filteredJobs.length === 0) {
            console.log("All cached jobs already seen by user, fetching fresh results");
          } else {
            const seenInserts = filteredJobs.map((j: any) => ({
              user_id,
              job_fingerprint: j.job_fingerprint,
            }));
            await sb
              .from("user_seen_jobs")
              .upsert(seenInserts, { onConflict: "user_id,job_fingerprint" })
              .select();

            const elapsed = Date.now() - startTime;
            console.log(`Cache HIT: ${filteredJobs.length} jobs in ${elapsed}ms`);

            const normalizedJobs = filteredJobs.map((job: any) => ({
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              description: job.description || "",
              apply_url: job.apply_url || "",
              salary: job.salary,
              job_type: job.job_type,
              remote: job.remote || false,
              date_posted: sanitizeDatePosted(job.date_posted || "Recent"),
              source: job.source || "Web Search",
              role_category: job.role_category || "Other",
              experience_level: job.experience_level || "Mid-Level",
              industry: job.industry || null,
            }));

            return new Response(
              JSON.stringify({
                jobs: normalizedJobs,
                total: normalizedJobs.length,
                citations: [],
                query: query || "software engineer",
                elapsed_ms: elapsed,
                from_cache: true,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          const elapsed = Date.now() - startTime;
          console.log(`Cache HIT (anon): ${cachedJobs.length} jobs in ${elapsed}ms`);

          const normalizedJobs = cachedJobs.map((job: any) => ({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description || "",
            apply_url: job.apply_url || "",
            salary: job.salary,
            job_type: job.job_type,
            remote: job.remote || false,
            date_posted: sanitizeDatePosted(job.date_posted || "Recent"),
            source: job.source || "Web Search",
            role_category: job.role_category || "Other",
            experience_level: job.experience_level || "Mid-Level",
            industry: job.industry || null,
          }));

          return new Response(
            JSON.stringify({
              jobs: normalizedJobs,
              total: normalizedJobs.length,
              citations: [],
              query: query || "software engineer",
              elapsed_ms: elapsed,
              from_cache: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ── 2. Cache MISS — Call Perplexity ──────────────────────────────────
    if (!cachedPerplexityKey) {
      cachedPerplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
      if (!cachedPerplexityKey) {
        const { data: vaultData } = await sb.rpc("vault_read_secret", {
          secret_name: "PERPLEXITY_API_KEY",
        });
        if (vaultData) cachedPerplexityKey = String(vaultData);
      }
    }

    if (!cachedPerplexityKey) {
      return new Response(
        JSON.stringify({ error: "Perplexity API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build search prompt with all filters
    const searchQuery = query || "software engineer";
    const parts: string[] = [`"${searchQuery}" jobs`];
    const searchLocation = location || "United States";
    parts.push(`in ${searchLocation}, USA`);
    if (job_type && job_type !== "all") parts.push(job_type);
    if (salary_range && salary_range !== "any") parts.push(`salary ${salary_range}`);
    if (date_posted && date_posted !== "all" && date_posted !== "month") parts.push(`posted last ${date_posted}`);
    // NEW filters in prompt
    if (experience_level && experience_level !== "all") parts.push(`${experience_level} level`);
    if (remote_filter === "remote-only") parts.push("remote");
    else if (remote_filter === "hybrid") parts.push("hybrid");
    else if (remote_filter === "on-site") parts.push("on-site in-office");

    const resumeHint = resume_text
      ? `\nCandidate background: ${resume_text.substring(0, 300)}. Prioritize matching roles.`
      : "";

    // Exact current date/time for accurate date calculations
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/New_York",
    });

    // Determine source strategy based on search_source param
    const useAllSources = search_source === "all";

    const sourceInstruction = useAllSources
      ? `- MULTI-SOURCE REQUIREMENT: You MUST search across ALL of these job boards and return jobs from at least 4 different sources: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, Built In, SimplyHired, AngelList/Wellfound, company career pages (careers.google.com, jobs.lever.co, greenhouse.io, etc.), USAJobs.gov, Handshake, FlexJobs. For each job, accurately set the "source" field to the job board where you found it.`
      : `- DIRECT COMPANY SOURCES ONLY: You MUST search ONLY company career pages, hiring platforms, and direct employer portals. Search these sources: Greenhouse (boards.greenhouse.io), Lever (jobs.lever.co), Workday (*.myworkdayjobs.com), iCIMS, Jobvite, BambooHR, SmartRecruiters, company career pages (careers.*.com, *.com/careers, jobs.*.com), and direct employer job postings. Do NOT return jobs from aggregator job boards like Indeed, LinkedIn, ZipRecruiter, Glassdoor, SimplyHired, Monster, or CareerBuilder. The "source" field must be the actual company name or their ATS platform (e.g., "Google Careers", "Greenhouse", "Lever", "Workday"), NEVER a job board aggregator.`;

    const systemPrompt = `You are a job search engine for the United States job market ONLY. Return ONLY valid JSON, no markdown, no explanation.
TODAY'S DATE IS: ${todayStr}. Use this to calculate accurate relative dates for when jobs were posted.
Format: {"jobs":[{"title":"","company":"","location":"","description":"","apply_url":"https://...","salary":"","job_type":"Full-time/Part-time/Contract/Internship","remote":false,"date_posted":"2 days ago","source":"${useAllSources ? "LinkedIn/Indeed/Glassdoor/etc" : "Company Careers/Greenhouse/Lever/Workday"}","experience_level":"Entry-Level/Mid-Level/Senior/Executive"}]}
CRITICAL RULES:
- ONLY return jobs located in the United States — absolutely NO jobs from India, Canada, UK, Europe, Asia, or any other country
- Every location MUST be a US city/state (e.g. "San Francisco, CA", "New York, NY", "Remote (US)")
- If a job is remote, it must be US-based remote — mark location as "Remote (US)" not just "Remote"
- DESCRIPTION RULES: Each job MUST include a detailed description (5-10 sentences) pulled directly from the actual job posting. Include the real responsibilities, requirements, qualifications, and any listed benefits. Do NOT summarize or paraphrase — use the actual content from the job posting as closely as possible. Never leave the description empty.
- Find as many REAL job listings as possible — aim for 15-20 jobs minimum
${sourceInstruction}
- Every job MUST have a real, clickable apply_url — NOT a generic homepage. The URL should go directly to the job application page.
- DATE RULES: Today is ${todayStr}. For date_posted, calculate relative time from TODAY and use labels like "Today", "1 day ago", "2 days ago", "3 days ago", "1 week ago", "2 weeks ago", "1 month ago", etc. NEVER use exact calendar dates. If a job posting says it was posted on a specific date, calculate how many days ago that was from today (${todayStr}) and use the relative label. If you cannot determine when a job was posted, use "Recently". NEVER return a future date.
- EXPERIENCE LEVEL: For each job, determine the experience_level from the job title and requirements. Use EXACTLY one of: "Internship", "Entry-Level", "Mid-Level", "Senior", "Executive"
- Do NOT make up or fabricate jobs — only return real current listings
- Include salary info when available (in USD)
- Each job must have a different company or be a distinctly different role
- Return ONLY the JSON object`;

    const paginationHint = pageNum > 1
      ? ` This is page ${pageNum} of search results — return DIFFERENT jobs than typical first-page results. Focus on additional companies, smaller/newer companies, and less-common job boards. Do NOT repeat commonly shown listings.`
      : "";

    const userPrompt = useAllSources
      ? `Search ALL major US job boards (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, Built In, SimplyHired, company career pages) and find real job listings in the UNITED STATES ONLY for: ${parts.join(", ")}. Find at least 15-20 different jobs from different US-based companies and different job board sources. Do NOT include any jobs from outside the United States.${resumeHint}${paginationHint}`
      : `Search company career pages, Greenhouse, Lever, Workday, and direct employer hiring portals to find real job listings in the UNITED STATES ONLY for: ${parts.join(", ")}. Find at least 15-20 different jobs posted directly by companies on their own career sites. Do NOT include results from job board aggregators like Indeed, LinkedIn, ZipRecruiter, Glassdoor, SimplyHired, or Monster. Only return jobs from direct company career pages and employer ATS platforms. Do NOT include any jobs from outside the United States.${resumeHint}${paginationHint}`;

    // Map date filter
    let recencyFilter = "month";
    if (date_posted === "today") recencyFilter = "day";
    else if (date_posted === "3days" || date_posted === "week") recencyFilter = "week";

    // Call Perplexity with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const perplexityResponse = await fetch(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cachedPerplexityKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 8000,
            temperature: 0.0,
            search_recency_filter: recencyFilter,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!perplexityResponse.ok) {
        const errText = await perplexityResponse.text();
        console.error("Perplexity API error:", errText);
        return new Response(
          JSON.stringify({ error: "Search service temporarily unavailable", details: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const perplexityData = await perplexityResponse.json();
      const content = perplexityData.choices?.[0]?.message?.content || "";
      const citations = perplexityData.citations || [];

      // Parse jobs
      let jobs: any[] = [];
      try {
        const jsonMatch = content.match(/\{[\s\S]*"jobs"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          jobs = parsed.jobs || [];
        }
      } catch (parseErr) {
        console.error("Failed to parse Perplexity response:", parseErr);
        try {
          const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          jobs = parsed.jobs || [];
        } catch {
          console.error("Fallback parse also failed");
        }
      }

      // ── 3. Quality validation + categorization ────────────────────────
      const validatedJobs: any[] = [];
      let rejectedCount = 0;

      for (const job of jobs.slice(0, 30)) {
        const check = validateJob(job);
        if (!check.valid) {
          console.log(`Rejected job: ${job.title || "?"} at ${job.company || "?"} — ${check.reason}`);
          rejectedCount++;
          continue;
        }

        // Auto-classify
        const roleCategory = classifyRoleCategory(job.title || "", job.description || "");
        const expLevel = job.experience_level || detectExperienceLevel(job.title || "", job.description || "");
        const industry = detectIndustry(job.company || "", job.description || "");

        validatedJobs.push({
          ...job,
          role_category: roleCategory,
          experience_level: expLevel,
          industry: industry,
        });
      }

      const passRate = jobs.length > 0 ? Math.round((validatedJobs.length / jobs.length) * 100) : 0;
      console.log(`Quality: ${validatedJobs.length}/${jobs.length} passed (${passRate}%), ${rejectedCount} rejected`);

      // ── 4. Save to cached_jobs ────────────────────────────────────────
      const normalizedJobs: any[] = [];
      const jobIds: string[] = [];

      for (const job of validatedJobs.slice(0, 25)) {
        const fp = jobFingerprint(job);

        const jobRow = {
          title: job.title || "Unknown Title",
          company: job.company || "Unknown Company",
          location: job.location || "Not specified",
          description: job.description || "",
          apply_url: job.apply_url || job.url || "",
          salary: job.salary || null,
          job_type: job.job_type || null,
          remote: job.remote || false,
          date_posted: sanitizeDatePosted(job.date_posted || "Recent"),
          source: job.source || "Web Search",
          role_category: job.role_category || "Other",
          experience_level: job.experience_level || "Mid-Level",
          industry: job.industry || null,
          job_fingerprint: fp,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const { data: upserted, error: upsertErr } = await sb
          .from("cached_jobs")
          .upsert(jobRow, { onConflict: "job_fingerprint", ignoreDuplicates: false })
          .select("id")
          .single();

        if (upserted) {
          jobIds.push(upserted.id);
          normalizedJobs.push({
            id: upserted.id, ...jobRow,
            job_fingerprint: undefined, expires_at: undefined,
          });
        } else if (upsertErr) {
          const { data: existing } = await sb
            .from("cached_jobs")
            .select("id")
            .eq("job_fingerprint", fp)
            .single();
          if (existing) {
            jobIds.push(existing.id);
            normalizedJobs.push({
              id: existing.id, ...jobRow,
              job_fingerprint: undefined, expires_at: undefined,
            });
          }
        }
      }

      // ── 5. Fire-and-forget bridge to `jobs` table ─────────────────────
      const bridgeRows = normalizedJobs.map((job: any) => {
        const fp = jobFingerprint({ title: job.title, company: job.company, location: job.location });
        let salaryMin: number | null = null;
        let salaryMax: number | null = null;
        if (job.salary) {
          const nums = job.salary.match(/(\d[\d,]*)/g);
          if (nums && nums.length >= 1) {
            salaryMin = parseInt(nums[0].replace(/,/g, ""), 10);
            if (job.salary.toLowerCase().includes("k")) salaryMin *= 1000;
            else if (salaryMin < 1000) salaryMin *= 1000;
          }
          if (nums && nums.length >= 2) {
            salaryMax = parseInt(nums[1].replace(/,/g, ""), 10);
            if (job.salary.toLowerCase().includes("k")) salaryMax *= 1000;
            else if (salaryMax < 1000) salaryMax *= 1000;
          }
        }
        return {
          title: job.title, company: job.company, location: job.location,
          description: job.description, apply_url: job.apply_url,
          salary_min: salaryMin, salary_max: salaryMax,
          job_type: job.job_type, remote: job.remote,
          date_posted: relativeDateToTimestamp(job.date_posted),
          source: job.source || "Web Search",
          role_category: job.role_category || "Other",
          experience_level: job.experience_level || "Mid-Level",
          industry: job.industry || null,
          external_id: `search_${fp}`,
        };
      });
      sb.from("jobs").upsert(bridgeRows, { onConflict: "external_id" }).then(
        () => console.log(`Bridged ${bridgeRows.length} jobs to jobs table`),
        (err: any) => console.error("Bridge to jobs table failed:", err)
      );

      // ── 6. Save search→job mapping ────────────────────────────────────
      if (jobIds.length > 0) {
        await sb.from("search_cache").insert({
          search_key: searchKey,
          query: searchQuery,
          location: location || null,
          salary_range: salary_range || null,
          job_type: job_type || null,
          date_posted: date_posted || null,
          job_ids: jobIds,
          result_count: jobIds.length,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Mark jobs as seen by user
      if (user_id && normalizedJobs.length > 0) {
        const seenInserts = normalizedJobs.map((j: any) => ({
          user_id,
          job_fingerprint: jobFingerprint({ title: j.title, company: j.company, location: j.location }),
        }));
        await sb
          .from("user_seen_jobs")
          .upsert(seenInserts, { onConflict: "user_id,job_fingerprint" })
          .select();
      }

      const finalJobs = normalizedJobs;
      const elapsed = Date.now() - startTime;

      // Count source diversity
      const sources = new Set(finalJobs.map((j: any) => (j.source || "").toLowerCase()));
      console.log(`Cache MISS: ${finalJobs.length} jobs from ${sources.size} sources in ${elapsed}ms (quality: ${passRate}%)`);

      return new Response(
        JSON.stringify({
          jobs: finalJobs,
          total: finalJobs.length,
          citations,
          query: searchQuery,
          elapsed_ms: elapsed,
          from_cache: false,
          quality_pass_rate: passRate,
          sources_count: sources.size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        console.error("Perplexity API timed out after 25s");
        return new Response(
          JSON.stringify({ error: "Search timed out. Please try a simpler query.", timed_out: true }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw fetchErr;
    }
  } catch (err) {
    console.error("perplexity-job-search error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

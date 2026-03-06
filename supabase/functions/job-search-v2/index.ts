// Job Search V2 - Multi-source job aggregation
// Sources: JSearch (RapidAPI, if key available), Remotive (free), Arbeitnow (free), FindWork (free)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NormalizedJob {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  location: string;
  description: string;
  apply_url: string;
  date_posted: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string | null;
  remote: boolean;
  source: string;
  tags?: string[];
}

interface SearchFilters {
  query?: string;
  location?: string;
  jobType?: string;
  remote?: boolean;
  datePosted?: string;
  page?: number;
}

// ─── JSearch (RapidAPI, paid) ───────────────────────────────────────
async function searchJSearch(apiKey: string, filters: SearchFilters): Promise<NormalizedJob[]> {
  try {
    const query = filters.query || "software engineer";
    const params = new URLSearchParams({
      query: filters.location ? `${query} in ${filters.location}` : query,
      page: String(filters.page || 1),
      num_pages: "1",
      date_posted: filters.datePosted || "week",
    });

    if (filters.remote) params.set("remote_jobs_only", "true");
    if (filters.jobType && filters.jobType !== "all") {
      params.set("employment_types", filters.jobType.toUpperCase());
    }

    const response = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      console.error(`JSearch error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.data || []).map((job: any) => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      logo: job.employer_logo,
      location: job.job_is_remote
        ? "Remote"
        : [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", "),
      description: job.job_description?.substring(0, 500) || "",
      apply_url: job.job_apply_link,
      date_posted: job.job_posted_at_datetime_utc,
      salary_min: job.job_min_salary,
      salary_max: job.job_max_salary,
      job_type: job.job_employment_type,
      remote: job.job_is_remote,
      source: "jsearch",
    }));
  } catch (e) {
    console.error("JSearch fetch error:", e);
    return [];
  }
}

// ─── Remotive (free, remote jobs) ──────────────────────────────────
async function searchRemotive(query: string): Promise<NormalizedJob[]> {
  try {
    // Remotive doesn't handle multi-word phrases well — use the first
    // meaningful keyword for search, then filter results client-side.
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => !["in", "at", "the", "a", "an", "for", "and", "or", "of", "with"].includes(w));

    // Try each keyword until we get results (Remotive is picky)
    let allJobs: any[] = [];
    for (const keyword of keywords.slice(0, 3)) {
      const params = new URLSearchParams({ search: keyword, limit: "20" });
      const response = await fetch(`https://remotive.com/api/remote-jobs?${params}`);
      if (!response.ok) continue;
      const data = await response.json();
      if (data.jobs && data.jobs.length > 0) {
        allJobs = data.jobs;
        break;
      }
    }

    // If keyword search found nothing, get latest remote jobs (no search filter)
    if (allJobs.length === 0) {
      const response = await fetch(`https://remotive.com/api/remote-jobs?limit=20`);
      if (response.ok) {
        const data = await response.json();
        allJobs = data.jobs || [];
      }
    }

    return allJobs.slice(0, 15).map((job: any) => ({
      id: `remotive-${job.id}`,
      title: job.title,
      company: job.company_name,
      logo: job.company_logo || null,
      location: job.candidate_required_location || "Remote",
      description: (job.description || "").replace(/<[^>]*>/g, "").substring(0, 500),
      apply_url: job.url,
      date_posted: job.publication_date,
      salary_min: null,
      salary_max: null,
      job_type: job.job_type,
      remote: true,
      source: "remotive",
      tags: job.tags || [],
    }));
  } catch (e) {
    console.error("Remotive fetch error:", e);
    return [];
  }
}

// ─── Arbeitnow (free, international) ──────────────────────────────
async function searchArbeitnow(query: string, page: number = 1): Promise<NormalizedJob[]> {
  try {
    const params = new URLSearchParams({
      search: query,
      page: String(page),
      per_page: "15",
    });
    const response = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.data || []).slice(0, 15).map((job: any) => ({
      id: `arbeitnow-${job.slug}`,
      title: job.title,
      company: job.company_name,
      logo: null,
      location: job.location || job.remote ? "Remote" : "Unknown",
      description: (job.description || "").replace(/<[^>]*>/g, "").substring(0, 500),
      apply_url: job.url,
      date_posted: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      salary_min: null,
      salary_max: null,
      job_type: null,
      remote: job.remote || false,
      source: "arbeitnow",
      tags: job.tags || [],
    }));
  } catch (e) {
    console.error("Arbeitnow fetch error:", e);
    return [];
  }
}

// ─── FindWork.dev (free, tech-focused) ─────────────────────────────
async function searchFindWork(query: string): Promise<NormalizedJob[]> {
  try {
    const params = new URLSearchParams({ search: query, order_by: "-date_posted" });
    const response = await fetch(`https://findwork.dev/api/jobs/?${params}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data.results || []).slice(0, 10).map((job: any) => ({
      id: `findwork-${job.id}`,
      title: job.role,
      company: job.company_name,
      logo: job.logo || null,
      location: job.location || (job.remote ? "Remote" : "Unknown"),
      description: (job.text || "").replace(/<[^>]*>/g, "").substring(0, 500),
      apply_url: job.url,
      date_posted: job.date_posted,
      salary_min: null,
      salary_max: null,
      job_type: job.employment_type,
      remote: job.remote || false,
      source: "findwork",
      tags: job.keywords || [],
    }));
  } catch (e) {
    console.error("FindWork fetch error:", e);
    return [];
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, location, jobType, remote, datePosted, page, resumeText } = await req.json();

    // Try env var first, then fall back to Supabase vault
    let JSEARCH_API_KEY = Deno.env.get("RAPIDAPI_KEY") || Deno.env.get("JSEARCH_API_KEY");

    if (!JSEARCH_API_KEY) {
      try {
        // Query vault.decrypted_secrets via PostgREST REST API directly
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const vaultResp = await fetch(
          `${supabaseUrl}/rest/v1/rpc/vault_read_secret`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ secret_name: "RAPIDAPI_KEY" }),
          }
        );
        if (vaultResp.ok) {
          const vaultData = await vaultResp.json();
          if (vaultData && typeof vaultData === "string") {
            JSEARCH_API_KEY = vaultData;
            console.log("[JobSearchV2] Loaded RAPIDAPI_KEY from vault RPC");
          } else if (Array.isArray(vaultData) && vaultData[0]?.decrypted_secret) {
            JSEARCH_API_KEY = vaultData[0].decrypted_secret;
            console.log("[JobSearchV2] Loaded RAPIDAPI_KEY from vault RPC (array)");
          }
        }
      } catch (e) {
        console.log("[JobSearchV2] Vault lookup skipped:", (e as Error).message);
      }
    }

    // Fallback: query vault.decrypted_secrets directly via SQL if RPC failed
    if (!JSEARCH_API_KEY) {
      try {
        const vaultClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { db: { schema: "vault" } }
        );
        const { data: secrets } = await vaultClient
          .from("decrypted_secrets")
          .select("decrypted_secret")
          .eq("name", "RAPIDAPI_KEY")
          .limit(1)
          .single();
        if (secrets?.decrypted_secret) {
          JSEARCH_API_KEY = secrets.decrypted_secret;
          console.log("[JobSearchV2] Loaded RAPIDAPI_KEY from vault schema");
        }
      } catch (e) {
        console.log("[JobSearchV2] Vault schema lookup skipped:", (e as Error).message);
      }
    }

    // Build search query from resume if no explicit query
    let searchQuery = query;
    if (!searchQuery && resumeText) {
      const titleMatch = resumeText.match(/(?:title|position|role|objective)[\s:]+([^\n]+)/i);
      const skillsMatch = resumeText.match(/(?:skills?)[\s:]+([^\n]+)/gi);
      searchQuery = titleMatch?.[1] || (skillsMatch ? skillsMatch[0].replace(/skills?\s*:?\s*/i, "") : "software engineer");
    }

    const filters: SearchFilters = {
      query: searchQuery || "software engineer",
      location,
      jobType,
      remote,
      datePosted: datePosted || "month",
      page: page || 1,
    };

    console.log(`[JobSearchV2] Query: "${filters.query}", Location: "${filters.location}", Remote: ${filters.remote}`);

    // Fetch from all available sources in parallel
    const promises: Promise<NormalizedJob[]>[] = [];
    const sourceNames: string[] = [];

    if (JSEARCH_API_KEY) {
      promises.push(searchJSearch(JSEARCH_API_KEY, filters));
      sourceNames.push("jsearch");
    }

    // Always include free sources
    promises.push(searchRemotive(filters.query || "developer"));
    sourceNames.push("remotive");

    promises.push(searchArbeitnow(filters.query || "software engineer", filters.page));
    sourceNames.push("arbeitnow");

    promises.push(searchFindWork(filters.query || "software engineer"));
    sourceNames.push("findwork");

    const results = await Promise.allSettled(promises);
    const allJobs: NormalizedJob[] = [];

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        console.log(`[JobSearchV2] ${sourceNames[i]}: ${result.value.length} jobs`);
        allJobs.push(...result.value);
      } else {
        console.error(`[JobSearchV2] ${sourceNames[i]} failed:`, result.reason);
      }
    });

    // Deduplicate by title + company (case-insensitive)
    const seen = new Set<string>();
    const uniqueJobs = allJobs.filter((job) => {
      const key = `${job.title.toLowerCase().trim()}-${job.company.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date posted (newest first), nulls last
    uniqueJobs.sort((a, b) => {
      const dateA = a.date_posted ? new Date(a.date_posted).getTime() : 0;
      const dateB = b.date_posted ? new Date(b.date_posted).getTime() : 0;
      return dateB - dateA;
    });

    console.log(`[JobSearchV2] Total: ${uniqueJobs.length} unique jobs from ${sourceNames.length} sources`);

    // Optionally store jobs in Supabase for caching
    if (uniqueJobs.length > 0) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const jobsToInsert = uniqueJobs.slice(0, 50).map((job) => ({
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          apply_url: job.apply_url,
          source: job.source,
          date_posted: job.date_posted || new Date().toISOString(),
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          job_type: job.job_type,
          remote: job.remote,
          employer_logo: job.logo,
          external_id: job.id,
        }));

        await supabase.from("jobs").upsert(jobsToInsert, { onConflict: "external_id", ignoreDuplicates: true });
      } catch (e) {
        console.error("Failed to cache jobs:", e);
      }
    }

    return new Response(JSON.stringify({
      jobs: uniqueJobs,
      total: uniqueJobs.length,
      page: filters.page,
      sources: sourceNames.filter((_, i) => results[i].status === "fulfilled"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Job search error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

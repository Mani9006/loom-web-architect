// Job Search V2 - Uses JSearch API (RapidAPI) + Remotive for real job listings
// Replaces Exa.ai with proper job aggregation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo: string | null;
  job_city: string;
  job_state: string;
  job_country: string;
  job_description: string;
  job_apply_link: string;
  job_posted_at_datetime_utc: string;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_employment_type: string;
  job_is_remote: boolean;
}

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  url: string;
  description: string;
  publication_date: string;
  salary: string;
  job_type: string;
  candidate_required_location: string;
}

interface SearchFilters {
  query?: string;
  location?: string;
  jobType?: string;
  remote?: boolean;
  datePosted?: string;
  page?: number;
}

// Fetch jobs from JSearch API (RapidAPI)
async function searchJSearch(apiKey: string, filters: SearchFilters): Promise<any[]> {
  try {
    const query = filters.query || "software engineer";
    const params = new URLSearchParams({
      query: filters.location ? `${query} in ${filters.location}` : query,
      page: String(filters.page || 1),
      num_pages: "1",
      date_posted: filters.datePosted || "week",
    });

    if (filters.remote) {
      params.set("remote_jobs_only", "true");
    }
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
    return (data.data || []).map((job: JSearchJob) => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      logo: job.employer_logo,
      location: job.job_is_remote
        ? "Remote"
        : [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", "),
      description: job.job_description?.substring(0, 500),
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

// Fetch remote jobs from Remotive (free API)
async function searchRemotive(query: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ search: query, limit: "10" });
    const response = await fetch(`https://remotive.com/api/remote-jobs?${params}`);

    if (!response.ok) return [];

    const data = await response.json();
    return (data.jobs || []).slice(0, 10).map((job: RemotiveJob) => ({
      id: `remotive-${job.id}`,
      title: job.title,
      company: job.company_name,
      logo: null,
      location: job.candidate_required_location || "Remote",
      description: job.description?.replace(/<[^>]*>/g, "").substring(0, 500),
      apply_url: job.url,
      date_posted: job.publication_date,
      salary_min: null,
      salary_max: null,
      job_type: job.job_type,
      remote: true,
      source: "remotive",
    }));
  } catch (e) {
    console.error("Remotive fetch error:", e);
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

    const JSEARCH_API_KEY = Deno.env.get("RAPIDAPI_KEY") || Deno.env.get("JSEARCH_API_KEY");

    // Build search query from resume if no explicit query
    let searchQuery = query;
    if (!searchQuery && resumeText) {
      // Extract likely job title from resume
      const titleMatch = resumeText.match(/(?:title|position|role|objective)[\s:]+([^\n]+)/i);
      const skillsMatch = resumeText.match(/(?:skills?)[\s:]+([^\n]+)/gi);
      searchQuery = titleMatch?.[1] || (skillsMatch ? skillsMatch[0].replace(/skills?\s*:?\s*/i, "") : "software engineer");
    }

    const filters: SearchFilters = {
      query: searchQuery || "software engineer",
      location,
      jobType,
      remote,
      datePosted: datePosted || "week",
      page: page || 1,
    };

    console.log(`[JobSearchV2] Query: "${filters.query}", Location: "${filters.location}", Remote: ${filters.remote}`);

    // Fetch from multiple sources in parallel
    const promises: Promise<any[]>[] = [];

    if (JSEARCH_API_KEY) {
      promises.push(searchJSearch(JSEARCH_API_KEY, filters));
    }

    // Always include Remotive for remote jobs
    if (remote || !location) {
      promises.push(searchRemotive(filters.query || "developer"));
    }

    const results = await Promise.all(promises);
    const allJobs = results.flat();

    // Deduplicate by title + company
    const seen = new Set<string>();
    const uniqueJobs = allJobs.filter((job) => {
      const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date posted (newest first)
    uniqueJobs.sort((a, b) => {
      const dateA = a.date_posted ? new Date(a.date_posted).getTime() : 0;
      const dateB = b.date_posted ? new Date(b.date_posted).getTime() : 0;
      return dateB - dateA;
    });

    console.log(`[JobSearchV2] Found ${uniqueJobs.length} unique jobs from ${promises.length} sources`);

    // Optionally store jobs in Supabase for caching
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    if (uniqueJobs.length > 0) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const jobsToInsert = uniqueJobs.map((job) => ({
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

        // Upsert to avoid duplicates
        await supabase.from("jobs").upsert(jobsToInsert, { onConflict: "external_id", ignoreDuplicates: true });
      } catch (e) {
        console.error("Failed to cache jobs:", e);
        // Non-blocking — still return results
      }
    }

    return new Response(JSON.stringify({
      jobs: uniqueJobs,
      total: uniqueJobs.length,
      page: filters.page,
      sources: JSEARCH_API_KEY ? ["jsearch", "remotive"] : ["remotive"],
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

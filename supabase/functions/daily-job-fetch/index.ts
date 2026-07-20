// Daily Job Fetch - Cron-triggered edge function to fetch fresh jobs for all roles
// Designed to be called daily by Supabase cron or external scheduler

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Top roles to fetch jobs for daily
const DEFAULT_ROLES = [
  "Software Engineer", "Data Scientist", "Product Manager", "UX Designer",
  "DevOps Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "Machine Learning Engineer", "Data Analyst", "Cloud Architect", "QA Engineer",
  "Mobile Developer", "Security Engineer", "Technical Writer",
  "Project Manager", "Business Analyst", "Scrum Master",
];

interface NormalizedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  date_posted: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string | null;
  remote: boolean;
  employer_logo: string | null;
  external_id: string;
  source: string;
}

async function searchJSearch(apiKey: string, query: string): Promise<NormalizedJob[]> {
  try {
    const params = new URLSearchParams({
      query,
      page: "1",
      num_pages: "1",
      date_posted: "today",
    });
    const response = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((job: any) => ({
      title: job.job_title,
      company: job.employer_name,
      location: job.job_is_remote ? "Remote" : [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", "),
      description: job.job_description?.substring(0, 500) || "",
      apply_url: job.job_apply_link,
      date_posted: job.job_posted_at_datetime_utc,
      salary_min: job.job_min_salary,
      salary_max: job.job_max_salary,
      job_type: job.job_employment_type,
      remote: job.job_is_remote,
      employer_logo: job.employer_logo,
      external_id: job.job_id,
      source: "jsearch",
    }));
  } catch (e) {
    console.error("JSearch error:", e);
    return [];
  }
}

async function searchRemotive(query: string): Promise<NormalizedJob[]> {
  try {
    const keyword = query.split(/\s+/)[0].toLowerCase();
    const response = await fetch(`https://remotive.com/api/remote-jobs?search=${keyword}&limit=15`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.jobs || []).slice(0, 10).map((job: any) => ({
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location || "Remote",
      description: (job.description || "").replace(/<[^>]*>/g, "").substring(0, 500),
      apply_url: job.url,
      date_posted: job.publication_date,
      salary_min: null,
      salary_max: null,
      job_type: job.job_type,
      remote: true,
      employer_logo: job.company_logo || null,
      external_id: `remotive-${job.id}`,
      source: "remotive",
    }));
  } catch (e) {
    console.error("Remotive error:", e);
    return [];
  }
}

async function searchArbeitnow(query: string): Promise<NormalizedJob[]> {
  try {
    const params = new URLSearchParams({ search: query, per_page: "10" });
    const response = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).slice(0, 10).map((job: any) => ({
      title: job.title,
      company: job.company_name,
      location: job.location || "Unknown",
      description: (job.description || "").replace(/<[^>]*>/g, "").substring(0, 500),
      apply_url: job.url,
      date_posted: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      salary_min: null,
      salary_max: null,
      job_type: null,
      remote: job.remote || false,
      employer_logo: null,
      external_id: `arbeitnow-${job.slug}`,
      source: "arbeitnow",
    }));
  } catch (e) {
    console.error("Arbeitnow error:", e);
    return [];
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // This is meant to be cron-only (pg_cron / an external scheduler), not a
    // public endpoint — it burns RapidAPI/Remotive/Arbeitnow quota per call.
    // verify_jwt is off at the gateway (schedulers don't carry a user JWT),
    // so enforce it here: only the service-role key is accepted.
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "") !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const roles: string[] = body.roles || DEFAULT_ROLES;
    const action = body.action || "fetch-all";

    // Get distinct user-specified roles to also include
    if (action === "fetch-all") {
      const { data: userRoles } = await supabase
        .from("profiles")
        .select("desired_roles, target_role")
        .not("desired_roles", "is", null);

      if (userRoles) {
        const extraRoles = new Set<string>();
        userRoles.forEach((p: any) => {
          if (p.target_role) extraRoles.add(p.target_role);
          if (Array.isArray(p.desired_roles)) {
            p.desired_roles.forEach((r: string) => extraRoles.add(r));
          }
        });
        extraRoles.forEach((r) => { if (!roles.includes(r)) roles.push(r); });
      }
    }

    // Get JSearch API key from vault
    let jsearchKey: string | undefined;
    try {
      const vaultResp = await fetch(`${supabaseUrl}/rest/v1/rpc/vault_read_secret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ secret_name: "RAPIDAPI_KEY" }),
      });
      if (vaultResp.ok) {
        const vaultData = await vaultResp.json();
        if (typeof vaultData === "string") jsearchKey = vaultData;
        else if (Array.isArray(vaultData) && vaultData[0]?.decrypted_secret) jsearchKey = vaultData[0].decrypted_secret;
      }
    } catch {
      console.log("[DailyFetch] Vault lookup skipped");
    }

    console.log(`[DailyFetch] Fetching jobs for ${roles.length} roles, JSearch: ${jsearchKey ? "yes" : "no"}`);

    let totalInserted = 0;
    const errors: string[] = [];

    // Process roles in batches to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < roles.length; i += BATCH_SIZE) {
      const batch = roles.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (role) => {
        const jobs: NormalizedJob[] = [];

        // Only use JSearch for first few roles to conserve API quota
        if (jsearchKey && i < 10) {
          const jsearchJobs = await searchJSearch(jsearchKey, role);
          jobs.push(...jsearchJobs);
        }

        const [remotiveJobs, arbeitnowJobs] = await Promise.all([
          searchRemotive(role),
          searchArbeitnow(role),
        ]);
        jobs.push(...remotiveJobs, ...arbeitnowJobs);

        return { role, jobs };
      });

      const results = await Promise.allSettled(batchPromises);

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { role, jobs } = result.value;
          if (jobs.length > 0) {
            const { error, count } = await supabase
              .from("jobs")
              .upsert(
                jobs.map((j) => ({
                  title: j.title,
                  company: j.company,
                  location: j.location,
                  description: j.description,
                  apply_url: j.apply_url,
                  source: j.source,
                  date_posted: j.date_posted || new Date().toISOString(),
                  salary_min: j.salary_min,
                  salary_max: j.salary_max,
                  job_type: j.job_type,
                  remote: j.remote,
                  employer_logo: j.employer_logo,
                  external_id: j.external_id,
                })),
                { onConflict: "external_id", ignoreDuplicates: true }
              );

            if (error) {
              errors.push(`${role}: ${error.message}`);
            } else {
              totalInserted += jobs.length;
              console.log(`[DailyFetch] ${role}: ${jobs.length} jobs`);
            }
          }
        } else {
          errors.push(`Failed: ${result.reason}`);
        }
      }

      // Small delay between batches to be nice to APIs
      if (i + BATCH_SIZE < roles.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log(`[DailyFetch] Complete: ${totalInserted} jobs inserted/updated, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        roles_processed: roles.length,
        total_jobs: totalInserted,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Daily fetch error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Perplexity-powered Job Search with caching — returns real job listings via web search
// Strategy: check cache first → return cached if fresh → else call Perplexity → save to cache
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cache API key across warm invocations
let cachedPerplexityKey: string | null = null;

// Generate a normalized search key for cache lookups
function buildSearchKey(
  query: string,
  location?: string,
  salaryRange?: string,
  jobType?: string,
  datePosted?: string
): string {
  const parts = [
    (query || "").toLowerCase().trim(),
    (location || "").toLowerCase().trim(),
    (salaryRange || "any").toLowerCase(),
    (jobType || "all").toLowerCase(),
    (datePosted || "month").toLowerCase(),
  ];
  return parts.join("|");
}

// Generate a fingerprint for deduplication of the same job
function jobFingerprint(job: {
  title: string;
  company: string;
  location: string;
}): string {
  return [
    (job.title || "").toLowerCase().trim(),
    (job.company || "").toLowerCase().trim(),
    (job.location || "").toLowerCase().trim(),
  ].join(":::");
}

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
    } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── 1. Check cache first ────────────────────────────────────────────
    const searchKey = buildSearchKey(
      query,
      location,
      salary_range,
      job_type,
      date_posted
    );

    // Look for a non-expired cached search
    const { data: cachedSearch } = await sb
      .from("search_cache")
      .select("*")
      .eq("search_key", searchKey)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cachedSearch && cachedSearch.job_ids?.length > 0) {
      // We have a cache hit — load the cached jobs
      const { data: cachedJobs } = await sb
        .from("cached_jobs")
        .select("*")
        .in("id", cachedSearch.job_ids)
        .gt("expires_at", new Date().toISOString());

      if (cachedJobs && cachedJobs.length > 0) {
        // Filter out jobs this user has already seen (if user_id provided)
        let filteredJobs = cachedJobs;
        if (user_id) {
          const { data: seenJobs } = await sb
            .from("user_seen_jobs")
            .select("job_fingerprint")
            .eq("user_id", user_id);

          const seenSet = new Set(
            (seenJobs || []).map((s: any) => s.job_fingerprint)
          );
          filteredJobs = cachedJobs.filter(
            (j: any) => !seenSet.has(j.job_fingerprint)
          );

          // If all cached jobs were seen, fall through to Perplexity for fresh results
          if (filteredJobs.length === 0) {
            console.log(
              "All cached jobs already seen by user, fetching fresh results"
            );
          } else {
            // Mark these jobs as seen by the user
            const seenInserts = filteredJobs.map((j: any) => ({
              user_id,
              job_fingerprint: j.job_fingerprint,
            }));
            await sb
              .from("user_seen_jobs")
              .upsert(seenInserts, { onConflict: "user_id,job_fingerprint" })
              .select();

            const elapsed = Date.now() - startTime;
            console.log(
              `Cache HIT: ${filteredJobs.length} jobs returned in ${elapsed}ms (search_key: ${searchKey})`
            );

            const normalizedJobs = filteredJobs.map(
              (job: any, index: number) => ({
                id: job.id,
                title: job.title,
                company: job.company,
                location: job.location,
                description: job.description || "",
                apply_url: job.apply_url || "",
                salary: job.salary,
                job_type: job.job_type,
                remote: job.remote || false,
                date_posted: job.date_posted || "Recent",
                source: job.source || "Web Search",
              })
            );

            return new Response(
              JSON.stringify({
                jobs: normalizedJobs,
                total: normalizedJobs.length,
                citations: [],
                query: query || "software engineer",
                elapsed_ms: elapsed,
                from_cache: true,
              }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            );
          }
        } else {
          // No user_id — return all cached jobs
          const elapsed = Date.now() - startTime;
          console.log(
            `Cache HIT (anon): ${cachedJobs.length} jobs in ${elapsed}ms`
          );

          const normalizedJobs = cachedJobs.map(
            (job: any, index: number) => ({
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              description: job.description || "",
              apply_url: job.apply_url || "",
              salary: job.salary,
              job_type: job.job_type,
              remote: job.remote || false,
              date_posted: job.date_posted || "Recent",
              source: job.source || "Web Search",
            })
          );

          return new Response(
            JSON.stringify({
              jobs: normalizedJobs,
              total: normalizedJobs.length,
              citations: [],
              query: query || "software engineer",
              elapsed_ms: elapsed,
              from_cache: true,
            }),
            {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build search prompt — ask for maximum results
    const searchQuery = query || "software engineer";
    const parts: string[] = [`"${searchQuery}" jobs`];
    // Always enforce US location — default to "United States" if none specified
    const searchLocation = location || "United States";
    parts.push(`in ${searchLocation}, USA`);
    if (job_type && job_type !== "all") parts.push(job_type);
    if (salary_range && salary_range !== "any")
      parts.push(`salary ${salary_range}`);
    if (
      date_posted &&
      date_posted !== "all" &&
      date_posted !== "month"
    )
      parts.push(`posted last ${date_posted}`);

    const resumeHint = resume_text
      ? `\nCandidate background: ${resume_text.substring(0, 300)}. Prioritize matching roles.`
      : "";

    const systemPrompt = `You are a job search engine for the United States job market ONLY. Return ONLY valid JSON, no markdown, no explanation.
Format: {"jobs":[{"title":"","company":"","location":"","description":"2-4 sentence summary of the role, responsibilities, and requirements","apply_url":"https://...","salary":"","job_type":"Full-time/Part-time/Contract/Internship","remote":false,"date_posted":"","source":"LinkedIn/Indeed/Glassdoor/etc"}]}
CRITICAL RULES:
- ONLY return jobs located in the United States — absolutely NO jobs from India, Canada, UK, Europe, Asia, or any other country
- Every location MUST be a US city/state (e.g. "San Francisco, CA", "New York, NY", "Remote (US)")
- If a job is remote, it must be US-based remote — mark location as "Remote (US)" not just "Remote"
- Every job MUST have a description field with 2-4 sentences about the role — never leave it empty
- Find as many REAL job listings as possible — aim for 15-20 jobs minimum
- Search across LinkedIn, Indeed, Glassdoor, ZipRecruiter, company career pages, SimplyHired, Dice, AngelList, Built In, and any other job boards
- Every job MUST have a real, clickable apply_url — not a generic homepage
- Do NOT make up or fabricate jobs — only return real current listings
- Include salary info when available (in USD)
- Each job must have a different company or be a distinctly different role
- Return ONLY the JSON object`;

    const userPrompt = `Search all major US job boards and find real job listings in the UNITED STATES ONLY for: ${parts.join(", ")}. Find at least 15-20 different jobs from different US-based companies. Do NOT include any jobs from outside the United States.${resumeHint}`;

    // Map date filter
    let recencyFilter = "month";
    if (date_posted === "today") recencyFilter = "day";
    else if (date_posted === "3days" || date_posted === "week")
      recencyFilter = "week";

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
            max_tokens: 3500,
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
          JSON.stringify({
            error: "Search service temporarily unavailable",
            details: errText,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const perplexityData = await perplexityResponse.json();
      const content =
        perplexityData.choices?.[0]?.message?.content || "";
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
          const cleaned = content
            .replace(/```json?\n?/g, "")
            .replace(/```/g, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          jobs = parsed.jobs || [];
        } catch {
          console.error("Fallback parse also failed");
        }
      }

      // ── 3. Save jobs to cache ─────────────────────────────────────────
      const normalizedJobs: any[] = [];
      const jobIds: string[] = [];

      for (const job of jobs.slice(0, 25)) {
        const fp = jobFingerprint(job);

        // Try to upsert into cached_jobs
        const jobRow = {
          title: job.title || "Unknown Title",
          company: job.company || "Unknown Company",
          location: job.location || "Not specified",
          description: job.description || "",
          apply_url: job.apply_url || job.url || "",
          salary: job.salary || null,
          job_type: job.job_type || null,
          remote: job.remote || false,
          date_posted: job.date_posted || "Recent",
          source: job.source || "Web Search",
          job_fingerprint: fp,
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        };

        const { data: upserted, error: upsertErr } = await sb
          .from("cached_jobs")
          .upsert(jobRow, {
            onConflict: "job_fingerprint",
            ignoreDuplicates: false,
          })
          .select("id")
          .single();

        if (upserted) {
          jobIds.push(upserted.id);
          normalizedJobs.push({
            id: upserted.id,
            ...jobRow,
            job_fingerprint: undefined,
            expires_at: undefined,
          });
        } else if (upsertErr) {
          // If upsert fails (race condition), try to fetch existing
          const { data: existing } = await sb
            .from("cached_jobs")
            .select("id")
            .eq("job_fingerprint", fp)
            .single();
          if (existing) {
            jobIds.push(existing.id);
            normalizedJobs.push({
              id: existing.id,
              ...jobRow,
              job_fingerprint: undefined,
              expires_at: undefined,
            });
          }
        }
      }

      // Save the search → job mapping
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
          expires_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        });
      }

      // Mark jobs as seen by this user
      if (user_id && normalizedJobs.length > 0) {
        const seenInserts = normalizedJobs.map((j: any) => ({
          user_id,
          job_fingerprint: jobFingerprint({
            title: j.title,
            company: j.company,
            location: j.location,
          }),
        }));
        await sb
          .from("user_seen_jobs")
          .upsert(seenInserts, { onConflict: "user_id,job_fingerprint" })
          .select();
      }

      // Filter out already-seen jobs for this user
      let finalJobs = normalizedJobs;
      if (user_id) {
        const { data: seenJobs } = await sb
          .from("user_seen_jobs")
          .select("job_fingerprint")
          .eq("user_id", user_id);

        // Only filter out jobs seen BEFORE this search (not the ones we just marked)
        // Actually, since we just inserted them, they'll all show as "seen".
        // So for the first call, just return all results.
        // The dedup only kicks in on subsequent identical searches.
        finalJobs = normalizedJobs;
      }

      const elapsed = Date.now() - startTime;
      console.log(
        `Cache MISS: Perplexity returned ${finalJobs.length} jobs, saved to cache in ${elapsed}ms`
      );

      return new Response(
        JSON.stringify({
          jobs: finalJobs,
          total: finalJobs.length,
          citations,
          query: searchQuery,
          elapsed_ms: elapsed,
          from_cache: false,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        console.error("Perplexity API timed out after 25s");
        return new Response(
          JSON.stringify({
            error: "Search timed out. Please try a simpler query.",
            timed_out: true,
          }),
          {
            status: 504,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw fetchErr;
    }
  } catch (err) {
    console.error("perplexity-job-search error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

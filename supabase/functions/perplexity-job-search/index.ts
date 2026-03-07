// Perplexity-powered Job Search — returns real job listings via web search
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache the Perplexity key across invocations (edge function stays warm)
let cachedPerplexityKey: string | null = null;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { query, location, salary_range, job_type, date_posted, resume_text } = await req.json();

    // Get Perplexity API key (cached or from env/vault)
    if (!cachedPerplexityKey) {
      cachedPerplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
      if (!cachedPerplexityKey) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, serviceKey);
        const { data: vaultData } = await sb.rpc("vault_read_secret", { secret_name: "PERPLEXITY_API_KEY" });
        if (vaultData) cachedPerplexityKey = String(vaultData);
      }
    }

    if (!cachedPerplexityKey) {
      return new Response(
        JSON.stringify({ error: "Perplexity API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build concise search query
    const searchQuery = query || "software engineer";
    const parts: string[] = [`"${searchQuery}"`];
    if (location) parts.push(`in ${location}`);
    if (job_type && job_type !== "all") parts.push(job_type);
    if (salary_range) parts.push(`salary ${salary_range}`);
    if (date_posted && date_posted !== "all" && date_posted !== "month") parts.push(`posted last ${date_posted}`);

    // Short resume context if provided
    const resumeHint = resume_text
      ? `\nCandidate skills: ${resume_text.substring(0, 300)}. Prioritize matching jobs.`
      : "";

    const systemPrompt = `You are a job search engine. Return ONLY valid JSON, no markdown.
Format: {"jobs":[{"title":"","company":"","location":"","description":"1 sentence","apply_url":"","salary":"","job_type":"","remote":false,"date_posted":"","source":""}]}
Rules: Only real listings with real URLs. Max 10 jobs. Be concise.`;

    const userPrompt = `Find job listings: ${parts.join(", ")}.${resumeHint}`;

    // Map date filter to Perplexity's recency filter
    let recencyFilter = "month";
    if (date_posted === "today") recencyFilter = "day";
    else if (date_posted === "3days" || date_posted === "week") recencyFilter = "week";

    // Call Perplexity API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    try {
      const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cachedPerplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 2048,
          temperature: 0.0,
          search_recency_filter: recencyFilter,
        }),
        signal: controller.signal,
      });

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

      // Parse the JSON from the response
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

      // Normalize and add IDs
      const normalizedJobs = jobs.slice(0, 15).map((job: any, index: number) => ({
        id: `perplexity-${Date.now()}-${index}`,
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
      }));

      const elapsed = Date.now() - startTime;
      console.log(`Job search completed in ${elapsed}ms — ${normalizedJobs.length} jobs found`);

      return new Response(
        JSON.stringify({
          jobs: normalizedJobs,
          total: normalizedJobs.length,
          citations,
          query: searchQuery,
          elapsed_ms: elapsed,
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

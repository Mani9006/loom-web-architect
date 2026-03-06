// Perplexity-powered Job Search — returns real job listings via web search
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, location, salary_range, job_type, date_posted, resume_text } = await req.json();

    // Get Perplexity API key from vault
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    let perplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
    if (!perplexityKey) {
      const { data: vaultData } = await sb.rpc("vault_read_secret", { secret_name: "PERPLEXITY_API_KEY" });
      if (vaultData) perplexityKey = String(vaultData);
    }

    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ error: "Perplexity API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the search prompt
    const searchQuery = query || "software engineer";
    const locationFilter = location ? ` in ${location}` : "";
    const salaryFilter = salary_range ? ` with salary ${salary_range}` : "";
    const typeFilter = job_type && job_type !== "all" ? ` ${job_type}` : "";
    const dateFilter = date_posted && date_posted !== "all" ? ` posted in the last ${date_posted}` : "";

    // If resume text provided, extract role for better search
    let resumeContext = "";
    if (resume_text) {
      resumeContext = `The candidate has the following background: ${resume_text.substring(0, 500)}. Find jobs that match their skills and experience. `;
    }

    const systemPrompt = `You are a job search assistant. Return job listings in a specific JSON format.
For each job found, return EXACTLY this JSON structure (no markdown, no explanation, ONLY valid JSON):
{
  "jobs": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, State or Remote",
      "description": "Brief 1-2 sentence description of the role",
      "apply_url": "https://actual-application-url.com",
      "salary": "Salary range if available or null",
      "job_type": "Full-time/Part-time/Contract/Internship",
      "remote": true/false,
      "date_posted": "Approximate date or 'Recent'",
      "source": "Website where the job was found"
    }
  ]
}
Return as many jobs as you can find. Include the actual application URL for each job. Do NOT make up jobs — only return real listings you find from the web. Return ONLY the JSON object, no other text.`;

    const userPrompt = `${resumeContext}Find${typeFilter} job listings for "${searchQuery}"${locationFilter}${salaryFilter}${dateFilter}. Search job boards like LinkedIn, Indeed, Glassdoor, company career pages, and other job sites. Return all jobs you can find with real application URLs.`;

    // Call Perplexity API
    const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.1,
        search_recency_filter: date_posted === "today" ? "day" : date_posted === "week" ? "week" : "month",
      }),
    });

    if (!perplexityResponse.ok) {
      const errText = await perplexityResponse.text();
      console.error("Perplexity API error:", errText);
      return new Response(
        JSON.stringify({ error: "Perplexity search failed", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices?.[0]?.message?.content || "";
    const citations = perplexityData.citations || [];

    // Parse the JSON from the response
    let jobs: any[] = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*"jobs"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        jobs = parsed.jobs || [];
      }
    } catch (parseErr) {
      console.error("Failed to parse Perplexity response:", parseErr);
      // Try line-by-line extraction as fallback
      try {
        const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        jobs = parsed.jobs || [];
      } catch {
        console.error("Fallback parse also failed");
      }
    }

    // Normalize and add IDs
    const normalizedJobs = jobs.map((job: any, index: number) => ({
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

    return new Response(
      JSON.stringify({
        jobs: normalizedJobs,
        total: normalizedJobs.length,
        citations,
        query: searchQuery,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("perplexity-job-search error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

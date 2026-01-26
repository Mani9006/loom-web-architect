import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mem0 API functions - using v2 API with proper filter structure
async function searchMemories(apiKey: string, userId: string, query: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.mem0.ai/v1/memories/search/", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query || "job search",
        version: "v2",
        user_id: userId,
        limit: 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mem0 search error:", response.status, errorText);
      return [];
    }

    const data = await response.json();
    const memories = Array.isArray(data) ? data : (data.results || data.memories || []);
    return memories.map((m: any) => m.memory || m.content).filter(Boolean);
  } catch (e) {
    console.error("Mem0 search error:", e);
    return [];
  }
}

async function addMemory(apiKey: string, userId: string, messages: any[], metadata?: any): Promise<void> {
  try {
    await fetch("https://api.mem0.ai/v1/memories/", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, user_id: userId, metadata }),
    });
  } catch (e) {
    console.error("Memory add error:", e);
  }
}

// Build search query from resume
function buildJobSearchQuery(resumeText: string, preferences?: string, previousJobs?: string[]): string {
  const exclusions = previousJobs && previousJobs.length > 0
    ? `\n\nDO NOT suggest these jobs that were already shown: ${previousJobs.slice(0, 10).join(", ")}`
    : "";

  return `Find exactly 5 REAL job postings posted in the LAST 24 HOURS that match this candidate's profile.

CANDIDATE RESUME/SKILLS:
${resumeText}

${preferences ? `PREFERENCES: ${preferences}` : ""}
${exclusions}

CRITICAL REQUIREMENTS:
1. Return EXACTLY 5 job listings
2. ONLY show jobs posted within the last 24 hours (today's postings)
3. Search LinkedIn Jobs, Indeed, Google Jobs, Glassdoor, company career pages
4. Match jobs to the candidate's skills, experience level, and location preferences
5. Each job MUST have a DIRECT CLICKABLE URL to the actual job posting page
6. Include: Job Title, Company, Location, Posted Time, and the Apply URL as a markdown link
7. Rank by relevance to the candidate's profile`;
}

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { resumeText, preferences, isFollowUp, conversationHistory } = await req.json();

    if (!resumeText && !isFollowUp) {
      return new Response(JSON.stringify({ error: "Resume text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");

    if (!PERPLEXITY_API_KEY) {
      console.error("PERPLEXITY_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Job search service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[JobSearch] Starting search for user: ${userId}, isFollowUp: ${isFollowUp}`);

    // Search for previous job recommendations and user context from memory
    let previousJobs: string[] = [];
    let userContext = "";
    if (MEM0_API_KEY) {
      const memories = await searchMemories(MEM0_API_KEY, userId, "job search recommendations resume skills");
      if (memories.length > 0) {
        console.log(`[JobSearch] Found ${memories.length} relevant memories`);
        // Extract previously shown jobs to avoid duplicates
        previousJobs = memories
          .filter(m => m.includes("job") || m.includes("position") || m.includes("role"))
          .slice(0, 15);
        userContext = memories.map(m => `- ${m}`).join("\n");
      }
    }

    // Build the search query
    const searchQuery = buildJobSearchQuery(resumeText, preferences, previousJobs);

    // Use Perplexity for real-time job search
    console.log("[JobSearch] Searching with Perplexity sonar-pro...");
    
    const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro", // Best for multi-step reasoning with citations
        messages: [
          {
            role: "system",
            content: `You are an expert job search assistant with access to real-time job listings.

Your task is to find EXACTLY 5 GENUINE, RECENTLY POSTED job openings that match the candidate's profile.

CRITICAL REQUIREMENTS:
1. Return EXACTLY 5 job listings - no more, no less
2. Only recommend jobs posted within the LAST 24 HOURS
3. Each job MUST include a DIRECT CLICKABLE LINK as a markdown URL [Apply Here](https://actual-job-url.com)
4. Verify jobs are from legitimate sources (LinkedIn, Indeed, company career pages, etc.)
5. Match jobs precisely to the candidate's skills and experience level
6. Consider location preferences (remote, hybrid, or specific locations mentioned)

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

## 1. 🎯 [Job Title] at [Company]

- **Location:** [City, State or Remote]
- **Posted:** [e.g., "2 hours ago", "Today"]
- **Why You're a Match:** [1-2 sentences connecting their skills to this role]
- **Key Requirements:** [2-3 bullet points]
- **Apply Now:** [Apply on LinkedIn](https://www.linkedin.com/jobs/view/...) or [Apply on Indeed](https://www.indeed.com/...)

---

## 2. 🎯 [Next Job Title] at [Company]
... and so on for all 5 jobs

${userContext ? `\nUSER CONTEXT FROM PREVIOUS INTERACTIONS:\n${userContext}` : ""}

IMPORTANT: Every job listing MUST have a working clickable link. Use markdown link format: [Link Text](URL)`,
          },
          ...(conversationHistory || []),
          { role: "user", content: searchQuery },
        ],
        search_recency_filter: "day", // Only search content from last 24 hours
        stream: true,
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error("Perplexity API error:", perplexityResponse.status, errorText);

      if (perplexityResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback to OpenAI if Perplexity fails
      if (OPENAI_API_KEY) {
        console.log("[JobSearch] Falling back to OpenAI...");
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are a job search strategist. Since real-time search is unavailable, provide strategic job search guidance based on the candidate's profile.

Help them by:
1. Identifying the best job titles to search for
2. Recommending specific companies that typically hire for these roles
3. Providing direct links to job boards with pre-filled searches
4. Suggesting networking strategies
5. Listing keywords to use in their search

Format with clear headings and actionable advice.`,
              },
              { role: "user", content: searchQuery },
            ],
            stream: true,
          }),
        });

        if (!openaiResponse.ok) {
          return new Response(JSON.stringify({ error: "AI service error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(openaiResponse.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      return new Response(JSON.stringify({ error: "Job search service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store this search in memory for future deduplication (fire and forget)
    if (MEM0_API_KEY) {
      const memoryMessages = [
        { role: "user", content: `Job search request: ${resumeText?.substring(0, 500)}` },
        { role: "assistant", content: `Searching for jobs matching: ${preferences || "general preferences"}` },
      ];
      addMemory(MEM0_API_KEY, userId, memoryMessages, {
        type: "job_search",
        timestamp: new Date().toISOString(),
        hasResume: !!resumeText,
      });
    }

    console.log("[JobSearch] Streaming response...");
    
    return new Response(perplexityResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Job search error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

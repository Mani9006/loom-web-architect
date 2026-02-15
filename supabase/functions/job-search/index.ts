// Supabase Edge Function - Runs on Deno runtime
// @deno-types="npm:@types/node"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Memory {
  memory?: string;
  content?: string;
}

interface Message {
  role: string;
  content: string;
}

interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
}

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
    const memories = Array.isArray(data) ? data : data.results || data.memories || [];
    return memories.map((m: Memory) => m.memory || m.content).filter(Boolean);
  } catch (e) {
    console.error("Mem0 search error:", e);
    return [];
  }
}

async function addMemory(
  apiKey: string,
  userId: string,
  messages: Message[],
  metadata?: Record<string, unknown>,
): Promise<void> {
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

// Extract job title and key skills from resume text
function extractResumeInfo(resumeText: string): { jobTitle: string; skills: string; experience: string } {
  // Try multiple patterns to extract a job title
  let jobTitle = "";

  // Pattern 1: "Title: ..." or "Position: ..." or "Role: ..."
  const titleMatch = resumeText.match(/(?:title|position|role|designation)[\s:]+([^\n,]+)/i);
  if (titleMatch) jobTitle = titleMatch[1].trim();

  // Pattern 2: Bold title line (e.g., "**Senior Data Scientist**")
  if (!jobTitle) {
    const boldMatch = resumeText.match(
      /\*\*([^*]+(?:Engineer|Developer|Scientist|Analyst|Manager|Designer|Architect|Lead|Director|Consultant|Specialist)[^*]*)\*\*/i,
    );
    if (boldMatch) jobTitle = boldMatch[1].trim();
  }

  // Pattern 3: Common title patterns in the first few lines
  if (!jobTitle) {
    const lines = resumeText.split("\n").slice(0, 10);
    for (const line of lines) {
      const match = line.match(
        /(?:Senior|Junior|Lead|Staff|Principal|Sr\.?|Jr\.?)?\s*(?:Data|Software|Machine Learning|ML|AI|Full[- ]?Stack|Front[- ]?end|Back[- ]?end|Cloud|DevOps|Platform|Product|Project|Program|QA|Test|Security|Network|Systems?|Database|ETL|BI|Business|UX|UI)\s*(?:Engineer|Developer|Scientist|Analyst|Manager|Designer|Architect|Lead|Director|Consultant|Specialist|Researcher)/i,
      );
      if (match) {
        jobTitle = match[0].trim();
        break;
      }
    }
  }

  if (!jobTitle) jobTitle = "software engineer";

  // Extract skills
  const skillsMatch = resumeText.match(/(?:skills?|technologies?|expertise|proficien)[\s:]+([^\n]+(?:\n[^\n#]*)*)/gi);
  const skills = skillsMatch
    ? skillsMatch
        .map((s) => s.replace(/(?:skills?|technologies?|expertise|proficien)[\s:]*/i, ""))
        .join(", ")
        .substring(0, 300)
    : "";

  // Extract experience summary
  const expMatch = resumeText.match(/(?:experience|work history|employment)[\s\S]{0,500}/i);
  const experience = expMatch ? expMatch[0].substring(0, 300) : "";

  return { jobTitle, skills, experience };
}

// Exa.ai search function for job listings — returns REAL verified URLs
async function searchJobsWithExa(apiKey: string, resumeText: string, filters?: JobFilters): Promise<ExaResult[]> {
  try {
    const { jobTitle, skills } = extractResumeInfo(resumeText);
    const country = filters?.country || "USA";

    // Build multiple focused search queries for better coverage
    const queries: string[] = [];

    // Primary query: job title + location + job boards
    queries.push(`${jobTitle} jobs ${country}`);

    // Secondary query: skills-based search
    if (skills) {
      const topSkills = skills.split(",").slice(0, 5).join(" ").trim();
      if (topSkills.length > 10) {
        queries.push(`${topSkills} jobs hiring ${country}`);
      }
    }

    // Add filter-specific terms
    if (filters?.workLocation === "remote") {
      queries[0] += " remote";
    }
    if (filters?.jobType && filters.jobType !== "all") {
      const typeLabel =
        filters.jobType === "fulltime" ? "full-time" : filters.jobType === "parttime" ? "part-time" : filters.jobType;
      queries[0] += ` ${typeLabel}`;
    }
    if (filters?.experienceLevel && filters.experienceLevel !== "all") {
      const levelLabel =
        filters.experienceLevel === "entry"
          ? "entry level junior"
          : filters.experienceLevel === "mid"
            ? "mid level"
            : filters.experienceLevel === "senior"
              ? "senior"
              : filters.experienceLevel === "director"
                ? "director lead"
                : filters.experienceLevel === "executive"
                  ? "executive VP"
                  : "";
      if (levelLabel) queries[0] += ` ${levelLabel}`;
    }

    console.log(`[Exa] Searching with queries:`, queries);

    const allResults: ExaResult[] = [];
    const seenUrls = new Set<string>();

    // Run searches in parallel for speed
    const searchPromises = queries.map((query) =>
      fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query,
          type: "neural",
          useAutoprompt: true,
          numResults: 10,
          contents: {
            text: { maxCharacters: 500 },
            highlights: true,
          },
          includeDomains: [
            "linkedin.com",
            "indeed.com",
            "glassdoor.com",
            "lever.co",
            "greenhouse.io",
            "workday.com",
            "myworkdayjobs.com",
            "jobs.lever.co",
            "boards.greenhouse.io",
            "careers.google.com",
            "amazon.jobs",
            "microsoft.com",
            "apple.com",
            "meta.com",
            "builtin.com",
            "dice.com",
            "ziprecruiter.com",
            "wellfound.com",
            "simplyhired.com",
          ],
          ...(getExaDateFilter(filters) ? { startPublishedDate: getExaDateFilter(filters) } : {}),
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            console.error(`Exa API error for query "${query}":`, res.status);
            return [];
          }
          const data = await res.json();
          return (data.results || []) as ExaResult[];
        })
        .catch((e) => {
          console.error("Exa search error:", e);
          return [] as ExaResult[];
        }),
    );

    const resultSets = await Promise.all(searchPromises);

    for (const results of resultSets) {
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }
    }

    console.log(`[Exa] Found ${allResults.length} unique results across ${queries.length} queries`);
    return allResults;
  } catch (e) {
    console.error("Exa search error:", e);
    return [];
  }
}

// Format Exa results into a structured string for the AI to analyze
function formatExaResults(results: ExaResult[]): string {
  if (results.length === 0) return "";

  const formatted = results
    .map((result, index) => {
      return `${index + 1}. **${result.title}**
   VERIFIED URL: ${result.url}
   Published: ${result.publishedDate || "Recently"}
   ${result.text ? `Description: ${result.text.substring(0, 400)}` : ""}
   ${result.highlights ? `Key Points: ${result.highlights.slice(0, 3).join(" | ")}` : ""}`;
    })
    .join("\n\n");

  return formatted;
}

// Get date filter for Exa API (ISO format)
function getExaDateFilter(filters?: JobFilters): string | undefined {
  if (filters?.datePosted === "all") return undefined;
  const now = new Date();
  if (!filters?.datePosted || filters.datePosted === "24h") {
    now.setDate(now.getDate() - 1);
  } else if (filters.datePosted === "week") {
    now.setDate(now.getDate() - 7);
  } else if (filters.datePosted === "month") {
    now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
}

// Job filter types
interface JobFilters {
  jobType?: string;
  experienceLevel?: string;
  workLocation?: string;
  datePosted?: string;
  salaryRange?: string;
  country?: string; // Default: "USA"
}

// Build filter string for search query
function buildFilterString(filters?: JobFilters): string {
  if (!filters) return "\n\nFILTERS:\nCountry: United States (USA)";

  const parts: string[] = [];

  const country = filters.country || "USA";
  parts.push(`Country: ${country === "USA" ? "United States (USA)" : country}`);

  if (filters.jobType && filters.jobType !== "all") {
    const typeMap: Record<string, string> = {
      fulltime: "full-time",
      parttime: "part-time",
      contract: "contract",
      internship: "internship",
      temporary: "temporary",
    };
    parts.push(`Job Type: ${typeMap[filters.jobType] || filters.jobType}`);
  }

  if (filters.experienceLevel && filters.experienceLevel !== "all") {
    const levelMap: Record<string, string> = {
      entry: "Entry Level / Junior",
      mid: "Mid Level / Intermediate",
      senior: "Senior Level",
      director: "Director / Lead",
      executive: "Executive / VP / C-Level",
    };
    parts.push(`Experience: ${levelMap[filters.experienceLevel] || filters.experienceLevel}`);
  }

  if (filters.workLocation && filters.workLocation !== "all") {
    const locationMap: Record<string, string> = {
      remote: "Remote / Work from Home",
      hybrid: "Hybrid",
      onsite: "On-site / In-office",
    };
    parts.push(`Work Mode: ${locationMap[filters.workLocation] || filters.workLocation}`);
  }

  if (filters.salaryRange && filters.salaryRange !== "all") {
    parts.push(`Minimum Salary: ${filters.salaryRange.replace("+", " or more")}`);
  }

  return parts.length > 0 ? `\n\nFILTERS (MUST follow strictly):\n${parts.join("\n")}` : "";
}

// Get recency filter for Perplexity API
function getRecencyFilter(filters?: JobFilters): string | undefined {
  if (!filters?.datePosted || filters.datePosted === "24h") return "day";
  if (filters.datePosted === "week") return "week";
  if (filters.datePosted === "month") return "month";
  if (filters.datePosted === "all") return undefined;
  return "day";
}

// Build the user-facing search query
function buildJobSearchQuery(resumeText: string, filters?: JobFilters, previousJobs?: string[]): string {
  const exclusions =
    previousJobs && previousJobs.length > 0
      ? `\n\nDO NOT suggest these jobs that were already shown: ${previousJobs.slice(0, 10).join(", ")}`
      : "";

  const filterString = buildFilterString(filters);
  const datePosted = filters?.datePosted || "24h";
  const dateLabel =
    datePosted === "24h"
      ? "last 24 hours"
      : datePosted === "week"
        ? "past week"
        : datePosted === "month"
          ? "past month"
          : "any time";
  const country = filters?.country || "USA";
  const countryLabel = country === "USA" ? "United States (USA)" : country;

  return `Find exactly 5 REAL job postings${datePosted !== "all" ? ` posted in the ${dateLabel}` : ""} in the ${countryLabel} that match this candidate's profile.

CANDIDATE RESUME/SKILLS:
${resumeText}
${filterString}
${exclusions}

SMART MATCHING STRATEGY:
- 80% weight on SKILLS and EXPERIENCE
- 20% weight on job title — consider RELATED roles
- Match by what the candidate CAN DO, not just their title

REQUIREMENTS:
1. Return EXACTLY 5 job listings
2. ${datePosted !== "all" ? `ONLY jobs posted within the ${dateLabel}` : "Prefer recent postings"}
3. ALL jobs MUST be in the ${countryLabel}
4. STRICTLY apply all FILTERS above`;
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { resumeText, filters, isFollowUp, conversationHistory } = await req.json();

    if (!resumeText && !isFollowUp) {
      return new Response(JSON.stringify({ error: "Resume text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");
    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");

    if (!PERPLEXITY_API_KEY && !EXA_API_KEY) {
      console.error("Neither PERPLEXITY_API_KEY nor EXA_API_KEY configured");
      return new Response(JSON.stringify({ error: "Job search service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[JobSearch] Starting search for user: ${userId}, isFollowUp: ${isFollowUp}`);

    // Search for previous job recommendations from memory
    let previousJobs: string[] = [];
    let userContext = "";
    if (MEM0_API_KEY) {
      const memories = await searchMemories(MEM0_API_KEY, userId, "job search recommendations resume skills");
      if (memories.length > 0) {
        console.log(`[JobSearch] Found ${memories.length} relevant memories`);
        previousJobs = memories
          .filter((m) => m.includes("job") || m.includes("position") || m.includes("role"))
          .slice(0, 15);
        userContext = memories.map((m) => `- ${m}`).join("\n");
      }
    }

    // Build the search query with filters
    const searchQuery = buildJobSearchQuery(resumeText, filters, previousJobs);
    const recencyFilter = getRecencyFilter(filters);
    const dateLabel =
      filters?.datePosted === "all"
        ? "any time"
        : filters?.datePosted === "week"
          ? "past week"
          : filters?.datePosted === "month"
            ? "past month"
            : "last 24 hours";
    const country = filters?.country || "USA";
    const countryLabel = country === "USA" ? "United States (USA)" : country;

    // ── Step 1: Fetch REAL job listings from Exa.ai (verified URLs) ──
    let exaResults: ExaResult[] = [];
    let formattedExaResults = "";
    if (EXA_API_KEY) {
      console.log("[JobSearch] Fetching real job listings from Exa.ai...");
      exaResults = await searchJobsWithExa(EXA_API_KEY, resumeText, filters);
      formattedExaResults = formatExaResults(exaResults);
      console.log(`[JobSearch] Exa returned ${exaResults.length} verified results`);
    }

    // ── Step 2: Use AI to analyze, rank, and format results ──
    // The AI's job is to SELECT the best matches and ADD analysis — NOT to find URLs

    const hasRealJobs = exaResults.length > 0;

    const systemPrompt = hasRealJobs
      ? `You are an expert job search assistant. You have been given VERIFIED, REAL job listings with working URLs from a web search API.

YOUR TASK: Select the 5 BEST matches from the provided listings and format them nicely for the candidate. Add your analysis of why each is a good match.

CRITICAL URL RULES:
- You MUST use the EXACT "VERIFIED URL" provided for each job listing — do NOT modify, shorten, or replace these URLs
- These URLs are real and verified — they link to actual job postings
- Format each URL as a clickable markdown link: [Apply Here](EXACT_VERIFIED_URL)
- If you mention a job not in the provided list, use a search link like: [Search on LinkedIn](https://www.linkedin.com/jobs/search/?keywords=JOB_TITLE+COMPANY)
- NEVER fabricate a URL. NEVER use indeed.com/viewjob or similar made-up patterns

VERIFIED JOB LISTINGS FROM WEB SEARCH:
${formattedExaResults}

FORMAT EACH JOB EXACTLY LIKE THIS:

## 1. 🎯 [Job Title] at [Company]

- **Location:** [City, State or Remote]
- **Posted:** [Date from listing or "Recently"]
- **Why You're a Match:** [1-2 sentences connecting candidate's specific SKILLS to this role]
- **Key Requirements:** [2-3 bullet points from the listing]
- **Apply Now:** [Apply Here](EXACT_VERIFIED_URL_FROM_ABOVE)

---

Select the 5 most relevant jobs. If fewer than 5 verified listings match, show what matches and note how many were found.
${userContext ? `\nUSER CONTEXT:\n${userContext}` : ""}

ALL jobs MUST be in the ${countryLabel}. Follow all candidate filters strictly.`
      : `You are an expert job search assistant with real-time web access.

YOUR TASK: Find 5 REAL, CURRENTLY OPEN job postings in the ${countryLabel} matching this candidate.

CRITICAL URL RULES:
- For each job, provide a REAL search URL that will show the actual posting:
  * LinkedIn: [Search on LinkedIn](https://www.linkedin.com/jobs/search/?keywords=ENCODED_JOB_TITLE+ENCODED_COMPANY&location=United+States)
  * Indeed: [Search on Indeed](https://www.indeed.com/jobs?q=ENCODED_JOB_TITLE+ENCODED_COMPANY&l=United+States)
  * Company career page URL if you know it
- NEVER fabricate a direct job posting URL — use search URLs instead
- NEVER use patterns like indeed.com/viewjob/FAKE_ID or linkedin.com/jobs/view/FAKE_ID
- It is better to give a working SEARCH link than a broken DIRECT link

FORMAT EACH JOB EXACTLY LIKE THIS:

## 1. 🎯 [Job Title] at [Company]

- **Location:** [City, State in ${countryLabel}]
- **Posted:** [Approximate time]
- **Why You're a Match:** [1-2 sentences connecting their SKILLS to this role]
- **Key Requirements:** [2-3 bullet points]
- **Apply Now:** [Search on LinkedIn](https://www.linkedin.com/jobs/search/?keywords=...) | [Search on Indeed](https://www.indeed.com/jobs?q=...)

---

${userContext ? `\nUSER CONTEXT:\n${userContext}` : ""}

ALL jobs MUST be in the ${countryLabel}. ${dateLabel !== "any time" ? `Only jobs posted within the ${dateLabel}.` : "Prefer recent postings."} Follow all filters strictly.`;

    // Try Perplexity first, then OpenAI as fallback
    if (PERPLEXITY_API_KEY) {
      console.log(
        `[JobSearch] Using Perplexity sonar-pro to analyze ${exaResults.length} Exa results, recency: ${recencyFilter}...`,
      );

      const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            { role: "system", content: systemPrompt },
            ...(conversationHistory || []),
            { role: "user", content: searchQuery },
          ],
          ...(recencyFilter ? { search_recency_filter: recencyFilter } : {}),
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

        // Fallback to OpenAI
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
                { role: "system", content: systemPrompt },
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

      // Store search in memory (fire and forget)
      if (MEM0_API_KEY) {
        const filterSummary = filters ? JSON.stringify(filters) : "no filters";
        addMemory(
          MEM0_API_KEY,
          userId,
          [
            { role: "user", content: `Job search request: ${resumeText?.substring(0, 500)}` },
            { role: "assistant", content: `Searching for jobs with filters: ${filterSummary}` },
          ],
          {
            type: "job_search",
            timestamp: new Date().toISOString(),
            hasResume: !!resumeText,
            filters: filters || {},
          },
        );
      }

      console.log("[JobSearch] Streaming response...");

      return new Response(perplexityResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else if (OPENAI_API_KEY) {
      // Use OpenAI directly with Exa results
      console.log("[JobSearch] Using OpenAI with Exa results...");

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: searchQuery },
          ],
          stream: true,
        }),
      });

      if (openaiResponse.ok) {
        return new Response(openaiResponse.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ error: "No AI service configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Job search error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

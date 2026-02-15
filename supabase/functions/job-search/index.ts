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

// Exa.ai search function for job listings
async function searchJobsWithExa(apiKey: string, resumeText: string, filters?: JobFilters): Promise<string> {
  try {
    const datePosted = filters?.datePosted || "24h";
    const dateLabel = datePosted === "24h" ? "last 24 hours" : datePosted === "week" ? "past week" : "past month";

    // Extract key skills and job title from resume
    const skills = resumeText.match(/(?:skills?|technologies?|expertise)[\s:]+([^\n]+)/gi)?.join(" ") || "";
    const jobTitle = resumeText.match(/(?:title|position|role)[\s:]+([^\n]+)/i)?.[1] || "software engineer";

    // Build search query focusing on job boards - default to USA
    const country = filters?.country || "USA";
    let searchQuery = `${jobTitle} jobs hiring ${dateLabel} ${country} site:(linkedin.com/jobs OR indeed.com OR glassdoor.com)`;

    if (filters?.workLocation && filters.workLocation !== "all") {
      searchQuery += ` ${filters.workLocation}`;
    }
    if (filters?.jobType && filters.jobType !== "all") {
      searchQuery += ` ${filters.jobType}`;
    }
    if (filters?.experienceLevel && filters.experienceLevel !== "all") {
      const levelLabel =
        filters.experienceLevel === "entry"
          ? "entry level"
          : filters.experienceLevel === "mid"
            ? "mid level"
            : filters.experienceLevel === "senior"
              ? "senior"
              : filters.experienceLevel === "director"
                ? "director"
                : filters.experienceLevel === "executive"
                  ? "executive"
                  : "";
      if (levelLabel) searchQuery += ` ${levelLabel}`;
    }

    console.log(`[Exa] Searching with query: ${searchQuery}`);

    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: searchQuery,
        type: "neural",
        useAutoprompt: true,
        numResults: 10,
        contents: {
          text: true,
          highlights: true,
        },
        ...(getExaDateFilter(filters) ? { startPublishedDate: getExaDateFilter(filters) } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Exa API error:", response.status, errorText);
      return "";
    }

    const data = await response.json();

    // Format Exa results into a readable format
    if (data.results && data.results.length > 0) {
      const jobListings = data.results
        .map((result: ExaResult, index: number) => {
          return `${index + 1}. ${result.title}
   URL: ${result.url}
   Published: ${result.publishedDate || "Recently"}
   ${result.text ? `Description: ${result.text.substring(0, 300)}...` : ""}`;
        })
        .join("\n\n");

      return `\n\n=== Additional Job Listings from Exa.ai ===\n${jobListings}\n`;
    }

    return "";
  } catch (e) {
    console.error("Exa search error:", e);
    return "";
  }
}

// Get date filter for Exa API (ISO format)
function getExaDateFilter(filters?: JobFilters): string | undefined {
  if (filters?.datePosted === "all") return undefined; // No date filter for "any time"
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

  // Always include country - default to USA
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

  return parts.length > 0 ? `\n\nFILTERS (MUST follow these strictly):\n${parts.join("\n")}` : "";
}

// Get recency filter for Perplexity API
function getRecencyFilter(filters?: JobFilters): string | undefined {
  if (!filters?.datePosted || filters.datePosted === "24h") return "day";
  if (filters.datePosted === "week") return "week";
  if (filters.datePosted === "month") return "month";
  if (filters.datePosted === "all") return undefined; // No recency filter for "any time"
  return "day"; // default to 24 hours
}

// Build search query from resume with smart role matching
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

SMART MATCHING STRATEGY (VERY IMPORTANT):
- 80% weight on SKILLS and EXPERIENCE - focus on transferable skills, technologies, and experience
- 20% weight on job title - consider RELATED roles, not just exact title matches
- For example: A "Data Scientist" should also see "ML Engineer", "AI Engineer", "Applied Scientist", "Research Scientist", "Data Analyst" roles
- An "ETL Developer" should also see "Data Engineer", "Analytics Engineer", "BI Developer", "Data Pipeline Engineer" roles
- Look for roles where the candidate's SKILLS match, even if the title is different

CRITICAL REQUIREMENTS:
1. Return EXACTLY 5 job listings
2. ${datePosted !== "all" ? `ONLY show jobs posted within the ${dateLabel}` : "Show recent job postings (prefer newer listings)"}
3. ALL jobs MUST be located in the ${countryLabel}${filters?.workLocation === "remote" ? " (remote positions based in " + countryLabel + ")" : ""}
4. Search LinkedIn Jobs, Indeed, Google Jobs, Glassdoor, company career pages
5. Match jobs primarily by SKILLS and EXPERIENCE, then by title
6. Each job MUST have a DIRECT CLICKABLE URL to the actual job posting page
7. Include: Job Title, Company, Location (city/state in ${countryLabel}), Posted Time, and the Apply URL as a markdown link
8. Rank by relevance to the candidate's SKILLS (not just title match)
9. STRICTLY apply all FILTERS listed above — do not ignore any filter criteria`;
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

    // Search for previous job recommendations and user context from memory
    let previousJobs: string[] = [];
    let userContext = "";
    if (MEM0_API_KEY) {
      const memories = await searchMemories(MEM0_API_KEY, userId, "job search recommendations resume skills");
      if (memories.length > 0) {
        console.log(`[JobSearch] Found ${memories.length} relevant memories`);
        // Extract previously shown jobs to avoid duplicates
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

    // Fetch additional job listings from Exa.ai if available
    let exaResults = "";
    if (EXA_API_KEY) {
      console.log("[JobSearch] Fetching additional jobs from Exa.ai...");
      exaResults = await searchJobsWithExa(EXA_API_KEY, resumeText, filters);
    }

    // Use Perplexity for real-time job search if available
    if (PERPLEXITY_API_KEY) {
      console.log(`[JobSearch] Searching with Perplexity sonar-pro, recency: ${recencyFilter}...`);

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

Your task is to find EXACTLY 5 GENUINE, RECENTLY POSTED job openings in the ${countryLabel} that match the candidate's profile.

LOCATION REQUIREMENT (MANDATORY):
- ALL jobs MUST be located in the ${countryLabel}
- Include city and state/region for each job location
- Remote jobs must be available to candidates in the ${countryLabel}

SMART MATCHING APPROACH (CRITICAL):
- Focus 80% on SKILLS and EXPERIENCE matching - look for transferable skills
- Focus 20% on job title - consider RELATED roles, not just exact matches
- Example: "Data Scientist" → also show "ML Engineer", "AI Engineer", "Applied Scientist", "Research Scientist"
- Example: "ETL Developer" → also show "Data Engineer", "Analytics Engineer", "BI Developer"
- Example: "Frontend Developer" → also show "UI Engineer", "React Developer", "Web Developer"
- Match by what the candidate CAN DO, not just what their current title is

FILTER ENFORCEMENT (MUST FOLLOW):
- The user's search query includes FILTERS section — you MUST strictly follow ALL specified filters
- If Job Type is specified, ONLY show jobs of that type
- If Experience Level is specified, ONLY show jobs at that level
- If Work Mode is specified (Remote/Hybrid/On-site), ONLY show matching jobs
- If Minimum Salary is specified, ONLY show jobs meeting that threshold

CRITICAL REQUIREMENTS:
1. Return EXACTLY 5 job listings - no more, no less
2. ${dateLabel !== "any time" ? `Only recommend jobs posted within the ${dateLabel}` : "Prefer recently posted jobs"}
3. Each job MUST include a DIRECT CLICKABLE LINK as a markdown URL [Apply Here](https://actual-job-url.com)
4. Verify jobs are from legitimate sources (LinkedIn, Indeed, company career pages, etc.)
5. Match jobs by SKILLS first, then title similarity
6. ALL jobs MUST be in the ${countryLabel}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

## 1. 🎯 [Job Title] at [Company]

- **Location:** [City, State in ${countryLabel} or Remote (${countryLabel})]
- **Posted:** [e.g., "2 hours ago", "Today"]
- **Why You're a Match:** [1-2 sentences connecting their SKILLS to this role - be specific about which skills match]
- **Key Requirements:** [2-3 bullet points]
- **Apply Now:** [Apply Here](ACTUAL_FULL_URL_TO_JOB_POSTING)

---

## 2. 🎯 [Next Job Title] at [Company]
... and so on for all 5 jobs

CRITICAL RULE FOR APPLY LINKS:
- NEVER use placeholder URLs with "..." or example.com
- ONLY include a link if you have the REAL, FULL URL to the actual job posting
- The URL must be a complete, working link (e.g., https://www.linkedin.com/jobs/view/1234567890)
- If you cannot find the actual URL, instead write: **Apply Now:** Search for "[Job Title] at [Company]" on LinkedIn/Indeed
- Do NOT fabricate or guess URLs — broken links are worse than no links

${userContext ? `\nUSER CONTEXT FROM PREVIOUS INTERACTIONS:\n${userContext}` : ""}
${exaResults ? `\nREFERENCE JOBS FROM EXA.AI (use these as additional sources):\n${exaResults}` : ""}

IMPORTANT: Every job listing MUST have a working clickable link. Use markdown link format: [Link Text](URL)`,
            },
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

        // Fallback to OpenAI if Perplexity fails
        if (OPENAI_API_KEY) {
          console.log("[JobSearch] Falling back to OpenAI...");

          const exaContext = exaResults ? `\n\nHere are some job listings found:\n${exaResults}` : "";

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
                  content: `You are a job search strategist. ${exaResults ? "You have access to real job listings from Exa.ai." : "Since real-time search is unavailable, provide strategic job search guidance based on the candidate's profile."}

${
  exaResults
    ? `Review these job listings and format them nicely with direct apply links. Add insights about why the candidate is a good match for each role.${exaContext}`
    : `Help them by:
1. Identifying the best job titles to search for
2. Recommending specific companies that typically hire for these roles
3. Providing direct links to job boards with pre-filled searches (use real search URLs like https://www.linkedin.com/jobs/search/?keywords=ENCODED_KEYWORDS)
4. Suggesting networking strategies
5. Listing keywords to use in their search`
}

CRITICAL: NEVER use placeholder URLs with "..." or made-up URLs. Only include links if they are REAL, working URLs. If you don't have the actual job posting URL, tell the user to search for the job title on LinkedIn/Indeed instead.

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
        const filterSummary = filters ? JSON.stringify(filters) : "no filters";
        const memoryMessages = [
          { role: "user", content: `Job search request: ${resumeText?.substring(0, 500)}` },
          { role: "assistant", content: `Searching for jobs with filters: ${filterSummary}` },
        ];
        addMemory(MEM0_API_KEY, userId, memoryMessages, {
          type: "job_search",
          timestamp: new Date().toISOString(),
          hasResume: !!resumeText,
          filters: filters || {},
        });
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
    } else if (EXA_API_KEY && exaResults) {
      // If only Exa.ai is available, use OpenAI to format Exa results
      console.log("[JobSearch] Using Exa.ai results with OpenAI formatting...");

      if (OPENAI_API_KEY) {
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
                content: `You are a job search assistant. You have real job listings from Exa.ai. Format them nicely with:
- Job title and company
- Location and posted date
- Why the candidate is a good match
- Direct apply links

Here are the job listings:
${exaResults}`,
              },
              { role: "user", content: `Format these jobs for: ${resumeText.substring(0, 500)}...` },
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
      }

      // If no OpenAI, return Exa results directly
      return new Response(JSON.stringify({ message: exaResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(
        JSON.stringify({ error: "No job search APIs configured. Please set PERPLEXITY_API_KEY or EXA_API_KEY." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Job search error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

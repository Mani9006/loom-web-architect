import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Specialized system prompts for different modes
const SYSTEM_PROMPTS: Record<string, string> = {
  general: `You are an intelligent, helpful AI assistant with persistent memory. You help users with career-related tasks and general questions.

Your capabilities include:
- Resume building and optimization
- Cover letter creation
- ATS compatibility analysis  
- Job search strategies
- Interview preparation
- General career advice

When users share information about themselves (skills, experience, preferences), acknowledge it naturally. This context helps you provide personalized assistance.

Keep responses clear, actionable, and well-formatted with markdown. Use proper headings, bullet points, and spacing for readability.`,

  ats: `You are an ATS (Applicant Tracking System) expert with deep knowledge of how Taleo, Workday, Greenhouse, Lever, iCIMS, and BambooHR parse resumes.

## Scoring Criteria (be strict and honest — do NOT inflate scores)

Score each area and compute total out of 100:
- **Contact Info (10 pts)**: Name, email, phone, location, professional title, LinkedIn
- **Professional Summary (10 pts)**: 30-60 words, no first-person pronouns, includes metrics, relevant keywords
- **Work Experience (30 pts)**: Reverse chronological, job titles present, 3-6 bullets per role, starts with action verbs (Led, Developed, Optimized), quantified achievements (percentages, dollar amounts, team sizes)
- **Education (10 pts)**: Degree type, field of study, graduation date, institution name
- **Skills (15 pts)**: 12-20 relevant skills, organized by category, concise keyword format
- **Formatting (10 pts)**: No emojis/special chars, consistent date formats, 300-700 words, all 5 core sections present
- **Content Quality (15 pts)**: Metrics in 50%+ of bullets, strong action verbs in 80%+ of bullets, keyword diversity, projects with descriptions, certifications with issuers

## Your Analysis Format

### ATS Score: X/100

### 📊 Section Breakdown
- Contact Info: X/10
- Professional Summary: X/10
- Work Experience: X/30
- Education: X/10
- Skills: X/15
- Formatting: X/10
- Content Quality: X/15

### ✅ Strengths
- List specific items that will rank well with ATS

### 🔴 Critical Issues (must fix)
- Issues that will cause ATS rejection

### ⚠️ Warnings (should fix)
- Issues that reduce ATS match score

### 🔑 Missing Keywords
- If job description provided: list specific keywords from JD not found in resume
- If no job description: suggest industry-standard keywords for this role

### 💡 Specific Recommendations
- Numbered list of actionable improvements with before/after examples

IMPORTANT: Be strict. A score of 90+ should mean the resume is genuinely top-tier and ATS-optimized. Do not give generous scores — an average resume should score 50-65, a good one 70-80. Only truly excellent resumes deserve 85+.`,

  cover_letter: `You are an expert cover letter writer. Create compelling, personalized letters that:

1. Hook readers with a strong opening
2. Connect specific achievements to job requirements
3. Show personality while maintaining professionalism
4. End with a clear call-to-action

Keep letters 250-400 words, tailored to each opportunity.`,

  job_search: `You are a job search strategist. Help users by:

## Your Response Format

### 🎯 Role Analysis
Analyze their skills and experience

### 💼 Recommended Roles
Suggest suitable roles and industries with specific job titles

### 📋 Application Strategy
Provide actionable next steps

### 🤝 Networking Tips
Advise on networking and referrals

Use clear headings and bullet points for readability.`,

  interview: `You are an experienced interview coach. Prepare candidates by:

## Your Response Format

### 📋 Interview Questions
Provide relevant practice questions (numbered list)

### 💡 STAR Method Tips
Coach on behavioral question structure

### ✨ Key Points to Emphasize
Specific talking points for this role

### ⚠️ Common Pitfalls
What to avoid

Use clear formatting with headings and bullet points.`,

  resume_parse: `You are an expert resume parser. Extract ALL structured resume data from the provided text.

OUTPUT: Return ONLY valid JSON (no markdown, no backticks, no explanations).

SCHEMA:
{
  "header": {
    "name": "Full Name",
    "title": "Job Title",
    "location": "City, State",
    "email": "email@domain.com",
    "phone": "phone number",
    "linkedin": "LinkedIn URL"
  },
  "summary": "Professional summary text",
  "experience": [
    {
      "role": "Job Title",
      "company_or_client": "Company Name",
      "start_date": "Mon YYYY",
      "end_date": "Mon YYYY or Present",
      "location": "City, State",
      "bullets": ["...ALL bullet points from this role..."]
    }
  ],
  "education": [
    {
      "degree": "Degree Type",
      "field": "Field of Study",
      "institution": "School Name",
      "gpa": "GPA if mentioned",
      "graduation_date": "YYYY or Mon YYYY",
      "location": "City, State"
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Organization",
      "date": "Date obtained"
    }
  ],
  "skills": {
    "actual_category_name_from_resume": ["ALL skills exactly as listed under this category"]
  },
  "projects": [
    {
      "title": "Project Name",
      "organization": "Organization",
      "date": "Date",
      "bullets": ["...ALL bullet points from this project..."]
    }
  ]
}

CRITICAL RULES:
1. Extract ONLY the person's name in header.name
2. bullets must be an array of strings - EXTRACT EVERY SINGLE BULLET POINT, do not truncate or summarize
3. For experience and projects: include ALL bullet points exactly as written, even if there are 10+ bullets per entry
4. SKILLS EXTRACTION: Use the EXACT category names from the resume (converted to lowercase_snake_case). DO NOT invent categories.
5. Use empty string "" for missing fields, never null
6. Return ONLY the JSON object`,
};

// Mem0 API functions - Following official v2 API
async function searchMem0(apiKey: string, userId: string, query: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.mem0.ai/v1/memories/search/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        version: "v2",
        filters: {
          OR: [{ user_id: userId }]
        },
        limit: 15,
      }),
    });

    if (!response.ok) {
      console.error("Mem0 search error:", response.status);
      return [];
    }

    const data = await response.json();
    // Handle both array and object response formats
    const memories = Array.isArray(data) ? data : (data.results || data.memories || []);
    return memories.map((m: any) => m.memory || m.content).filter(Boolean);
  } catch (e) {
    console.error("Mem0 search error:", e);
    return [];
  }
}

async function addToMem0(apiKey: string, userId: string, messages: any[]): Promise<void> {
  try {
    await fetch("https://api.mem0.ai/v1/memories/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        user_id: userId,
      }),
    });
  } catch (e) {
    console.error("Mem0 add error:", e);
  }
}

// ── 3-Tier Model Strategy ──────────────────────────────────────────
// Tier 1 (Premium)  – gpt-4o        : best quality, higher cost
//   → ATS analysis, resume rewriting, cover letters, AI fix-all
// Tier 2 (Standard) – gpt-4o-mini   : great quality, low cost
//   → Interview prep, job search, summary enhancement, bullet rewrite
// Tier 3 (Economy)  – gpt-3.5-turbo : cheapest, fastest
//   → General chat, simple Q&A, quick suggestions
const OPENAI_MODELS = {
  premium:  "gpt-4o",          // ~$5/1M input  | complex reasoning, long context
  standard: "gpt-4o-mini",     // ~$0.15/1M input | great for most tasks
  economy:  "gpt-3.5-turbo",   // ~$0.50/1M input | simple/fast tasks
};

// Select model based on task complexity
function getModelForMode(mode: string): string {
  switch (mode) {
    // Tier 1 – Premium: complex writing, analysis, rewriting
    case "ats":
    case "cover_letter":
    case "resume_parse":
    case "resume_fix":
      return OPENAI_MODELS.premium;

    // Tier 2 – Standard: structured generation, enhancement
    case "resume":
    case "resume_enhance":
    case "resume_bullets":
    case "interview":
    case "job_search":
      return OPENAI_MODELS.standard;

    // Tier 3 – Economy: simple chat, quick answers
    case "general":
    case "quick":
    default:
      return OPENAI_MODELS.economy;
  }
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, mode, model: requestedModel } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get latest user message for memory search
    const latestUserMessage = messages.filter((m: any) => m.role === "user").pop();
    const userQuery = latestUserMessage?.content || "";

    // Select appropriate system prompt based on mode
    // Normalize mode aliases
    const modeAliases: Record<string, string> = {
      "cover-letter": "cover_letter",
      "ats-check": "ats",
      "interview-prep": "interview",
    };
    const chatMode = modeAliases[mode] || mode || "general";

    // Only use memory for specific career-focused modes
    const memoryEnabledModes = ["interview", "job_search", "resume"];
    const shouldUseMemory = memoryEnabledModes.includes(chatMode);

    // Search for relevant memories only for specific modes
    let memoryContext = "";
    if (MEM0_API_KEY && userQuery && shouldUseMemory) {
      const memories = await searchMem0(MEM0_API_KEY, user.id, userQuery);
      if (memories.length > 0) {
        memoryContext = `\n\n## User Context\nRelevant information from previous interactions:\n${memories.map(m => `- ${m}`).join("\n")}`;
        console.log(`[Chat] Found ${memories.length} relevant memories for mode: ${chatMode}`);
      }
    } else if (!shouldUseMemory) {
      console.log(`[Chat] Memory disabled for mode: ${chatMode}`);
    }

    // Check if we have a dedicated system prompt for this mode
    const hasDedicatedPrompt = chatMode in SYSTEM_PROMPTS;
    const basePrompt = SYSTEM_PROMPTS[chatMode] || SYSTEM_PROMPTS.general;
    const systemPrompt = basePrompt + memoryContext;

    console.log(`[Chat] Mode: ${chatMode}, Messages: ${messages.length}, dedicated prompt: ${hasDedicatedPrompt}`);

    // Select optimal model - use OpenAI models
    const selectedModel = requestedModel || getModelForMode(chatMode);
    console.log(`[Chat] Using OpenAI model: ${selectedModel} for mode: ${chatMode}`);

    // When the backend has a dedicated system prompt for this mode, strip frontend system messages
    // to avoid conflicting/duplicate instructions. Otherwise, keep them (the frontend provides the prompt).
    const userMessages = hasDedicatedPrompt
      ? messages.filter((m: any) => m.role !== "system")
      : messages;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...userMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add to memory in background only for career-focused modes
    if (MEM0_API_KEY && messages.length > 0 && shouldUseMemory) {
      const recentMessages = messages.slice(-4).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      addToMem0(MEM0_API_KEY, user.id, recentMessages);
      console.log(`[Chat] Storing memory for mode: ${chatMode}`);
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateUserAccess } from "../_shared/access-control.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimMessages(messages: any[], maxNonSystemMessages: number): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const systemMessages = messages.filter((message) => message?.role === "system").slice(-1);
  const nonSystemMessages = messages.filter((message) => message?.role !== "system");
  if (nonSystemMessages.length <= maxNonSystemMessages) {
    return [...systemMessages, ...nonSystemMessages];
  }
  return [...systemMessages, ...nonSystemMessages.slice(-maxNonSystemMessages)];
}

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
    "canonical_category_key": ["ALL skills exactly as listed"]
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
4. SKILLS EXTRACTION: Map skills to these STANDARD category keys (use lowercase_snake_case):
   - "generative_ai" for GenAI, LLM, AI tools, prompt engineering
   - "nlp" for ALL NLP-related skills (NLP tools, NLP frameworks, text processing, NLP technologies)
   - "machine_learning" for ML frameworks, ML modeling, statistical modeling, predictive analytics
   - "deep_learning" for neural networks, deep learning frameworks
   - "programming_languages" for all programming/scripting languages
   - "data_engineering_etl" for ETL, data pipelines, data processing tools
   - "visualization" for data visualization, BI tools, dashboards, reporting
   - "cloud_mlops" for cloud platforms (AWS/GCP/Azure), MLOps, cloud services
   - "devops" for CI/CD, containerization, infrastructure tools
   - "databases" for SQL, NoSQL, database management
   - "frameworks" for web/backend/frontend frameworks
   - "collaboration_tools" for project management, agile, team tools
   - "big_data" for Hadoop, Spark, distributed computing
   DO NOT create categories like "nlp_tools", "nlp_technologies", "cloud_platforms", "cloud_and_devops", "visualization_bi", "ml_frameworks", "ml_modeling" etc. Merge them into the standard categories above.
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
        limit: parseIntEnv("CHAT_MEM0_RESULT_LIMIT", 8),
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

// ── Multi-Provider Model Strategy ─────────────────────────────────
// Uses both OpenAI and Claude (Anthropic) for optimal quality + cost
//
// OpenAI:
//   GPT-4o       – best for complex writing, editing, JSON output
//   GPT-4o-mini  – cost-effective, great for most tasks
//
// Claude (Anthropic):
//   claude-sonnet-4-20250514 – excellent for nuanced text editing/rewriting
//   claude-3-5-haiku-20241022 – fast, token-efficient for structured extraction
//
// Provider selection: Claude excels at nuanced writing quality and editing,
// while OpenAI GPT-4o excels at JSON output and instruction following.

type AIProvider = "openai" | "anthropic";

interface ModelConfig {
  provider: AIProvider;
  model: string;
}

// Model configurations per task type
function getModelConfig(mode: string): ModelConfig {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const hasClaude = !!ANTHROPIC_API_KEY;

  switch (mode) {
    // Resume parsing – needs strict JSON output → GPT-4o (best at instruction following + JSON)
    case "resume_parse":
      return { provider: "openai", model: "gpt-4o" };

    // Resume fix/rewrite – needs nuanced understanding, no fabrication → Claude Sonnet (best at writing quality)
    case "resume_fix":
      return hasClaude
        ? { provider: "anthropic", model: "claude-sonnet-4-20250514" }
        : { provider: "openai", model: "gpt-4o" };

    // Cover letter – creative writing → Claude Sonnet (more natural, human-like)
    case "cover_letter":
      return hasClaude
        ? { provider: "anthropic", model: "claude-sonnet-4-20250514" }
        : { provider: "openai", model: "gpt-4o" };

    // ATS analysis – structured scoring → GPT-4o (great at structured output)
    case "ats":
      return { provider: "openai", model: "gpt-4o" };

    // Summary/bullet enhancement – writing quality matters → Claude Sonnet
    case "resume_enhance":
    case "resume_bullets":
      return hasClaude
        ? { provider: "anthropic", model: "claude-sonnet-4-20250514" }
        : { provider: "openai", model: "gpt-4o-mini" };

    // Interview/job search – structured advice → GPT-4o-mini (fast, cost-effective)
    case "resume":
    case "interview":
    case "job_search":
      return { provider: "openai", model: "gpt-4o-mini" };

    // General chat – fast responses → GPT-4o-mini or Claude Haiku
    case "general":
    case "quick":
    default:
      return hasClaude
        ? { provider: "anthropic", model: "claude-3-5-haiku-20241022" }
        : { provider: "openai", model: "gpt-4o-mini" };
  }
}

// Get max tokens based on mode — resume parsing needs more output tokens for large resumes
function getMaxTokens(mode: string): number {
  const defaultMax = parseIntEnv("CHAT_MAX_TOKENS_DEFAULT", 1200);
  const atsMax = parseIntEnv("CHAT_MAX_TOKENS_ATS", 2500);
  const resumeParseMax = parseIntEnv("CHAT_MAX_TOKENS_RESUME_PARSE", 6000);
  switch (mode) {
    case "resume_parse":
      return resumeParseMax;
    case "ats":
      return atsMax;
    default:
      return defaultMax;
  }
}

// ── Anthropic API call ───────────────────────────────────────────────
async function callAnthropicAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: any[],
  maxTokens = 8192,
): Promise<Response> {
  // Convert OpenAI-style messages to Anthropic format
  // Anthropic uses "system" as a top-level parameter, not in messages
  const anthropicMessages = messages
    .filter((m: any) => m.role !== "system")
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: anthropicMessages,
      stream: true,
    }),
  });

  return response;
}

// ── Convert Anthropic SSE stream to OpenAI-compatible SSE stream ───
function convertAnthropicStream(anthropicBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = anthropicBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              // Anthropic content_block_delta events
              if (data.type === "content_block_delta" && data.delta?.text) {
                const openaiFormat = {
                  choices: [{ delta: { content: data.delta.text } }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiFormat)}\n\n`));
              }
              // Anthropic message_stop event
              if (data.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error("Stream conversion error:", e);
        controller.close();
      }
    },
  });
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

    const access = await evaluateUserAccess(supabase, user.id);
    if (!access.allowed) {
      return new Response(
        JSON.stringify({
          error: "Access denied",
          reasonCode: access.code,
          detail: access.message || "AI access is restricted for this account.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { messages, mode, model: requestedModel } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");

    if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
      console.error("No AI API keys configured (need OPENAI_API_KEY or ANTHROPIC_API_KEY)");
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

    // Use memory for career-focused modes + resume editing modes for better context
    const memoryEnabledModes = ["interview", "job_search", "resume", "resume_fix", "resume_enhance", "resume_bullets", "cover_letter", "ats"];
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

    // Select optimal model and provider
    const modelConfig = getModelConfig(chatMode);

    // Allow frontend to override model, but keep provider routing
    const effectiveModel = requestedModel || modelConfig.model;
    const effectiveProvider = requestedModel ? "openai" : modelConfig.provider;

    // Fallback: if chosen provider's key isn't available, fall back to the other
    const finalProvider = (effectiveProvider === "anthropic" && !ANTHROPIC_API_KEY)
      ? "openai"
      : (effectiveProvider === "openai" && !OPENAI_API_KEY)
        ? "anthropic"
        : effectiveProvider;

    const finalModel = finalProvider !== effectiveProvider
      ? (finalProvider === "openai" ? "gpt-4o" : "claude-sonnet-4-20250514")
      : effectiveModel;

    console.log(`[Chat] Using ${finalProvider} model: ${finalModel} for mode: ${chatMode}`);

    // When the backend has a dedicated system prompt for this mode, strip frontend system messages
    // to avoid conflicting/duplicate instructions. Otherwise, keep them (the frontend provides the prompt).
    const rawMessages = hasDedicatedPrompt
      ? messages.filter((m: any) => m.role !== "system")
      : messages;
    const userMessages = trimMessages(rawMessages, parseIntEnv("CHAT_MAX_CONTEXT_MESSAGES", 12));

    let response: Response;
    let usedProvider: AIProvider = finalProvider;
    const maxTokens = getMaxTokens(chatMode);

    if (finalProvider === "anthropic" && ANTHROPIC_API_KEY) {
      // ── Call Anthropic Claude API ──
      response = await callAnthropicAPI(
        ANTHROPIC_API_KEY,
        finalModel,
        systemPrompt,
        userMessages,
        maxTokens,
      );
    } else {
      // ── Call OpenAI API ──
      usedProvider = "openai";
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: finalModel,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            ...userMessages,
          ],
          stream: true,
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${usedProvider} API error:`, response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If primary provider fails, try fallback provider
      if (usedProvider === "anthropic" && OPENAI_API_KEY) {
        console.log(`[Chat] Anthropic failed, falling back to OpenAI gpt-4o`);
        usedProvider = "openai";
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: maxTokens,
            messages: [
              { role: "system", content: systemPrompt },
              ...userMessages,
            ],
            stream: true,
          }),
        });

        if (!response.ok) {
          return new Response(JSON.stringify({ error: "AI service error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (usedProvider === "openai" && ANTHROPIC_API_KEY) {
        console.log(`[Chat] OpenAI failed, falling back to Anthropic claude-sonnet-4-20250514`);
        usedProvider = "anthropic";
        response = await callAnthropicAPI(
          ANTHROPIC_API_KEY,
          "claude-sonnet-4-20250514",
          systemPrompt,
          userMessages,
          maxTokens,
        );

        if (!response.ok) {
          return new Response(JSON.stringify({ error: "AI service error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "AI service error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Convert Anthropic stream format to OpenAI-compatible format if needed
    const responseBody = usedProvider === "anthropic"
      ? convertAnthropicStream(response.body!)
      : response.body;

    // Add to memory in background only for career-focused modes
    if (MEM0_API_KEY && messages.length > 0 && shouldUseMemory) {
      const recentMessages = messages.slice(-4).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      addToMem0(MEM0_API_KEY, user.id, recentMessages);
      console.log(`[Chat] Storing memory for mode: ${chatMode}`);
    }

    return new Response(responseBody, {
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

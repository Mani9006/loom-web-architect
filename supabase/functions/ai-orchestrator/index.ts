import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Agent definitions with specialized capabilities
const AGENTS = {
  orchestrator: {
    name: "Orchestrator",
    description: "Routes requests to specialized agents and manages conversation flow",
    systemPrompt: `You are an intelligent orchestrator for a career services AI platform. Your role is to:
1. Analyze user intent from their message
2. Route to the most appropriate specialized agent
3. Maintain conversation context and memory

Based on the user's message, determine the intent and respond with a JSON object:
{
  "intent": "resume" | "ats" | "cover_letter" | "job_search" | "interview" | "resume_parse" | "resume_enhance" | "salary_negotiation" | "networking" | "general",
  "confidence": 0.0-1.0,
  "context": "brief description of what user needs"
}

Guidelines:
- "resume": Building, editing, or improving resumes
- "ats": Checking resume against job descriptions, ATS compatibility
- "cover_letter": Creating or editing cover letters
- "job_search": Finding jobs, job recommendations, application strategies
- "interview": Mock interviews, interview prep, common questions
- "resume_parse": Extracting structured information from resume text/files
- "resume_enhance": Improving bullets, summaries, or wording quality
- "salary_negotiation": Compensation strategy, offer comparison, negotiation messaging
- "networking": Referral outreach, cold messages, connection strategy
- "general": Career advice, general questions, chit-chat

Always respond with valid JSON only.`,
  },
  resume: {
    name: "Resume Expert",
    description: "Specializes in resume creation, optimization, and formatting",
    systemPrompt: `You are an expert resume consultant with 15+ years of experience in HR and talent acquisition. You specialize in:

- ATS-optimized resume writing
- Achievement-based bullet points with metrics (increased X by Y%, reduced Z by $N)
- Industry-specific keyword optimization
- Modern resume formatting and structure
- Tailoring resumes to specific job descriptions

Guidelines:
- Always quantify achievements when possible
- Use strong action verbs (Led, Developed, Implemented, Optimized)
- Focus on results and impact, not just responsibilities
- Keep formatting clean and ATS-friendly
- Suggest improvements based on industry best practices

Format your responses with clear headings and bullet points for readability.`,
  },
  ats: {
    name: "ATS Analyst",
    description: "Specializes in ATS compatibility analysis and optimization",
    systemPrompt: `You are an ATS (Applicant Tracking System) expert who helps optimize resumes for automated screening. You understand:

- How ATS systems parse and rank resumes
- Keyword matching algorithms and scoring
- Common ATS parsing failures and how to avoid them
- Industry-specific keyword requirements

When analyzing resumes, structure your response clearly:

## ATS Score: X/100

### ✅ Strengths
- Items that will rank well in ATS

### ⚠️ Issues Found
- Formatting or parsing problems

### 🔑 Missing Keywords
- Keywords from the job description not in the resume

### 💡 Recommendations
- Specific, actionable improvements with examples`,
  },
  cover_letter: {
    name: "Cover Letter Specialist",
    description: "Creates compelling, personalized cover letters",
    systemPrompt: `You are an expert cover letter writer who creates compelling, personalized letters that get interviews. Your approach:

- Hook the reader in the opening paragraph with a compelling story or connection
- Demonstrate deep understanding of the company's challenges and values
- Connect specific achievements to the role's requirements
- Show personality while maintaining professionalism
- End with a strong call-to-action

Structure:
1. Opening: Compelling hook + position + how you found it
2. Body 1: Your most relevant achievement that matches their needs
3. Body 2: Additional skills/experience that add value
4. Closing: Enthusiasm + specific next steps

Keep it concise (250-400 words) and tailored to each opportunity.`,
  },
  job_search: {
    name: "Job Search Strategist",
    description: "Helps with job discovery and application strategies",
    systemPrompt: `You are a job search strategist and career coach who helps candidates find and land their ideal roles. Your expertise includes:

- Analyzing skills and experience to identify target roles
- Industry trends and in-demand skills
- Application strategies and timing
- Networking and referral approaches
- Salary negotiation basics

Structure your responses clearly:

### 🎯 Role Analysis
Assess their background and fit

### 💼 Recommended Roles
Specific job titles and industries to target

### 📋 Application Strategy
Actionable next steps

### 🤝 Networking Tips
How to leverage connections`,
  },
  interview: {
    name: "Interview Coach",
    description: "Prepares candidates for job interviews",
    systemPrompt: `You are an experienced interview coach who prepares candidates for success. Your expertise includes:

- Behavioral (STAR method) question coaching
- Technical interview preparation
- Company research strategies
- Body language and presentation tips
- Salary negotiation

Structure your responses clearly:

### 📋 Practice Questions
Numbered list of relevant questions

### 💡 STAR Method Tips
How to structure behavioral answers

### ✨ Key Points to Emphasize
Specific talking points

### ⚠️ Common Pitfalls
What to avoid`,
  },
  resume_parse: {
    name: "Resume Parser",
    description: "Extracts structured resume data accurately",
    systemPrompt: `You are a resume parsing specialist. Your goal is to extract structured information accurately and completely.

Focus areas:
- Identify roles, companies, dates, and locations correctly
- Preserve bullet-point details without hallucination
- Normalize section structure for downstream processing
- Flag ambiguities clearly when source text is unclear

Keep output deterministic, precise, and schema-friendly.`,
  },
  resume_enhance: {
    name: "Resume Enhancement Coach",
    description: "Improves bullet quality and wording while preserving truth",
    systemPrompt: `You improve resume language without fabricating facts.

Guidelines:
- Preserve factual accuracy from user-provided content
- Upgrade weak bullets into impact-focused bullets
- Prefer concrete outcomes and metrics
- Keep edits concise, ATS-friendly, and role-targeted

Always state assumptions when metrics are missing.`,
  },
  salary_negotiation: {
    name: "Salary Negotiation Advisor",
    description: "Provides compensation strategy and negotiation support",
    systemPrompt: `You are a salary negotiation advisor.

Provide:
- Offer analysis and total compensation breakdown
- Negotiation scripts (email + live call)
- Risk-aware strategy by stage (pre-offer, offer, counter-offer)
- BATNA framing and decision support

Prioritize practical, tactful, and high-confidence guidance.`,
  },
  networking: {
    name: "Networking Strategist",
    description: "Helps users improve networking and referral outcomes",
    systemPrompt: `You are a networking and referrals strategist.

Provide:
- Outreach message drafts (short and personalized)
- Follow-up cadences
- Referral request templates
- Portfolio/LinkedIn positioning suggestions

Focus on respectful, concise, high-conversion communication.`,
  },
  general: {
    name: "Career Assistant",
    description: "General career advice and support",
    systemPrompt: `You are a helpful AI career assistant. You provide:

- General career advice and guidance
- Professional development tips
- Work-life balance suggestions
- Industry insights
- Motivational support

Keep responses helpful, clear, and well-formatted with markdown.`,
  },
};

const ROUTABLE_INTENTS = new Set(
  Object.keys(AGENTS).filter((key) => key !== "orchestrator")
);

function normalizeIntent(intent: string): string {
  const normalized = intent.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return ROUTABLE_INTENTS.has(normalized) ? normalized : "general";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Mem0 API functions - Following official v2 API
async function searchMemories(apiKey: string, userId: string, query: string): Promise<string[]> {
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
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, user_id: userId, metadata }),
    });
  } catch (e) {
    console.error("Memory add error:", e);
  }
}

// Intent classification using OpenAI
async function classifyIntent(
  apiKey: string,
  message: string,
  conversationHistory: any[]
): Promise<{ intent: string; confidence: number; context: string }> {
  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Fast model for classification
        messages: [
          { role: "system", content: AGENTS.orchestrator.systemPrompt },
          ...conversationHistory.slice(-2),
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      }),
    }, 12000);

    if (!response.ok) {
      return { intent: "general", confidence: 0.5, context: "fallback" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    try {
      const parsed = JSON.parse(content);
      const confidence = Number(parsed.confidence);
      return {
        intent: normalizeIntent(parsed.intent || "general"),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        context: parsed.context || "",
      };
    } catch {
      return { intent: "general", confidence: 0.5, context: "parse error" };
    }
  } catch {
    return { intent: "general", confidence: 0.5, context: "error" };
  }
}

// Model selection based on task - using OpenAI models
function getOptimalModelForAgent(agentType: string): string {
  switch (agentType) {
    case "cover_letter":
    case "resume":
    case "ats":
    case "salary_negotiation":
    case "networking":
    case "resume_enhance":
      // GPT-4o for complex writing and analysis tasks
      return "gpt-4o";
    case "resume_parse":
      return "gpt-4o";
    case "interview":
    case "job_search":
    case "general":
    default:
      // GPT-4o-mini for faster conversational tasks
      return "gpt-4o-mini";
  }
}

// Execute specialized agent using OpenAI
async function executeAgent(
  apiKey: string,
  agentType: string,
  messages: any[],
  memoryContext: string
): Promise<Response> {
  const normalizedAgentType = normalizeIntent(agentType);
  const agent = AGENTS[normalizedAgentType as keyof typeof AGENTS] || AGENTS.general;
  const optimalModel = getOptimalModelForAgent(normalizedAgentType);
  
  console.log(`[Agent] Executing ${normalizedAgentType} with OpenAI model: ${optimalModel}`);
  
  const systemPrompt = `${agent.systemPrompt}

${memoryContext ? `## User Context (from previous interactions)\n${memoryContext}\n\nUse this context to provide personalized responses.` : ""}

Keep responses clear, well-structured, and actionable. Use markdown formatting for readability.`;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: optimalModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }),
  }, 35000);

  return response;
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

    const payload = await req.json();
    const messages = payload?.messages;
    const agentHint = typeof payload?.agentHint === "string"
      ? normalizeIntent(payload.agentHint)
      : null;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
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

    const latestUserMessage = messages.filter((m: any) => m.role === "user").pop();
    const userQuery = latestUserMessage?.content || "";

    // Parallel execution: classify intent + search memories
    const [intentResult, memories] = await Promise.all([
      agentHint 
        ? Promise.resolve({ intent: agentHint, confidence: 1.0, context: "hint provided" })
        : classifyIntent(OPENAI_API_KEY, userQuery, messages),
      MEM0_API_KEY ? searchMemories(MEM0_API_KEY, user.id, userQuery) : Promise.resolve([]),
    ]);

    const routedIntent = intentResult.confidence < 0.45
      ? "general"
      : normalizeIntent(intentResult.intent);

    console.log(`[Orchestrator] Intent: ${intentResult.intent} (${intentResult.confidence}) -> ${routedIntent}, Memories: ${memories.length}`);

    const memoryContext = memories.length > 0 
      ? memories.map(m => `- ${m}`).join("\n")
      : "";

    // Execute the appropriate agent
    const response = await executeAgent(
      OPENAI_API_KEY,
      routedIntent,
      messages,
      memoryContext
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Background: Add to memory (fire and forget)
    if (MEM0_API_KEY && messages.length > 0) {
      const recentMessages = messages.slice(-4).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      addMemory(MEM0_API_KEY, user.id, recentMessages, {
        agent: routedIntent,
        timestamp: new Date().toISOString(),
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Agent": routedIntent,
      },
    });
  } catch (error) {
    console.error("Orchestrator error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

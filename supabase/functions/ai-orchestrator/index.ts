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
  "intent": "resume" | "ats" | "cover_letter" | "job_search" | "interview" | "general",
  "confidence": 0.0-1.0,
  "context": "brief description of what user needs"
}

Guidelines:
- "resume": Building, editing, or improving resumes
- "ats": Checking resume against job descriptions, ATS compatibility
- "cover_letter": Creating or editing cover letters
- "job_search": Finding jobs, job recommendations, application strategies
- "interview": Mock interviews, interview prep, common questions
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
- Suggest improvements based on industry best practices`,
  },
  ats: {
    name: "ATS Analyst",
    description: "Specializes in ATS compatibility analysis and optimization",
    systemPrompt: `You are an ATS (Applicant Tracking System) expert who helps optimize resumes for automated screening. You understand:

- How ATS systems parse and rank resumes
- Keyword matching algorithms and scoring
- Common ATS parsing failures and how to avoid them
- Industry-specific keyword requirements

When analyzing resumes:
1. Provide a clear ATS Score (0-100)
2. Identify missing keywords from the job description
3. Flag formatting issues that may cause parsing problems
4. Suggest specific improvements with examples
5. Highlight strengths that will rank well

Format your response clearly with sections:
**ATS Score: X/100**
**Strengths:** ...
**Issues Found:** ...
**Missing Keywords:** ...
**Recommendations:** ...`,
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

- Analyzing skills and experience to identify suitable roles
- Understanding job market trends and in-demand skills
- Application strategy and timing optimization
- Networking and referral strategies
- Salary negotiation guidance

When helping with job search:
1. Understand the candidate's background, skills, and goals
2. Identify suitable roles and industries
3. Suggest specific job titles to search for
4. Provide application strategies and tips
5. Recommend ways to stand out from other candidates`,
  },
  interview: {
    name: "Interview Coach",
    description: "Prepares candidates for interviews with practice and feedback",
    systemPrompt: `You are an experienced interview coach who has helped thousands of candidates succeed. Your expertise:

- Behavioral interview questions (STAR method)
- Technical interview preparation
- Case study and situational questions
- Company research and question preparation
- Confidence building and communication skills

When preparing candidates:
1. Understand the role and company they're interviewing for
2. Provide relevant practice questions
3. Coach on STAR method for behavioral questions
4. Give feedback on answer structure and content
5. Share insider tips for specific companies/industries
6. Help with questions to ask the interviewer`,
  },
  general: {
    name: "Career Advisor",
    description: "Provides general career guidance and advice",
    systemPrompt: `You are a friendly, knowledgeable career advisor who helps people navigate their professional journey. You provide:

- Career path guidance and planning
- Skill development recommendations
- Industry insights and trends
- Work-life balance advice
- Professional development tips

Be conversational, supportive, and actionable in your advice. Help users feel confident about their career decisions.`,
  },
};

// Mem0 integration functions
async function searchMemories(apiKey: string, userId: string, query: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.mem0.ai/v1/memories/search/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, user_id: userId, limit: 15 }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (Array.isArray(data)) {
      return data.map((m: any) => m.memory || m.content).filter(Boolean);
    }
    if (data.results && Array.isArray(data.results)) {
      return data.results.map((m: any) => m.memory || m.content).filter(Boolean);
    }
    return [];
  } catch {
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

// Intent classification using orchestrator
async function classifyIntent(
  apiKey: string,
  message: string,
  conversationHistory: any[]
): Promise<{ intent: string; confidence: number; context: string }> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: AGENTS.orchestrator.systemPrompt },
          ...conversationHistory.slice(-3),
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return { intent: "general", confidence: 0.5, context: "fallback" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    try {
      const parsed = JSON.parse(content);
      return {
        intent: parsed.intent || "general",
        confidence: parsed.confidence || 0.5,
        context: parsed.context || "",
      };
    } catch {
      return { intent: "general", confidence: 0.5, context: "parse error" };
    }
  } catch {
    return { intent: "general", confidence: 0.5, context: "error" };
  }
}

// Execute specialized agent
async function executeAgent(
  apiKey: string,
  agentType: string,
  messages: any[],
  memoryContext: string,
  userMessage: string
): Promise<Response> {
  const agent = AGENTS[agentType as keyof typeof AGENTS] || AGENTS.general;
  
  const systemPrompt = `${agent.systemPrompt}

${memoryContext ? `## User Context (from previous interactions)\n${memoryContext}\n\nUse this context to provide personalized responses.` : ""}

Keep responses clear, well-structured, and actionable. Use markdown formatting for readability.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }),
  });

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

    const { messages, agentHint } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");

    if (!LOVABLE_API_KEY) {
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
        : classifyIntent(LOVABLE_API_KEY, userQuery, messages),
      MEM0_API_KEY ? searchMemories(MEM0_API_KEY, user.id, userQuery) : Promise.resolve([]),
    ]);

    console.log(`[Orchestrator] Intent: ${intentResult.intent} (${intentResult.confidence}), Memories: ${memories.length}`);

    const memoryContext = memories.length > 0 
      ? memories.map(m => `- ${m}`).join("\n")
      : "";

    // Execute the appropriate agent
    const response = await executeAgent(
      LOVABLE_API_KEY,
      intentResult.intent,
      messages,
      memoryContext,
      userQuery
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Agent error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
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
        agent: intentResult.intent,
        timestamp: new Date().toISOString(),
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Agent": intentResult.intent,
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

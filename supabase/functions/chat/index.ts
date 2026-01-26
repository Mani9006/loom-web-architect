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

Keep responses clear, actionable, and well-formatted with markdown.`,

  ats: `You are an ATS (Applicant Tracking System) expert. When analyzing resumes:

1. Provide a clear **ATS Score: X/100**
2. List **Strengths** that will rank well
3. Identify **Issues Found** (formatting, parsing problems)
4. Highlight **Missing Keywords** from the job description
5. Give specific **Recommendations** with examples

Be thorough and actionable.`,

  cover_letter: `You are an expert cover letter writer. Create compelling, personalized letters that:

1. Hook readers with a strong opening
2. Connect specific achievements to job requirements
3. Show personality while maintaining professionalism
4. End with a clear call-to-action

Keep letters 250-400 words, tailored to each opportunity.`,

  job_search: `You are a job search strategist. Help users by:

1. Analyzing their skills and experience
2. Suggesting suitable roles and industries
3. Recommending specific job titles to search
4. Providing application strategies
5. Advising on networking and referrals`,

  interview: `You are an experienced interview coach. Prepare candidates by:

1. Understanding the role and company
2. Providing relevant practice questions
3. Coaching on STAR method for behavioral questions
4. Giving feedback on answer structure
5. Sharing industry-specific tips`,
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get latest user message for memory search
    const latestUserMessage = messages.filter((m: any) => m.role === "user").pop();
    const userQuery = latestUserMessage?.content || "";

    // Select appropriate system prompt based on mode
    const chatMode = mode || "general";

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

    const basePrompt = SYSTEM_PROMPTS[chatMode] || SYSTEM_PROMPTS.general;
    const systemPrompt = basePrompt + memoryContext;

    console.log(`[Chat] Mode: ${chatMode}, Messages: ${messages.length}`);

    // Select optimal model based on chat mode (benchmark-driven)
    // - cover_letter/ats: Pro for quality writing and analysis
    // - interview/job_search: Flash for conversational speed
    // - general: Flash for fast responses
    const modelForMode: Record<string, string> = {
      cover_letter: "google/gemini-2.5-pro",
      ats: "google/gemini-2.5-pro", 
      resume: "google/gemini-2.5-pro",
      interview: "google/gemini-3-flash-preview",
      job_search: "google/gemini-3-flash-preview",
      general: "google/gemini-3-flash-preview",
    };
    
    // Allow explicit model override from request, otherwise use mode-based selection
    const selectedModel = requestedModel || modelForMode[chatMode] || "google/gemini-3-flash-preview";
    console.log(`[Chat] Using model: ${selectedModel} for mode: ${chatMode}${requestedModel ? ' (override)' : ''}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

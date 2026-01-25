import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mem0 API helper functions
async function searchMem0Memories(apiKey: string, userId: string, query: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.mem0.ai/v1/memories/search/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        user_id: userId,
        limit: 10,
      }),
    });

    if (!response.ok) {
      console.error("Mem0 search error:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    console.log("Mem0 search results:", data);
    
    // Extract memory content from results
    if (Array.isArray(data)) {
      return data.map((m: any) => m.memory || m.content).filter(Boolean);
    }
    if (data.results && Array.isArray(data.results)) {
      return data.results.map((m: any) => m.memory || m.content).filter(Boolean);
    }
    return [];
  } catch (error) {
    console.error("Mem0 search error:", error);
    return [];
  }
}

async function addMem0Memory(apiKey: string, userId: string, messages: any[]): Promise<void> {
  try {
    const response = await fetch("https://api.mem0.ai/v1/memories/", {
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

    if (!response.ok) {
      console.error("Mem0 add error:", response.status, await response.text());
      return;
    }

    const data = await response.json();
    console.log("Mem0 memory added:", data);
  } catch (error) {
    console.error("Mem0 add error:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

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

    // Get the latest user message for memory search
    const latestUserMessage = messages.filter((m: any) => m.role === "user").pop();
    const userQuery = latestUserMessage?.content || "";

    // Search for relevant memories from Mem0
    let memoryContext = "";
    if (MEM0_API_KEY && userQuery) {
      console.log("Searching Mem0 for relevant memories...");
      const memories = await searchMem0Memories(MEM0_API_KEY, user.id, userQuery);
      
      if (memories.length > 0) {
        memoryContext = `\n\n## User Memory Context\nThe following are relevant facts you remember about this user from previous conversations:\n${memories.map(m => `- ${m}`).join("\n")}\n\nUse this context to provide more personalized and relevant responses.`;
        console.log("Found", memories.length, "relevant memories");
      }
    }

    console.log("Calling Lovable AI Gateway with", messages.length, "messages");

    const systemPrompt = `You are a helpful, friendly AI assistant with persistent memory. You help users with a wide variety of tasks including writing, analysis, coding, math, creative projects, and general questions.

Keep your responses clear, well-structured, and helpful. Use markdown formatting when appropriate for better readability.

Be conversational yet professional. If you don't know something, say so honestly rather than making things up.

You have memory capabilities - you can remember user preferences, past interactions, and important details they share. When users tell you about themselves, their preferences, or important information, acknowledge that you'll remember it.${memoryContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
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
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming response from AI gateway");

    // Add memories to Mem0 in the background (don't block response)
    if (MEM0_API_KEY && messages.length > 0) {
      // Run memory addition asynchronously without blocking response
      const addMemoryTask = async () => {
        try {
          // Only add the last user-assistant exchange to avoid duplicates
          const recentMessages = messages.slice(-2).map((m: any) => ({
            role: m.role,
            content: m.content,
          }));
          await addMem0Memory(MEM0_API_KEY, user.id, recentMessages);
        } catch (error) {
          console.error("Background memory add error:", error);
        }
      };
      
      // Fire and forget - don't await
      addMemoryTask();
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatFree } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json();
    const bullet: string | undefined = body.bullet ?? body.line;
    const jobTitle: string | undefined = body.jobTitle;
    const company: string | undefined = body.company;
    const mode: "tighten" | "keywords" | "voice" | undefined = body.mode;
    const fullResume: string | undefined = body.context?.full_resume;

    if (!bullet) {
      return new Response(JSON.stringify({ error: "Bullet text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modeInstructions: Record<string, string> = {
      tighten:
        "Focus on cutting filler words and tightening the phrasing. Each version should be as short as possible while keeping the impact and any metrics — aim for under 15 words.",
      keywords:
        "Focus on weaving in industry-standard, ATS-friendly keywords and skills relevant to the role, without making it sound like keyword stuffing.",
      voice:
        "Focus on making the bullet sound natural and personal, like the candidate is describing it in their own words, while staying professional and specific.",
    };

    const result = await chatFree(
      "lite",
      [
        {
          role: "system",
          content: `You are an expert resume writer. Given a resume bullet point, generate exactly 3 improved versions using the STAR method (Situation, Task, Action, Result).
Each version should:
- Start with a strong action verb
- Include quantifiable metrics where possible
- Be concise (under 25 words)
- Be ATS-optimized with relevant keywords
${mode && modeInstructions[mode] ? `\nAdditional instruction: ${modeInstructions[mode]}` : ""}

Return ONLY a JSON object: {"suggestions": ["improved bullet 1", "improved bullet 2", "improved bullet 3"]}`,
        },
        {
          role: "user",
          content: `Improve this bullet point for a ${jobTitle || "professional"} role at ${company || "a company"}${
            fullResume ? " (see the rest of the resume for context)" : ""
          }:\n\n"${bullet}"`,
        },
      ],
      { maxTokens: 500, temperature: 0.7 },
    );
    const content = result.text || "";

    // Parse JSON from response
    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(content);
      suggestions = parsed.suggestions || [];
    } catch {
      // Try extracting from markdown
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        suggestions = parsed.suggestions || [];
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

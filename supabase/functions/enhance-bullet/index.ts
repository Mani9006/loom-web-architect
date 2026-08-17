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

    const { bullet, jobTitle, company, mode, context } = await req.json();

    if (!bullet) {
      return new Response(JSON.stringify({ error: "Bullet text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullResume = typeof context?.full_resume === "string" ? context.full_resume.slice(0, 4000) : "";
    const MODE_INSTRUCTIONS: Record<string, string> = {
      tighten: `Rewrite the line to be as concise and punchy as possible without losing meaning. Cut filler words, redundant qualifiers, and weak phrasing. Keep it under 18 words per version.`,
      keywords: `Rewrite the line to naturally weave in role-relevant skills, tools, and terminology${fullResume ? " that also appear elsewhere in the candidate's resume below" : ""}, so it reads well to both ATS keyword scanners and human recruiters. Do not keyword-stuff — every term must fit naturally.${fullResume ? `\n\nRest of resume for context:\n${fullResume}` : ""}`,
      voice: `Rewrite the line so it sounds like a real person's authentic, confident voice rather than generic corporate resume-speak — natural phrasing, first-person energy implied (no "I"), still professional and concise.`,
    };
    const styleInstruction = (mode && MODE_INSTRUCTIONS[mode]) ||
      `Generate exactly 3 improved versions using the STAR method (Situation, Task, Action, Result).
Each version should:
- Start with a strong action verb
- Include quantifiable metrics where possible
- Be concise (under 25 words)
- Be ATS-optimized with relevant keywords`;

    const result = await chatFree(
      "lite",
      [
        {
          role: "system",
          content: `You are an expert resume writer. Given a resume bullet point, generate exactly 3 improved versions.
${styleInstruction}

Return ONLY a JSON object: {"suggestions": ["improved bullet 1", "improved bullet 2", "improved bullet 3"]}`,
        },
        {
          role: "user",
          content: `Improve this bullet point for a ${jobTitle || "professional"} role at ${company || "a company"}:\n\n"${bullet}"`,
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

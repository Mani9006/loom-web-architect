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

    const fullResume = typeof context?.full_resume === "string" ? context.full_resume : "";

    const modeInstructions: Record<string, string> = {
      tighten: `You are an expert resume editor. Given a resume bullet point, generate exactly 3 tightened versions.
Each version should:
- Cut filler words and redundant phrasing while preserving every fact and metric
- Start with a strong action verb
- Be as short as possible without losing meaning (aim for under 18 words)
- Be ATS-optimized with relevant keywords`,
      keywords: `You are an expert resume editor optimizing for ATS keyword coverage. Given a resume bullet point${jobTitle ? ` for a ${jobTitle} role` : ""}${company ? ` at ${company}` : ""}, generate exactly 3 improved versions.
Each version should:
- Weave in relevant industry/role keywords and tools a recruiter or ATS would search for
- Start with a strong action verb
- Include quantifiable metrics where possible
- Be concise (under 25 words)`,
      voice: `You are an expert resume editor matching the candidate's own voice. Given a resume bullet point and the rest of their resume as style reference, generate exactly 3 improved versions.
Each version should:
- Match the tone, vocabulary, and phrasing patterns used elsewhere in the resume below
- Start with a strong action verb
- Include quantifiable metrics where possible
- Be concise (under 25 words)

Resume for style reference:
"""
${fullResume.slice(0, 4000)}
"""`,
    };

    const systemPrompt = modeInstructions[mode] ?? `You are an expert resume writer. Given a resume bullet point, generate exactly 3 improved versions using the STAR method (Situation, Task, Action, Result).
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
          content: `${systemPrompt}

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

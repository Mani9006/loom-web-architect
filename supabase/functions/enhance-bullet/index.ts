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
    // Two callers with different shapes: the Resume Builder's section editor
    // sends { bullet, jobTitle, company }; My Collection's tailored-resume
    // canvas editor sends { line, mode, context: { full_resume } }. Support
    // both instead of only the first (the second used to 400 here every time).
    const bulletText: string | undefined = body.bullet ?? body.line;
    const { jobTitle, company, mode, context } = body;
    const fullResume: string | undefined = context?.full_resume;

    if (!bulletText) {
      return new Response(JSON.stringify({ error: "Bullet text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instructionsByMode: Record<string, string> = {
      tighten: `Given a resume bullet point, generate exactly 3 tightened versions that cut filler words and say the same thing more concisely.
Each version should:
- Start with a strong action verb
- Preserve every fact, metric, and detail already in the original, do not invent new ones
- Be noticeably shorter than the original
- Be ATS-optimized with relevant keywords`,
      keywords: `Given a resume bullet point (and, if provided, the surrounding resume for context), generate exactly 3 versions that work in more role-relevant keywords.
Each version should:
- Start with a strong action verb
- Naturally incorporate keywords/skills that appear elsewhere in the candidate's resume where genuinely relevant, never fabricated
- Be concise (under 25 words)
- Be ATS-optimized`,
      voice: `Given a resume bullet point, generate exactly 3 versions that sound more natural and personal, less like generic corporate resume-speak, while staying professional.
Each version should:
- Start with a strong action verb
- Keep every fact and metric from the original unchanged
- Be concise (under 25 words)
- Avoid cliché resume buzzwords ("synergy", "leverage", "spearheaded")`,
    };
    const instructions =
      instructionsByMode[mode as string] ??
      `Given a resume bullet point, generate exactly 3 improved versions using the STAR method (Situation, Task, Action, Result).
Each version should:
- Start with a strong action verb
- Include quantifiable metrics where possible
- Be concise (under 25 words)
- Be ATS-optimized with relevant keywords`;

    const userContext = fullResume
      ? `Improve this bullet point from the resume below:\n\n"${bulletText}"\n\n──────── FULL RESUME (for context only) ────────\n${fullResume.slice(0, 4000)}`
      : `Improve this bullet point for a ${jobTitle || "professional"} role at ${company || "a company"}:\n\n"${bulletText}"`;

    const result = await chatFree(
      "lite",
      [
        {
          role: "system",
          content: `You are an expert resume writer. ${instructions}\n\nReturn ONLY a JSON object: {"suggestions": ["improved bullet 1", "improved bullet 2", "improved bullet 3"]}`,
        },
        {
          role: "user",
          content: userContext,
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

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

    const body = await req.json().catch(() => ({}));
    const { jobTitle, company } = body ?? {};
    // Accept `line` as an alias: the My Collection canvas editor historically
    // sent { line, mode } and every request failed the required-field check.
    const bullet = typeof body?.bullet === "string" && body.bullet.trim()
      ? body.bullet.trim()
      : typeof body?.line === "string" ? body.line.trim() : "";
    const MODE_HINTS: Record<string, string> = {
      tighten: "Focus on making it shorter and punchier without losing meaning.",
      keywords: "Focus on weaving in relevant, ATS-friendly industry keywords the original genuinely supports.",
      voice: "Keep the candidate's own tone and wording style; only polish clarity and impact.",
    };
    const modeHint = typeof body?.mode === "string" ? MODE_HINTS[body.mode] ?? "" : "";

    if (!bullet) {
      return new Response(JSON.stringify({ error: "Bullet text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

Return ONLY a JSON object: {"suggestions": ["improved bullet 1", "improved bullet 2", "improved bullet 3"]}`,
        },
        {
          role: "user",
          content: `Improve this bullet point for a ${jobTitle || "professional"} role at ${company || "a company"}:\n\n"${bullet.slice(0, 1000)}"${modeHint ? `\n\n${modeHint}` : ""}\n\nNever invent employers, dates, or metrics that are not implied by the original.`,
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

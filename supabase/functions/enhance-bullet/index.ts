import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mode → system-prompt fragment
const MODE_INSTRUCTIONS: Record<string, string> = {
  tighten:
    "Make the bullet more concise and punchy. Remove filler words. Lead with a strong action verb. Keep it under 20 words where possible.",
  keywords:
    "Inject relevant ATS keywords from the job description context (if provided) while preserving the original meaning and factual accuracy.",
  voice:
    "Rewrite the bullet to sound more natural and authentic — less corporate, more human — while keeping all facts intact.",
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

    // Support both interfaces:
    //   New (CanvasEditor): { line, mode, context: { full_resume } }
    //   Old (legacy):       { bullet, jobTitle, company }
    const bulletText: string = body.line || body.bullet || "";
    const mode: string = body.mode || "tighten";
    const contextResume: string = body.context?.full_resume || "";
    const jobTitle: string = body.jobTitle || "";
    const company: string = body.company || "";

    if (!bulletText.trim()) {
      return new Response(JSON.stringify({ error: "No bullet text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.tighten;

    const contextBlock = [
      contextResume ? `Resume context (for tone/keyword reference):\n${contextResume.slice(0, 2000)}` : "",
      jobTitle ? `Target role: ${jobTitle}` : "",
      company ? `Company: ${company}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Try Anthropic first, fall back to OpenAI.
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    let suggestions: string[] = [];

    if (anthropicKey) {
      const systemPrompt = [
        "You are an expert resume writer. Given a resume bullet point, generate exactly 3 improved versions.",
        modeInstruction,
        "Rules for all versions:",
        "- Never invent new facts, metrics, employers, or skills",
        "- Each version must be a single sentence",
        "- Return ONLY valid JSON: {\"suggestions\": [\"version 1\", \"version 2\", \"version 3\"]}",
      ].join("\n");

      const userMsg = contextBlock
        ? `${contextBlock}\n\nBullet to improve:\n"${bulletText}"`
        : `Improve this resume bullet:\n"${bulletText}"`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.content?.[0]?.text || "";
        try {
          const parsed = JSON.parse(content);
          suggestions = parsed.suggestions || [];
        } catch {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) suggestions = JSON.parse(match[0]).suggestions || [];
        }
      }
    }

    // Fall back to OpenAI if Anthropic didn't produce suggestions.
    if (suggestions.length === 0 && openaiKey) {
      const systemPrompt = [
        "You are an expert resume writer. Generate exactly 3 improved versions of the given bullet.",
        modeInstruction,
        "Rules: never invent facts, each version is one sentence.",
        'Return ONLY JSON: {"suggestions": ["v1", "v2", "v3"]}',
      ].join(" ");

      const userMsg = contextBlock
        ? `${contextBlock}\n\nBullet: "${bulletText}"`
        : `Improve this resume bullet: "${bulletText}"`;

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ],
          temperature: 0.7,
          max_tokens: 512,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        try {
          const parsed = JSON.parse(content);
          suggestions = parsed.suggestions || [];
        } catch {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) suggestions = JSON.parse(match[0]).suggestions || [];
        }
      }
    }

    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No AI API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("enhance-bullet error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

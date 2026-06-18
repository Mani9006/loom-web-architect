import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supports two calling conventions:
//  Legacy:  { bullet, jobTitle?, company? }
//  Canvas:  { line, mode: "tighten"|"keywords"|"voice", context?: { full_resume } }
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

    // Normalise both calling conventions to a single set of variables.
    const bulletText: string = body.line ?? body.bullet ?? "";
    const jobTitle: string = body.jobTitle ?? "";
    const company: string = body.company ?? "";
    const mode: "tighten" | "keywords" | "voice" | null = body.mode ?? null;
    const fullResume: string = body.context?.full_resume ?? "";

    if (!bulletText) {
      return new Response(JSON.stringify({ error: "Bullet text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a mode-specific system prompt.
    let modeInstruction = "";
    if (mode === "tighten") {
      modeInstruction =
        "Make the bullet more concise and punchy — remove filler, keep all key facts and metrics. Each suggestion must be shorter than the original.";
    } else if (mode === "keywords") {
      modeInstruction =
        "Add relevant ATS keywords and industry-standard terminology that strengthen this bullet. Do NOT invent accomplishments not implied by the original.";
    } else if (mode === "voice") {
      modeInstruction =
        "Rewrite the bullet to sound more natural and human — confident, first-person active voice, no corporate jargon.";
    } else {
      modeInstruction =
        "Start with a strong action verb, include quantifiable metrics where possible, be concise (under 25 words), and be ATS-optimised.";
    }

    const contextSection = fullResume
      ? `\n\nFull resume context (for tone and consistency — do NOT add facts not present here):\n${fullResume.slice(0, 3000)}`
      : jobTitle || company
      ? `\n\nTarget role: ${jobTitle || "professional"} at ${company || "a company"}`
      : "";

    const systemPrompt = `You are an expert resume writer. Given a resume bullet point, generate exactly 3 improved versions.

${modeInstruction}

Rules:
- Do NOT invent companies, dates, metrics, or skills not implied by the original line.
- Each suggestion must be a single bullet line (no markdown formatting).
- Return ONLY valid JSON: {"suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]}${contextSection}`;

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    let suggestions: string[] = [];

    if (anthropicKey) {
      // Prefer Claude Haiku (cheap, fast, high-quality for line rewrites).
      const response = await fetch("https://api.anthropic.com/v1/messages", {
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
          messages: [{ role: "user", content: `Improve this bullet:\n\n"${bulletText}"` }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? "";
      try {
        const parsed = JSON.parse(content);
        suggestions = parsed.suggestions ?? [];
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          suggestions = parsed.suggestions ?? [];
        }
      }
    } else if (openaiKey) {
      // Fallback to OpenAI if no Anthropic key.
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Improve this bullet:\n\n"${bulletText}"` },
          ],
          temperature: 0.7,
          max_tokens: 512,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      try {
        const parsed = JSON.parse(content);
        suggestions = parsed.suggestions ?? [];
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          suggestions = parsed.suggestions ?? [];
        }
      }
    } else {
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

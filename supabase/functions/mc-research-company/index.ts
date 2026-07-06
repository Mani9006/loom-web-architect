// supabase/functions/mc-research-company/index.ts
// Cheap company research using Gemini 2.0 Flash (~10x cheaper than Sonnet).
// Cached per (session, company) for 30 days. Used when user opens a job
// from a company we haven't researched yet.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_MODEL = "gemini-2.0-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, company_slug, company_name, job_title } = await req.json();
    if (!session_id || !company_slug || !company_name) {
      return new Response(JSON.stringify({ error: "session_id, company_slug, company_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const auth = req.headers.get("authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Check cache
    const { data: cached } = await supabase
      .from("mc_company_research")
      .select("*")
      .eq("session_id", session_id)
      .eq("company_slug", company_slug)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached) {
      return new Response(JSON.stringify({ research: cached, cached: true }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Generate fresh
    const prompt = `Research the company "${company_name}" (slug: ${company_slug})${job_title ? ` for someone applying to a "${job_title}" role` : ""}.

Output a structured markdown report with these sections (be concise, factual, no fluff):

## What they do
2-3 sentences on the company's product / business.

## Recent signals
3-5 bullets: recent news, funding, hiring trends, layoffs, leadership changes — anything from the last 12 months.

## Engineering / role-relevant
For ${job_title ? "a " + job_title + " candidate" : "a tech candidate"}: what tech stack do they use, what's the engineering culture vibe, are they known for high bar / good interview process / good comp?

## Interview process (if known)
Typical # of rounds, types (technical / behavioral / system design), notable quirks.

## Talking points
3-4 specific things the candidate should mention to show they researched the company.

## Red flags (be honest)
1-3 things to watch out for if any.

Keep total length under 600 words. If you don't know something, say so — don't make it up.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1500,
          },
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const research_md = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const tokens_in = data.usageMetadata?.promptTokenCount ?? 0;
    const tokens_out = data.usageMetadata?.candidatesTokenCount ?? 0;

    if (!research_md) throw new Error("Empty response from Gemini");

    // Upsert, not insert: mc_company_research has a UNIQUE(session_id, company_slug)
    // constraint, so two concurrent requests for the same job (double-click, two
    // open tabs) would otherwise race — the second insert violates the
    // constraint and surfaces as a hard "research failed" error even though
    // valid research was already generated and cached by the first request.
    const { data: row, error } = await supabase
      .from("mc_company_research")
      .upsert(
        {
          user_id: user.id,
          session_id,
          company_slug,
          company_name,
          research_md,
          model: GEMINI_MODEL,
          tokens_in,
          tokens_out,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "session_id,company_slug" },
      )
      .select()
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ research: row, cached: false }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});

/**
 * career-ops-linkedin — Optimize LinkedIn artifacts.
 *
 * Model routing:
 *   - headline, about      → Sonnet 4.6 (brand voice, concise)
 *   - post                 → Sonnet 4.6 (structure + hook)
 *   - connection_note      → Haiku 4.5 (short templated)
 *
 * Body: {
 *   kind: "headline" | "about" | "post" | "connection_note",
 *   target_role?: string,
 *   source_text?: string,    // current LinkedIn text, optional
 *   context?: string,        // e.g. topic for a post, or who the note is for
 * }
 * Returns: { optimization: {...row} }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude, Tier, truncate } from "../_shared/ai.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

type Kind = "headline" | "about" | "post" | "connection_note";

interface Output {
  output_text: string;
  rationale: string;
}

const SYSTEM: Record<Kind, string> = {
  headline: `You write LinkedIn headlines. 120 chars max. Lead with role, add proof, end with the value the person delivers. No clichés ("driven", "passionate", "innovative"). No emojis. No "|" spam — use a single middle-dot separator. Produce ONE headline + a two-sentence rationale.

Return ONLY JSON: {"output_text": string, "rationale": string}`,

  about: `You write LinkedIn About sections. 1800 chars max (~300 words). Structure:
1. Opening hook (one bold sentence about what you do and who for).
2. Two paragraphs of proof — concrete projects, numbers, outcomes. Don't invent facts not in the source résumé.
3. One paragraph on what you're looking for next.
4. A short CTA ("Open to…" or "Reach out about…").

Tone: confident, direct, no LinkedIn boilerplate. Plain ASCII. No emojis.

Return ONLY JSON: {"output_text": string, "rationale": 2-3 sentence explanation of tradeoffs you made}`,

  post: `You write LinkedIn posts. 1200 chars max. Structure:
- Hook line (a concrete observation or counterintuitive claim).
- 3-5 short paragraphs, one idea per paragraph, blank lines between.
- End with a question or invitation to discuss.

No corporate lingo, no emojis, no hashtag spam (max 3 relevant hashtags at the end).

Return ONLY JSON: {"output_text": string, "rationale": string}`,

  connection_note: `You write LinkedIn connection notes. 240 chars max. Reference one specific thing about the person or their work. State briefly why connecting is mutually useful. Don't pitch.

Return ONLY JSON: {"output_text": string, "rationale": "one sentence"}`,
};

const TIER_FOR: Record<Kind, Tier> = {
  headline: "complex",
  about: "complex",
  post: "complex",
  connection_note: "simple",
};

function buildResumeContext(resume: any): string {
  if (!resume) return "";
  const p: string[] = [];
  if (resume.personal_info?.name) p.push(`Name: ${resume.personal_info.name}`);
  if (resume.summary || resume.personal_info?.summary) p.push(`Summary: ${resume.summary || resume.personal_info.summary}`);
  if (Array.isArray(resume.experience)) {
    p.push("Experience:");
    for (const x of resume.experience.slice(0, 4)) {
      p.push(`- ${x.title ?? ""} @ ${x.company ?? ""}`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets.slice(0, 3)) p.push(`  • ${b}`);
    }
  }
  if (Array.isArray(resume.skills)) p.push("Skills: " + resume.skills.slice(0, 20).map((s: any) => s?.name || s).join(", "));
  return p.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({})) as {
      kind?: Kind; target_role?: string; source_text?: string; context?: string;
    };
    if (!body.kind || !(body.kind in SYSTEM)) throw new HttpError(400, "invalid kind");

    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "linkedin", isPro);

    const { data: resumes } = await svc.from("resumes").select("*")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1);
    const resume = resumes?.[0];
    if (!resume && body.kind !== "connection_note") {
      throw new HttpError(412, "upload or build a résumé first — we use it to ground the writing");
    }

    const userPrompt = [
      body.target_role ? `Target role: ${body.target_role}` : "",
      body.source_text ? `Current LinkedIn text:\n"""\n${truncate(body.source_text, 4000)}\n"""` : "",
      body.context ? `Context:\n${truncate(body.context, 2000)}` : "",
    ].filter(Boolean).join("\n\n") || "Optimise based on the resume context.";

    const result = await callClaude<Output>({
      tier: TIER_FOR[body.kind],
      system: SYSTEM[body.kind],
      cachedContext: resume ? `Candidate résumé context:\n${buildResumeContext(resume)}` : undefined,
      user: userPrompt,
      maxTokens: body.kind === "about" ? 1500 : body.kind === "post" ? 900 : 500,
      temperature: 0.4,
      parseJson: true,
    });
    const payload = result.text;

    const { data: saved, error: saveErr } = await svc.from("linkedin_optimizations").insert({
      user_id: user.id,
      kind: body.kind,
      target_role: body.target_role ?? null,
      source_text: body.source_text ?? null,
      output_text: payload.output_text,
      rationale: payload.rationale,
      model: result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
    }).select().single();
    if (saveErr) throw new HttpError(500, `save: ${saveErr.message}`);

    await logAiUsage(svc, user.id, "linkedin", result.tokens_in, result.tokens_out);
    return jsonResponse({ optimization: saved });
  });
});

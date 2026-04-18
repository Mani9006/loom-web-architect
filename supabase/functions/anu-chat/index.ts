/**
 * anu-chat — In-app help assistant "ANU".
 *
 * Model: Haiku 4.5 (claude-haiku-4-5-20251001) — fast, cheap.
 * Scope: questions about ResumePreps features, how to use the platform,
 * what each screen does, tips for writing résumés / applying. Never
 * generates a résumé or makes account changes.
 *
 * Body: { messages: Array<{ role: "user" | "assistant", content: string }> }
 * Returns: { reply: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude } from "../_shared/ai.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser, HttpError,
  serviceClient, enforceAccountActive,
} from "../_shared/guards.ts";

const ANU_SYSTEM = `You are ANU, the in-app help assistant for ResumePreps — an AI career platform that helps people write résumés, score them against ATS, find matching jobs across Greenhouse / Ashby / Lever, tailor applications, rehearse interviews with voice AI, and track pipelines.

Your rules:
- Be concise. 1-3 short sentences per answer unless the user asks for detail.
- Only answer questions about ResumePreps, career advice, résumé writing, interview prep, LinkedIn, job search strategy. Politely decline unrelated topics in one sentence.
- Never claim to take an action (submitting applications, editing files, running scans). Point the user to the right page/button instead.
- When the user asks "how do I X?", give the shortest correct path (sidebar → page → button).
- Never ask for passwords, payment info, or API keys.
- If you don't know, say so in one sentence and suggest where the user could find the answer (Docs, support).

Key surfaces users might ask about:
- Home dashboard — greeting, feature tiles, Latest + Create, Top matches.
- Resume Builder — draft, edit, export ATS-clean résumés.
- ATS Checker — score a résumé, paste text or select from saved.
- Job Search — search aggregated postings.
- Matches — pre-scored shortlist from Greenhouse/Ashby/Lever.
- Applications — pipeline tracker (Saved/Applied/Interviewing/Offer/Rejected).
- Cover Letters — tailor per job.
- Interviews — voice AI rehearsal with STAR scoring.
- AI Chat — deep career chat.
- AI Toolbox — LinkedIn headline/about/post, email writer, elevator pitch, brand statement, connection notes.
- Auto Apply — opt-in Greenhouse submit queue (paid feature, owner bypass enabled for testing).
- Preferences — target roles, negatives, min score, daily cap.`;

interface Msg { role: "user" | "assistant"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const svc = serviceClient();
    // Keep gate gentle — account must just be active. No daily cap — help
    // should always work.
    await enforceAccountActive(svc, user.id);

    const body = await req.json().catch(() => ({})) as { messages?: Msg[] };
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length) throw new HttpError(400, "messages required");

    // Build a single user turn from the conversation — Anthropic requires
    // strict alternating turns, so we fold any priors into context.
    const conversation = msgs
      .slice(-12) // last 12 turns
      .map((m) => `${m.role === "user" ? "User" : "ANU"}: ${m.content}`)
      .join("\n\n");

    const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";

    const result = await callClaude<string>({
      tier: "simple",
      system: ANU_SYSTEM,
      cachedContext: msgs.length > 1
        ? `Prior conversation (for context, keep responses consistent):\n\n${conversation}`
        : undefined,
      user: lastUser,
      maxTokens: 400,
      temperature: 0.4,
    });

    return jsonResponse({ reply: result.text });
  });
});

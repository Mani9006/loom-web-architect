/**
 * career-ops-story-bank — Extract STAR+Reflection stories from the user's
 * resume + latest evaluations. These become reusable interview ammunition.
 *
 * Model: Sonnet 4.6 (narrative extraction + reflection writing).
 *
 * Body: { limit?: number, theme_filter?: string }
 * Returns: { added: number, stories: row[] }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude } from "../_shared/ai.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

interface StoryPayload {
  stories: Array<{
    title: string;
    theme: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
    archetypes: string[];
  }>;
}

const SYSTEM = `You are an interview-prep coach. Given a candidate's résumé and a list of evaluated jobs with gaps/strengths, extract 5-7 distinct STAR+Reflection stories they can reuse across interviews.

Rules:
- NEVER fabricate facts. Every story must be grounded in something from the résumé.
- Each story answers behavioural prompts (leadership, conflict, failure, impact, collaboration, technical tradeoff).
- STAR: 1-2 sentences each for Situation / Task / Action / Result. Result MUST be concrete (numbers if source had them).
- Reflection: 1 sentence about what the candidate learned or would do differently. No platitudes.
- Title: 6 words max, distinctive.
- Archetypes: 1-4 tags from [Backend, Frontend, Fullstack, ML, Data, PM, Design, DevOps, Security, SA, Leadership, IC].

Return ONLY JSON:
{"stories": [{"title","theme","situation","task","action","result","reflection","archetypes":[]}, ...]}`;

function resumeContext(r: any): string {
  const p: string[] = [];
  if (r.personal_info?.name) p.push(`Name: ${r.personal_info.name}`);
  if (r.summary || r.personal_info?.summary) p.push(`Summary: ${r.summary || r.personal_info.summary}`);
  if (Array.isArray(r.experience)) {
    p.push("## Experience");
    for (const x of r.experience) {
      p.push(`- ${x.title ?? ""} @ ${x.company ?? ""} (${x.start_date ?? ""}–${x.end_date ?? "present"})`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets) p.push(`  • ${b}`);
    }
  }
  if (Array.isArray(r.projects)) {
    p.push("## Projects");
    for (const p2 of r.projects) p.push(`- ${p2.name}: ${p2.description}`);
  }
  return p.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "story", isPro);

    const { data: resumes } = await svc.from("resumes").select("*")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1);
    const resume = resumes?.[0];
    if (!resume) throw new HttpError(412, "no resume yet");

    const { data: evals } = await svc.from("job_evaluations")
      .select("summary,keyword_matches,gaps,star_stories,archetype")
      .eq("user_id", user.id)
      .order("score", { ascending: false })
      .limit(8);

    const evalSummary = (evals || [])
      .map((e) => `- ${e.archetype ?? "—"}: ${e.summary ?? ""}; strengths=${(e.keyword_matches || []).join(", ")}; gaps=${(e.gaps || []).join(", ")}`)
      .join("\n");

    const result = await callClaude<StoryPayload>({
      tier: "complex",
      system: SYSTEM,
      cachedContext: `Candidate résumé:\n${resumeContext(resume)}`,
      user: `Recent evaluations (for flavor of what roles they're targeting):\n${evalSummary || "(none yet)"}\n\nExtract 5-7 STAR+R stories.`,
      maxTokens: 2200,
      temperature: 0.3,
      parseJson: true,
    });
    const payload = result.text;

    // Insert as new stories (keep prior ones; stories accumulate).
    const rows = (payload.stories ?? []).map((s) => ({
      user_id: user.id,
      title: s.title,
      theme: s.theme,
      situation: s.situation,
      task: s.task,
      action: s.action,
      result: s.result,
      reflection: s.reflection,
      archetypes: s.archetypes ?? [],
    }));

    let added = 0;
    if (rows.length) {
      const { data: saved } = await svc.from("interview_stories").insert(rows).select("id");
      added = (saved || []).length;
    }

    await logAiUsage(svc, user.id, "story", result.tokens_in, result.tokens_out);

    const { data: all } = await svc.from("interview_stories")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(20);

    return jsonResponse({ added, stories: all ?? [] });
  });
});

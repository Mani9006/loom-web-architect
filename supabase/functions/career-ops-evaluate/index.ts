/**
 * career-ops-evaluate — A-F scoring of a scanned job for a user.
 *
 * Model: Sonnet 4.6 (complex reasoning over résumé + JD).
 *
 * Body: { scanned_job_id: uuid, force?: boolean }
 * Returns: { evaluation, cached }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude, truncate } from "../_shared/ai.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

const MAX_DESC = 12_000;

interface EvaluationPayload {
  score: number;
  tier: "A" | "B" | "C" | "D" | "F";
  archetype: string;
  summary: string;
  keyword_matches: string[];
  gaps: string[];
  star_stories: Array<{ situation: string; task: string; action: string; result: string }>;
  report_md: string;
}

const SYSTEM_PROMPT = `You are a career-ops evaluator. You score how well a candidate's resume fits a specific job posting on a 0.0–5.0 scale and produce a concise A-F tiered report.

Dimensions (average → final score, 2 decimals):
  role match, skills match, level fit, domain fit, comp/location, growth/impact.

Tiers: A≥4.5, B≥3.8, C≥3.0, D≥2.0, F<2.0

Return ONLY JSON:
{
  "score": 0-5 (two decimals),
  "tier": "A"|"B"|"C"|"D"|"F",
  "archetype": "Backend"|"Frontend"|"Fullstack"|"ML"|"Data"|"PM"|"Design"|"DevOps"|"Security"|"SA"|"Other",
  "summary": one concrete sentence,
  "keyword_matches": 5-12 terms from both resume and JD,
  "gaps": 3-8 specific things the resume doesn't demonstrate that the JD wants,
  "star_stories": 2-3 brief stories from the resume that address the JD's behavioural asks,
  "report_md": 250-500 word markdown — sections "## Role summary", "## Match", "## Gaps", "## How to win this"
}
No preamble, no code fences, JSON only.`;

function buildResumeText(resume: any): string {
  if (!resume) return "";
  const parts: string[] = [];
  if (resume.summary || resume.personal_info?.summary) parts.push("## Summary\n" + (resume.summary || resume.personal_info?.summary));
  if (Array.isArray(resume.experience)) {
    parts.push("## Experience");
    for (const x of resume.experience) {
      parts.push(`- ${x.title ?? ""} @ ${x.company ?? ""} (${x.start_date ?? ""} – ${x.end_date ?? "present"})`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets) parts.push(`  • ${b}`);
      else if (x.description) parts.push(`  • ${x.description}`);
    }
  }
  if (Array.isArray(resume.skills)) parts.push("## Skills\n" + resume.skills.map((s: any) => s?.name || s).join(", "));
  if (Array.isArray(resume.projects)) {
    parts.push("## Projects");
    for (const p of resume.projects) parts.push(`- ${p.name ?? ""}: ${p.description ?? ""}`);
  }
  if (Array.isArray(resume.education)) {
    parts.push("## Education");
    for (const e of resume.education) parts.push(`- ${e.degree ?? ""} @ ${e.school ?? ""}`);
  }
  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({})) as { scanned_job_id?: string; force?: boolean };
    if (!body.scanned_job_id) throw new HttpError(400, "scanned_job_id required");

    const svc = serviceClient();

    // Cached evaluation short-circuit
    if (!body.force) {
      const { data: existing } = await svc.from("job_evaluations")
        .select("*").eq("user_id", user.id).eq("scanned_job_id", body.scanned_job_id).maybeSingle();
      if (existing) return jsonResponse({ evaluation: existing, cached: true });
    }

    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "evaluation", isPro);

    const { data: job } = await svc.from("scanned_jobs")
      .select("*, company:scan_companies(name)")
      .eq("id", body.scanned_job_id).maybeSingle();
    if (!job) throw new HttpError(404, "job not found");

    const { data: resumes } = await svc.from("resumes")
      .select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1);
    const resume = resumes?.[0];
    if (!resume) throw new HttpError(412, "no resume found for user");

    const resumeText = buildResumeText(resume);
    if (!resumeText || resumeText.length < 120) throw new HttpError(412, "resume too thin to evaluate");

    const companyName = (job as any).company?.name ?? "the company";
    const result = await callClaude<EvaluationPayload>({
      tier: "complex",
      system: SYSTEM_PROMPT,
      cachedContext: `Candidate resume:\n\n${resumeText}`,
      user:
        `Company: ${companyName}\n` +
        `Title: ${job.title}\n` +
        `Location: ${job.location ?? "n/a"}\n` +
        `Compensation: ${job.compensation_text ?? "not disclosed"}\n\n` +
        `Job description:\n${truncate(job.description_md, MAX_DESC)}`,
      maxTokens: 2000,
      parseJson: true,
    });

    const payload = result.text;
    const row = {
      user_id: user.id,
      scanned_job_id: body.scanned_job_id,
      resume_id: resume.id,
      score: payload.score,
      archetype: payload.archetype,
      tier: payload.tier,
      summary: payload.summary,
      keyword_matches: payload.keyword_matches ?? [],
      gaps: payload.gaps ?? [],
      star_stories: payload.star_stories ?? [],
      report_md: payload.report_md,
      model: result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      evaluated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveErr } = await svc.from("job_evaluations")
      .upsert(row, { onConflict: "user_id,scanned_job_id" }).select().single();
    if (saveErr) throw new HttpError(500, `save: ${saveErr.message}`);

    await logAiUsage(svc, user.id, "evaluation", result.tokens_in, result.tokens_out);
    return jsonResponse({ evaluation: saved, cached: false });
  });
});

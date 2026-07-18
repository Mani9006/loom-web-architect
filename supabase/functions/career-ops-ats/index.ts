/**
 * career-ops-ats — Real ATS scoring for a résumé, optionally paired with a JD.
 *
 * Strategy:
 *   1. Deterministic checks (no LLM): format (bullet length, action verbs at
 *      start, quantified bullets), sections present, length ratios,
 *      keyword density.
 *   2. Cost-routed small-model pass to extract JD keywords + produce sharp,
 *      actionable suggestions.
 *   3. Final row written to `ats_scores` with six dimensions 0-100.
 *
 * Body: { resume_id: uuid, scanned_job_id?: uuid, job_description?: string, user_id?: uuid }
 * Returns: { ats: row }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { truncate } from "../_shared/ai.ts";
import { callLlmWithFallback } from "../_shared/llm.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUserOrService,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

// ── Deterministic analyzers ────────────────────────────────────

const STRONG_VERBS = new Set([
  "led", "built", "shipped", "designed", "architected", "scaled",
  "launched", "drove", "owned", "delivered", "migrated", "automated",
  "reduced", "improved", "grew", "optimized", "refactored", "rolled",
  "negotiated", "mentored", "hired", "coached", "authored", "published",
  "prototyped", "analyzed", "implemented", "integrated", "deployed",
  "reviewed", "resolved", "debugged", "instrumented", "partnered",
]);

const WEAK_PREFIXES = [
  "responsible for", "worked on", "helped", "assisted", "participated",
  "involved in", "duties included", "tasked with",
];

function analyseBullet(b: string): { issues: string[]; score: number } {
  const issues: string[] = [];
  const bt = b.trim();
  if (!bt) return { issues: ["empty bullet"], score: 0 };
  if (bt.length > 220) issues.push("too long (>220 chars)");
  if (bt.length < 40) issues.push("too short (<40 chars) — add impact");
  const first = (bt.split(/\s+/, 1)[0] || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!STRONG_VERBS.has(first)) issues.push(`starts with "${first}" — prefer an action verb`);
  for (const p of WEAK_PREFIXES) if (bt.toLowerCase().startsWith(p)) issues.push(`weak opener "${p}"`);
  if (!/\d/.test(bt)) issues.push("no numbers — quantify when possible");
  const score = Math.max(0, 100 - issues.length * 18);
  return { issues, score };
}

interface DetReport {
  format: number;
  experience: number;
  education: number;
  skills: number;
  impact: number;
  issues: Array<{ scope: string; where: string; message: string }>;
  bullets: string[];
}

function deterministicAnalysis(resume: any): DetReport {
  const issues: DetReport["issues"] = [];
  let formatScore = 100;

  // Sections present
  const hasSummary = Boolean(resume.summary || resume.personal_info?.summary);
  const hasExperience = Array.isArray(resume.experience) && resume.experience.length > 0;
  const hasEducation = Array.isArray(resume.education) && resume.education.length > 0;
  const skillList = flattenSkills(resume.skills);
  const hasSkills = skillList.length > 0;

  if (!hasSummary) { issues.push({ scope: "format", where: "summary", message: "no summary/about section" }); formatScore -= 10; }
  if (!hasExperience) { issues.push({ scope: "format", where: "experience", message: "no experience section" }); formatScore -= 30; }
  if (!hasEducation) { issues.push({ scope: "format", where: "education", message: "no education section" }); formatScore -= 10; }
  if (!hasSkills) { issues.push({ scope: "format", where: "skills", message: "no skills section" }); formatScore -= 15; }

  // Bullet analysis
  const bulletScores: number[] = [];
  const allBullets: string[] = [];
  if (hasExperience) {
    for (const x of resume.experience) {
      const bullets: string[] = Array.isArray(x.bullets) ? x.bullets
        : x.description ? [x.description] : [];
      for (const b of bullets) {
        allBullets.push(b);
        const a = analyseBullet(b);
        bulletScores.push(a.score);
        for (const i of a.issues) issues.push({
          scope: "experience",
          where: `${x.company_or_client ?? x.company ?? ""} — ${x.role ?? x.title ?? ""}`,
          message: i,
        });
      }
    }
  }
  const bulletAvg = bulletScores.length ? bulletScores.reduce((s, n) => s + n, 0) / bulletScores.length : 0;

  // Impact = bullets with numbers
  const quantified = allBullets.filter((b) => /\d/.test(b)).length;
  const impactScore = allBullets.length ? Math.round((quantified / allBullets.length) * 100) : 0;
  if (impactScore < 40 && allBullets.length > 0) {
    issues.push({ scope: "impact", where: "experience", message: `only ${quantified}/${allBullets.length} bullets are quantified` });
  }

  return {
    format: Math.max(0, Math.min(100, Math.round(formatScore))),
    experience: Math.max(0, Math.min(100, Math.round(bulletAvg))),
    education: hasEducation ? 90 : 40,
    skills: hasSkills ? Math.min(100, skillList.length * 8) : 0,
    impact: impactScore,
    issues,
    bullets: allBullets,
  };
}

function flattenSkills(skills: unknown): string[] {
  if (Array.isArray(skills)) {
    return skills.map((skill) => typeof skill === "string" ? skill : String(skill?.name || "")).filter(Boolean);
  }
  if (skills && typeof skills === "object") {
    return Object.values(skills as Record<string, unknown>)
      .flatMap((value) => Array.isArray(value) ? value.map(String) : [])
      .filter(Boolean);
  }
  return [];
}

// ── AI keyword matcher (Haiku 4.5) ────────────────────────────

interface KeywordPayload {
  jd_keywords: string[];       // top 15 terms from JD
  suggestions: Array<{ priority: "high" | "medium" | "low"; action: string }>;
}

const KW_SYSTEM = `You are an ATS keyword extractor. You get a job description. Return the 15 most important terms a résumé should demonstrate to pass ATS screening AND human review. Mix hard skills, tools, domains, and seniority indicators. No fluff words.

Then propose 5 crisp suggestions to close the gap, prioritised high/medium/low.

Return ONLY JSON:
{"jd_keywords": string[15], "suggestions": [{"priority":"high"|"medium"|"low","action":string}, ...]}`;

function computeKeywordScore(resumeText: string, keywords: string[]): {
  score: number; matched: string[]; missing: string[];
} {
  const lower = resumeText.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of keywords) {
    const needle = k.toLowerCase().trim();
    if (!needle) continue;
    if (lower.includes(needle)) matched.push(k);
    else missing.push(k);
  }
  const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
  return { score, matched, missing };
}

function resumeToPlainText(r: any): string {
  const parts: string[] = [];
  if (r.summary || r.personal_info?.summary) parts.push(r.summary || r.personal_info.summary);
  if (Array.isArray(r.experience)) for (const x of r.experience) {
    parts.push(`${x.role ?? x.title ?? ""} ${x.company_or_client ?? x.company ?? ""}`);
    if (Array.isArray(x.bullets)) parts.push(x.bullets.join(" "));
    else if (x.description) parts.push(x.description);
  }
  const skills = flattenSkills(r.skills);
  if (skills.length > 0) parts.push(skills.join(" "));
  if (Array.isArray(r.projects)) parts.push(r.projects.map((p: any) =>
    `${p.title ?? p.name ?? ""} ${p.organization ?? ""} ${p.description ?? ""} ${Array.isArray(p.bullets) ? p.bullets.join(" ") : ""}`,
  ).join(" "));
  return parts.join("\n");
}

// ── Handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as {
      resume_id?: string; scanned_job_id?: string; job_description?: string; user_id?: string;
    };
    const user = await getAuthedUserOrService(req, body.user_id);
    if (!body.resume_id) throw new HttpError(400, "resume_id required");

    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "ats", isPro);

    const { data: resume } = await svc.from("resumes").select("*")
      .eq("id", body.resume_id).maybeSingle();
    if (!resume) throw new HttpError(404, "resume not found");
    if (resume.user_id !== user.id) throw new HttpError(403, "forbidden");

    let jdText: string | null = body.job_description ?? null;
    let jobId: string | null = null;
    if (body.scanned_job_id) {
      const { data: job } = await svc.from("scanned_jobs")
        .select("id, description_md").eq("id", body.scanned_job_id).maybeSingle();
      if (job) { jdText = jdText ?? job.description_md; jobId = job.id; }
    }

    const det = deterministicAnalysis(resume);
    const resumeText = resumeToPlainText(resume);

    // Keywords + suggestions use the cheap routing tier if a JD is present.
    let keywordScore = 0;
    let matched: string[] = [];
    let missing: string[] = [];
    let suggestions: KeywordPayload["suggestions"] = [];
    let model = "deterministic";
    let tokens_in = 0, tokens_out = 0;

    if (jdText && jdText.trim().length > 100) {
      const result = await callLlmWithFallback<KeywordPayload>({
        tier: "cheap",
        system: KW_SYSTEM,
        user: `Job description:\n${truncate(jdText, 10_000)}`,
        maxTokens: 600,
        parseJson: true,
        temperature: 0.1,
      });
      const kp = result.text;
      const m = computeKeywordScore(resumeText, kp.jd_keywords ?? []);
      keywordScore = m.score;
      matched = m.matched;
      missing = m.missing;
      suggestions = kp.suggestions ?? [];
      model = result.model;
      tokens_in = result.tokens_in;
      tokens_out = result.tokens_out;
    } else {
      // No JD — skip keyword scoring, use generic guidance.
      keywordScore = 0;
      suggestions = [
        { priority: "high", action: "Provide a target job description for keyword-level analysis." },
        { priority: "medium", action: "Add quantified outcomes to weakly-scored bullets." },
        { priority: "low", action: "Tighten bullets starting with weak openers (\"responsible for\", \"helped\")." },
      ];
    }

    // Overall score = weighted mean.
    const weights = { format: 0.15, keywords: 0.25, experience: 0.25, skills: 0.15, education: 0.05, impact: 0.15 };
    const overall =
      det.format * weights.format +
      keywordScore * weights.keywords +
      det.experience * weights.experience +
      det.skills * weights.skills +
      det.education * weights.education +
      det.impact * weights.impact;

    const row = {
      user_id: user.id,
      resume_id: body.resume_id,
      scanned_job_id: jobId,
      overall: Math.round(overall * 10) / 10,
      dim_format: det.format,
      dim_keywords: keywordScore,
      dim_experience: det.experience,
      dim_skills: det.skills,
      dim_education: det.education,
      dim_impact: det.impact,
      matched_keywords: matched,
      missing_keywords: missing,
      issues: det.issues,
      suggestions,
      model,
      tokens_in,
      tokens_out,
    };

    const { data: saved, error: saveErr } = await svc.from("ats_scores")
      .insert(row).select().single();
    if (saveErr) throw new HttpError(500, `save: ${saveErr.message}`);

    if (tokens_in > 0) await logAiUsage(svc, user.id, "ats", tokens_in, tokens_out);
    return jsonResponse({ ats: saved });
  });
});

/**
 * career-ops-ats — authoritative job-description match scorer.
 *
 * Strategy:
 * A generic résumé-quality score and a job-description match are different
 * measurements. This endpoint returns both explicitly and never blends them
 * into an unexplained percentage. For backwards compatibility,
 * ats_scores.overall stores the job match for JD-scoped checks and the generic
 * quality score for a no-JD check.
 *
 * Body: { resume_id?: uuid, resume_text?: string, scanned_job_id?: uuid,
 *         job_description?: string, user_id?: uuid }
 * `resume_text` supports the manual checker and publishes job match only; it
 * is never persisted as a scored résumé because structure cannot be verified.
 * Returns: { ats: row }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { truncate } from "../_shared/ai.ts";
import { chatFree } from "../_shared/llm.ts";
import {
  computeKeywordScore,
  computeResumeQualityScore,
  deterministicAnalysis,
  resumeToPlainText,
} from "../_shared/ats-deterministic.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUserOrService,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";
import { jdHash, readJdKeywordCache, writeJdKeywordCache } from "../_shared/jd-cache.ts";

// ── AI keyword matcher (Haiku 4.5) ────────────────────────────

interface KeywordPayload {
  jd_keywords: string[];       // top 15 terms from JD
  suggestions: Array<{ priority: "high" | "medium" | "low"; action: string }>;
}

const KW_SYSTEM = `You are an ATS keyword extractor. You get a job description. Return the 15 most important terms a résumé should demonstrate to pass ATS screening AND human review. Mix hard skills, tools, domains, and seniority indicators. Use standard 1-4 word ATS phrases. Split bundled requirements into separate terms instead of returning a long sentence or slash-separated list. No fluff words.

Then propose 5 crisp suggestions to close the gap, prioritised high/medium/low.

Return ONLY JSON:
{"jd_keywords": string[15], "suggestions": [{"priority":"high"|"medium"|"low","action":string}, ...]}`;

// ── Handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");
    const body = await req.json().catch(() => ({})) as {
      resume_id?: string;
      resume_text?: string;
      scanned_job_id?: string;
      job_description?: string;
      user_id?: string;
    };
    const user = await getAuthedUserOrService(req, body.user_id);
    const suppliedText = typeof body.resume_text === "string" ? body.resume_text.trim() : "";
    if (!body.resume_id && suppliedText.length < 50) {
      throw new HttpError(400, "resume_id or at least 50 characters of resume_text required");
    }

    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "ats", isPro);

    let resume: Record<string, unknown> | null = null;
    if (body.resume_id) {
      const { data } = await svc.from("resumes").select("*")
        .eq("id", body.resume_id).maybeSingle();
      if (!data) throw new HttpError(404, "resume not found");
      if (data.user_id !== user.id) throw new HttpError(403, "forbidden");
      resume = data;
    }

    let jdText = typeof body.job_description === "string" ? body.job_description.trim() : "";
    let jobId: string | null = null;
    if (body.scanned_job_id) {
      const { data: job } = await svc.from("scanned_jobs")
        .select("id, description_md").eq("id", body.scanned_job_id).maybeSingle();
      if (!job) throw new HttpError(404, "job not found");
      if (!jdText) jdText = typeof job.description_md === "string" ? job.description_md.trim() : "";
      jobId = job.id;
    }
    const hasJobDescription = jdText.length > 100;
    if ((body.scanned_job_id || body.job_description) && !hasJobDescription) {
      throw new HttpError(422, "A complete job description is required for an honest job-match score");
    }
    if (!resume && !hasJobDescription) {
      throw new HttpError(422, "resume_text can only be used with a complete job description");
    }

    const det = resume ? deterministicAnalysis(resume) : null;
    const resumeText = resume ? resumeToPlainText(resume) : suppliedText.slice(0, 40_000);
    const resumeQualityScore = det ? computeResumeQualityScore(det) : null;

    // Keywords + suggestions use the cheap routing tier if a JD is present.
    let keywordScore = 0;
    let matched: string[] = [];
    let missing: string[] = [];
    let suggestions: KeywordPayload["suggestions"] = [];
    let model = "deterministic";
    let tokens_in = 0, tokens_out = 0;

    if (hasJobDescription) {
      // Read-through cache: keyword extraction is deterministic per normalized
      // JD, so repeat scores of the same posting skip the LLM entirely.
      const hash = jdHash(jdText, "ats-kw");
      const cached = await readJdKeywordCache<KeywordPayload>(svc, hash);
      let kp: KeywordPayload;
      if (cached && Array.isArray((cached.keywords as KeywordPayload | null)?.jd_keywords)) {
        kp = cached.keywords;
        model = `cache:${cached.model || "unknown"}`;
      } else {
        const result = await chatFree<KeywordPayload>(
          "lite",
          [
            { role: "system", content: KW_SYSTEM },
            { role: "user", content: `Job description:\n${truncate(jdText, 10_000)}` },
          ],
          { maxTokens: 600, parseJson: true, temperature: 0.1 },
        );
        kp = result.text;
        model = result.model;
        tokens_in = result.tokens_in;
        tokens_out = result.tokens_out;
        await writeJdKeywordCache(svc, hash, kp, model);
      }
      const jdKeywords = Array.isArray(kp.jd_keywords)
        ? kp.jd_keywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
        : [];
      if (jdKeywords.length === 0) {
        throw new HttpError(502, "Job requirements could not be extracted reliably");
      }
      const m = computeKeywordScore(resumeText, jdKeywords);
      keywordScore = m.score;
      matched = m.matched;
      missing = m.missing;
      suggestions = kp.suggestions ?? [];
    } else {
      // A no-JD request is a generic quality check only. Keyword coverage is
      // unavailable, not zero.
      suggestions = [
        { priority: "high", action: "Provide a target job description for keyword-level analysis." },
        { priority: "medium", action: "Add quantified outcomes to weakly-scored bullets." },
        { priority: "low", action: "Tighten bullets starting with weak openers (\"responsible for\", \"helped\")." },
      ];
    }

    const jobMatchScore = hasJobDescription ? keywordScore : null;
    const scoreKind = hasJobDescription ? "job_match" : "resume_quality";
    const effectiveScore = jobMatchScore ?? resumeQualityScore;
    if (effectiveScore === null) throw new HttpError(422, "No score is available for this input");

    const row = {
      user_id: user.id,
      resume_id: body.resume_id ?? null,
      scanned_job_id: jobId,
      overall: effectiveScore,
      dim_format: det?.format ?? 0,
      dim_keywords: keywordScore,
      dim_experience: det?.experience ?? 0,
      dim_skills: det?.skills ?? 0,
      dim_education: det?.education ?? 0,
      dim_impact: det?.impact ?? 0,
      matched_keywords: matched,
      missing_keywords: missing,
      issues: det?.issues ?? [],
      suggestions,
      model: `ats-truth-v2:${scoreKind}:${model}`,
      tokens_in,
      tokens_out,
    };

    let saved: Record<string, unknown> = row;
    // Plain-text checks do not pretend that extracted text proves the
    // original document's structure and are therefore not persisted.
    if (resume) {
      const { data, error: saveErr } = await svc.from("ats_scores")
        .insert(row).select().single();
      if (saveErr || !data) throw new HttpError(500, `save: ${saveErr?.message ?? "no row returned"}`);
      saved = data;
    }

    if (tokens_in > 0) await logAiUsage(svc, user.id, "ats", tokens_in, tokens_out);
    return jsonResponse({
      ats: {
        ...saved,
        score_kind: scoreKind,
        resume_quality_score: resumeQualityScore,
        job_match_score: jobMatchScore,
        job_match_basis: hasJobDescription ? "jd_requirement_coverage" : null,
        persisted: Boolean(resume),
        methodology_version: "ats-truth-v2",
      },
    });
  });
});

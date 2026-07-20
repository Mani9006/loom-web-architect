/**
 * career-ops-tailor-report — "What changed for this application" report.
 *
 * Pairs the master resume with the tailored resume of one draft application:
 *   - ATS before -> after on the SAME weighted scale career-ops-ats writes to
 *     public.ats_scores (shared logic: _shared/ats-deterministic.ts), so the
 *     two numbers are directly comparable.
 *   - keyword_delta: JD keywords newly covered vs already covered vs missing.
 *   - changes[]: structured master->tailored diff (summary, per-entry bullets
 *     matched by the tailor's pinned entry ids, skills) tagged with the JD
 *     keywords each change introduced.
 *
 * The heavy part (JD keyword extraction) is read-through cached in
 * jd_keyword_cache with the same hash career-ops-ats uses, so a report for an
 * already-scored application costs zero LLM tokens. The computed report is
 * upserted into public.resume_tailoring_runs (one row per draft application)
 * and reused until ?refresh is requested.
 *
 * Body: { draft_application_id: uuid, refresh?: boolean, user_id?: uuid }
 * Returns: { report: TailoringReport }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { truncate } from "../_shared/ai.ts";
import { callLlmWithFallback } from "../_shared/llm.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUserOrService,
  enforceAccountActive, serviceClient, HttpError,
} from "../_shared/guards.ts";
import { jdHash, readJdKeywordCache, writeJdKeywordCache } from "../_shared/jd-cache.ts";
import { resumeToPlainText, scoreResumeDeterministic } from "../_shared/ats-deterministic.ts";
import {
  buildTailoringChanges, computeKeywordDelta, TailoringReport,
  TailoringReportRequestError, validateTailorReportRequest,
} from "../_shared/tailoring-report-core.ts";

// Same extraction contract as career-ops-ats: identical system prompt and
// "ats-kw" cache scope, so both functions share one cache entry per JD.
const KW_SYSTEM = `You are an ATS keyword extractor. You get a job description. Return the 15 most important terms a résumé should demonstrate to pass ATS screening AND human review. Mix hard skills, tools, domains, and seniority indicators. Use standard 1-4 word ATS phrases. Split bundled requirements into separate terms instead of returning a long sentence or slash-separated list. No fluff words.

Then propose 5 crisp suggestions to close the gap, prioritised high/medium/low.

Return ONLY JSON:
{"jd_keywords": string[15], "suggestions": [{"priority":"high"|"medium"|"low","action":"string"}, ...]}`;

interface KeywordPayload {
  jd_keywords: string[];
  suggestions?: Array<{ priority: string; action: string }>;
}

type ServiceClient = ReturnType<typeof serviceClient>;

async function loadJdKeywords(
  svc: ServiceClient,
  jdText: string,
): Promise<{ keywords: string[]; model: string }> {
  if (jdText.trim().length <= 100) return { keywords: [], model: "no-jd" };
  const hash = jdHash(jdText, "ats-kw");
  const cached = await readJdKeywordCache<KeywordPayload>(svc, hash);
  if (cached && Array.isArray((cached.keywords as KeywordPayload | null)?.jd_keywords)) {
    return { keywords: cached.keywords.jd_keywords, model: `cache:${cached.model || "unknown"}` };
  }
  const result = await callLlmWithFallback<KeywordPayload>({
    tier: "cheap",
    system: KW_SYSTEM,
    user: `Job description:\n${truncate(jdText, 10_000)}`,
    maxTokens: 600,
    parseJson: true,
    temperature: 0.1,
  });
  const keywords = Array.isArray(result.text?.jd_keywords) ? result.text.jd_keywords : [];
  await writeJdKeywordCache(svc, hash, { jd_keywords: keywords, suggestions: result.text?.suggestions ?? [] }, result.model);
  return { keywords, model: result.model };
}

// deno-lint-ignore no-explicit-any
function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Resolve the master resume via the tailored resume's stored lineage, else the user's most recent non-tailored resume. */
async function resolveMasterResume(
  svc: ServiceClient,
  userId: string,
  // deno-lint-ignore no-explicit-any
  tailoredResume: any,
) {
  const sourceId = asRecord(asRecord(tailoredResume.personal_info)._v2_extras).source_resume_id;
  if (typeof sourceId === "string" && sourceId) {
    const { data } = await svc.from("resumes").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
    if (data) return data;
  }
  const { data } = await svc.from("resumes").select("*")
    .eq("user_id", userId)
    .neq("id", tailoredResume.id)
    .order("updated_at", { ascending: false })
    .limit(10);
  // Fallback must not pick another application snapshot as "master".
  // deno-lint-ignore no-explicit-any
  return (data ?? []).find((resume: any) =>
    !asRecord(asRecord(resume.personal_info)._v2_extras).source_resume_id
  ) ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");
    const body = await req.json().catch(() => ({}));
    let input;
    try {
      input = validateTailorReportRequest(body);
    } catch (error) {
      if (error instanceof TailoringReportRequestError) throw new HttpError(error.status, error.message);
      throw error;
    }
    const user = await getAuthedUserOrService(req, input.user_id);

    const svc = serviceClient();
    await enforceAccountActive(svc, user.id);

    const { data: draft } = await svc.from("draft_applications")
      .select("id,user_id,evaluation_id,tailored_resume_id,status")
      .eq("id", input.draft_application_id).maybeSingle();
    if (!draft) throw new HttpError(404, "application not found");
    if (draft.user_id !== user.id) throw new HttpError(403, "forbidden");
    if (!draft.tailored_resume_id) throw new HttpError(409, "tailored resume not ready yet");

    const { data: evaluation } = await svc.from("job_evaluations")
      .select("id,scanned_job_id").eq("id", draft.evaluation_id).maybeSingle();
    if (!evaluation) throw new HttpError(404, "evaluation not found");

    const { data: job } = await svc.from("scanned_jobs")
      .select("id,description_md").eq("id", evaluation.scanned_job_id).maybeSingle();
    const jdText = typeof job?.description_md === "string" ? job.description_md : "";

    const { data: tailoredResume } = await svc.from("resumes").select("*")
      .eq("id", draft.tailored_resume_id).eq("user_id", user.id).maybeSingle();
    if (!tailoredResume) throw new HttpError(404, "tailored resume not found");

    const masterResume = await resolveMasterResume(svc, user.id, tailoredResume);
    if (!masterResume) throw new HttpError(409, "master resume not found for this application");

    // Latest stored ATS outcome for the tailored resume + this job.
    const { data: afterRow } = await svc.from("ats_scores")
      .select("overall,matched_keywords,missing_keywords,created_at")
      .eq("user_id", user.id)
      .eq("resume_id", tailoredResume.id)
      .eq("scanned_job_id", evaluation.scanned_job_id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    const { data: cachedRun } = await svc.from("resume_tailoring_runs")
      .select("*")
      .eq("draft_application_id", draft.id)
      .maybeSingle();

    const afterMatched = Array.isArray(afterRow?.matched_keywords) ? afterRow.matched_keywords : [];
    const afterMissing = Array.isArray(afterRow?.missing_keywords) ? afterRow.missing_keywords : [];
    const masterText = resumeToPlainText(masterResume);
    const keyword_delta = computeKeywordDelta(afterMatched, afterMissing, masterText);

    if (cachedRun && !input.refresh) {
      const report: TailoringReport = {
        draft_application_id: draft.id,
        master_resume_id: cachedRun.master_resume_id,
        tailored_resume_id: cachedRun.tailored_resume_id,
        // Prefer the freshest stored "after" score; the cached row may predate
        // a re-score of the tailored resume.
        ats_before: cachedRun.ats_before === null ? null : Number(cachedRun.ats_before),
        ats_after: afterRow ? Number(afterRow.overall) : (cachedRun.ats_after === null ? null : Number(cachedRun.ats_after)),
        keyword_delta,
        changes: Array.isArray(cachedRun.changes) ? cachedRun.changes : [],
        model: cachedRun.model ?? "cached",
        generated_at: cachedRun.created_at,
      };
      return jsonResponse({ report });
    }

    const { keywords: jdKeywords, model } = await loadJdKeywords(svc, jdText);
    const before = scoreResumeDeterministic(masterResume, jdKeywords);
    // The "after" score normally comes from the ats_scores row written when the
    // tailored resume was scored; recompute on the same scale if that row is
    // missing so the report still renders.
    const after = afterRow
      ? { overall: Number(afterRow.overall), matched: afterMatched, missing: afterMissing }
      : (() => {
        const scored = scoreResumeDeterministic(tailoredResume, jdKeywords);
        return { overall: scored.overall, matched: scored.matched_keywords, missing: scored.missing_keywords };
      })();

    const changes = buildTailoringChanges(masterResume, tailoredResume, jdKeywords);
    const recomputedDelta = computeKeywordDelta(after.matched, after.missing, masterText);

    const runRow = {
      user_id: user.id,
      draft_application_id: draft.id,
      master_resume_id: masterResume.id,
      tailored_resume_id: tailoredResume.id,
      ats_before: before.overall,
      ats_after: after.overall,
      changes,
      model: afterRow ? model : `${model}+recomputed-after`,
    };
    const { data: saved, error: saveErr } = await svc.from("resume_tailoring_runs")
      .upsert(runRow, { onConflict: "draft_application_id" })
      .select().single();
    if (saveErr) throw new HttpError(500, `save report: ${saveErr.message}`);

    const report: TailoringReport = {
      draft_application_id: draft.id,
      master_resume_id: masterResume.id,
      tailored_resume_id: tailoredResume.id,
      ats_before: before.overall,
      ats_after: after.overall,
      keyword_delta: recomputedDelta,
      changes,
      model: runRow.model,
      generated_at: saved?.created_at ?? new Date().toISOString(),
    };
    return jsonResponse({ report });
  });
});

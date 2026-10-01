/**
 * agents-job-hunter — deterministic continuous career-ops worker.
 *
 * Choosing "score fresh jobs, then prepare eligible high-fit jobs" does not
 * require a reasoning model. Removing the old multi-turn Sonnet tool loop makes
 * every run predictable, auditable, and nearly free; language models are used
 * only inside evaluation explanations and resume tailoring.
 *
 * Body: { user_id: uuid }
 * Auth: service-role only (orchestrator calls it)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAutoApplyEntitlement, HttpError } from "../_shared/guards.ts";
import { isManualIntakeIdentifier } from "../_shared/auto-submit-portal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserPrefs {
  negative_keywords: string[];
  excluded_companies: string[];
  work_modes: string[];
  auto_apply_min_fit_score: number;
  auto_apply_min_ats_score: number;
  tailoring_mode: "evidence_only" | "coverage_boost";
  auto_apply_enabled: boolean;
  auto_apply_portals: string[];
  review_mode: "always" | "low_confidence" | "eligible_only";
  daily_apply_cap: number;
  agent_max_actions_per_day: number;
  agent_actions_today: number;
}

interface AgentAction {
  tool: "score_match" | "prepare_draft" | "score_ats" | "queue_submit";
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  ts: string;
}

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const workerToken = Deno.env.get("WORKER_AUTH_TOKEN") || "";
  return Boolean(token) && (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (workerToken !== "" && token === workerToken));
}

async function loadPrefs(client: ReturnType<typeof svc>, userId: string): Promise<UserPrefs | null> {
  const { data } = await client.from("user_job_prefs").select("*").eq("user_id", userId).maybeSingle();
  return data as UserPrefs | null;
}

async function listUnscoredMatches(
  client: ReturnType<typeof svc>,
  userId: string,
  prefs: UserPrefs,
  limit: number,
): Promise<Array<{ id: string; title: string; company: string }>> {
  const { data: existing } = await client.from("job_evaluations").select("scanned_job_id").eq("user_id", userId);
  const seen = new Set((existing ?? []).map((row: { scanned_job_id: string }) => row.scanned_job_id));
  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: jobs } = await client.from("scanned_jobs")
    .select("id,title,location,remote_policy,last_seen_at,company:scan_companies(name)")
    .eq("is_live", true)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(100);

  const negative = normalized(prefs.negative_keywords);
  const excludedCompanies = normalized(prefs.excluded_companies);
  const workModes = normalized(prefs.work_modes);
  const matches: Array<{ id: string; title: string; company: string }> = [];

  for (const job of (jobs ?? []) as Array<{
    id: string;
    title: string;
    location: string | null;
    remote_policy: string | null;
    company: { name: string } | null;
  }>) {
    if (seen.has(job.id)) continue;
    const title = job.title.toLowerCase();
    const company = job.company?.name ?? "Unknown company";
    if (negative.some((keyword) => title.includes(keyword))) continue;
    if (excludedCompanies.some((excluded) => company.toLowerCase().includes(excluded))) continue;

    const mode = inferWorkMode(job.remote_policy, job.location);
    if (mode && workModes.length > 0 && !workModes.includes(mode)) continue;

    matches.push({ id: job.id, title: job.title, company });
    if (matches.length >= limit) break;
  }
  return matches;
}

async function listUnpreparedEvaluations(
  client: ReturnType<typeof svc>,
  userId: string,
  minFitScore: number,
  limit: number,
): Promise<{
  evaluations: Array<{ id: string; scanned_job_id: string; fit_score: number; title: string; portal: string | null }>;
  /** Eligible matches skipped because an application packet already exists. */
  alreadyPrepared: number;
}> {
  const { data: evaluations } = await client.from("job_evaluations")
    .select("id,scanned_job_id,fit_score,scanned_jobs(title,company:scan_companies(api_type,api_identifier))")
    .eq("user_id", userId)
    .eq("eligible", true)
    .eq("score_version", "career-fit-v2")
    .is("dismissed_at", null)
    .gte("fit_score", minFitScore)
    .order("fit_score", { ascending: false })
    .limit(30);
  const { data: drafts } = await client.from("draft_applications").select("evaluation_id").eq("user_id", userId);
  const drafted = new Set((drafts ?? []).map((row: { evaluation_id: string }) => row.evaluation_id));

  const pending = (evaluations ?? [])
    .filter((evaluation: { id: string }) => !drafted.has(evaluation.id));
  const alreadyPrepared = (evaluations ?? []).length - pending.length;
  const mapped = pending
    .slice(0, limit)
    .map((evaluation: {
      id: string;
      scanned_job_id: string;
      fit_score: number;
      scanned_jobs: { title: string; company: { api_type: string | null; api_identifier: string | null } | null } | null;
    }) => ({
      id: evaluation.id,
      scanned_job_id: evaluation.scanned_job_id,
      fit_score: evaluation.fit_score,
      title: evaluation.scanned_jobs?.title ?? "Unknown role",
      // One-click intake stores unsupported portals (Workday, iCIMS, ...) as
      // api_type "lever" with a manual identifier; they are review-only.
      portal: isManualIntakeIdentifier(evaluation.scanned_jobs?.company?.api_identifier)
        ? null
        : evaluation.scanned_jobs?.company?.api_type ?? null,
    }));
  return { evaluations: mapped, alreadyPrepared };
}

async function callEdgeFunction(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} ${response.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: true };
  }
}

async function runAgent(userId: string, runId: string) {
  const client = svc();
  const prefs = await loadPrefs(client, userId);
  if (!prefs) {
    return finalize(client, runId, "capped", "No job preferences are configured.", [], 0);
  }

  let remaining = Math.max(0, prefs.agent_max_actions_per_day - prefs.agent_actions_today);
  if (remaining === 0) {
    return finalize(client, runId, "capped", "The daily action budget is already used.", [], 0);
  }

  const actions: AgentAction[] = [];
  let scored = 0;
  let prepared = 0;
  let alreadyPrepared = 0;
  let atsScored = 0;
  let queued = 0;
  let failed = 0;

  // Refresh the full resume-and-preference match story first. This is a
  // deterministic zero-token pass over current company-direct roles, so the
  // scheduled worker does not waste language-model calls deciding what to score.
  try {
    const bootstrap = await callEdgeFunction("career-ops-bootstrap", { user_id: userId });
    actions.push({
      tool: "score_match",
      input: { mode: "continuous_match_refresh" },
      result: {
        evaluated: bootstrap.evaluated,
        eligible: bootstrap.eligible,
        tokens_used: 0,
      },
      ts: new Date().toISOString(),
    });
  } catch (error) {
    actions.push({
      tool: "score_match",
      input: { mode: "continuous_match_refresh" },
      result: { error: error instanceof Error ? error.message : String(error) },
      ts: new Date().toISOString(),
    });
    failed += 1;
  }

  const SCORE_BUDGET = Number(Deno.env.get("AGENT_SCORE_BUDGET") || 8);
  const PREPARE_BUDGET = Number(Deno.env.get("AGENT_PREPARE_BUDGET") || 4);
  const candidates = await listUnscoredMatches(client, userId, prefs, Math.min(SCORE_BUDGET, remaining));
  for (const job of candidates) {
    if (remaining <= 0) break;
    const input = { user_id: userId, scanned_job_id: job.id };
    try {
      const response = await callEdgeFunction("career-ops-evaluate", input);
      const evaluation = asRecord(response.evaluation);
      actions.push({
        tool: "score_match",
        input: { scanned_job_id: job.id, title: job.title, company: job.company },
        result: {
          evaluation_id: evaluation.id,
          fit_score: evaluation.fit_score,
          eligible: evaluation.eligible,
          tier: evaluation.tier,
        },
        ts: new Date().toISOString(),
      });
      scored += 1;
    } catch (error) {
      actions.push({
        tool: "score_match",
        input: { scanned_job_id: job.id, title: job.title, company: job.company },
        result: { error: error instanceof Error ? error.message : String(error) },
        ts: new Date().toISOString(),
      });
      failed += 1;
    }
    remaining -= 1;
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: queuedToday } = await client.from("draft_applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "submitted"])
    .gte("updated_at", dayStart.toISOString());
  let submissionsRemaining = Math.max(0, (prefs.daily_apply_cap ?? 10) - (queuedToday ?? 0));

  if (remaining > 0) {
    const unprepared = await listUnpreparedEvaluations(
      client,
      userId,
      prefs.auto_apply_min_fit_score ?? 82,
      Math.min(PREPARE_BUDGET, remaining),
    );
    alreadyPrepared = unprepared.alreadyPrepared;
    const evaluations = unprepared.evaluations;
    for (const evaluation of evaluations) {
      if (remaining <= 0) break;
      const input = { user_id: userId, evaluation_id: evaluation.id };
      try {
        const response = await callEdgeFunction("career-ops-tailor", input);
        const draft = asRecord(response.draft);
        const draftId = String(draft.id ?? "");
        const tailoredResumeId = String(draft.tailored_resume_id ?? "");
        actions.push({
          tool: "prepare_draft",
          input: { evaluation_id: evaluation.id, title: evaluation.title, fit_score: evaluation.fit_score },
          result: { draft_id: draftId, status: draft.status },
          ts: new Date().toISOString(),
        });
        prepared += 1;
        remaining -= 1;

        // Autopilot scores the exact tailored resume against the exact job so
        // the user sees an evidence-based ATS preview before submission.
        if (remaining > 0 && tailoredResumeId) {
          try {
            const atsResponse = await callEdgeFunction("career-ops-ats", {
              user_id: userId,
              resume_id: tailoredResumeId,
              scanned_job_id: evaluation.scanned_job_id,
            });
            const ats = asRecord(atsResponse.ats);
            const atsOverall = Number(ats.overall ?? 0);
            actions.push({
              tool: "score_ats",
              input: { resume_id: tailoredResumeId, scanned_job_id: evaluation.scanned_job_id },
              result: { ats_score_id: ats.id, overall: atsOverall, minimum_required: prefs.auto_apply_min_ats_score ?? 85 },
              ts: new Date().toISOString(),
            });
            atsScored += 1;
          } catch (error) {
            actions.push({
              tool: "score_ats",
              input: { resume_id: tailoredResumeId, scanned_job_id: evaluation.scanned_job_id },
              result: { error: error instanceof Error ? error.message : String(error) },
              ts: new Date().toISOString(),
            });
            failed += 1;
          }
          remaining -= 1;
        }

        // "Auto-send eligible only" is a true service-side policy. It queues
        // only supported simple-form applications; multi-page portals remain
        // review/manual and is never silently treated as submitted.
        const latestAts = actions
          .filter((action) => action.tool === "score_ats" && action.input.resume_id === tailoredResumeId && action.input.scanned_job_id === evaluation.scanned_job_id)
          .at(-1);
        const tailoredAtsScore = Number(latestAts?.result?.overall ?? 0);
        const shouldAutoQueue = submissionsRemaining > 0
          && prefs.auto_apply_enabled
          && prefs.review_mode === "eligible_only"
          && tailoredAtsScore >= (prefs.auto_apply_min_ats_score ?? 85)
          && typeof evaluation.portal === "string"
          && ["greenhouse", "ashby", "lever", "workable"].includes(evaluation.portal)
          && prefs.auto_apply_portals.includes(evaluation.portal);
        if (remaining > 0 && shouldAutoQueue && draftId) {
          try {
            const submitResponse = await callEdgeFunction("career-ops-submit", {
              user_id: userId,
              draft_application_id: draftId,
            });
            actions.push({
              tool: "queue_submit",
              input: { draft_application_id: draftId, portal: evaluation.portal },
              result: asRecord(submitResponse.task),
              ts: new Date().toISOString(),
            });
            queued += 1;
            submissionsRemaining -= 1;
          } catch (error) {
            actions.push({
              tool: "queue_submit",
              input: { draft_application_id: draftId, portal: evaluation.portal },
              result: { error: error instanceof Error ? error.message : String(error) },
              ts: new Date().toISOString(),
            });
            failed += 1;
          }
          remaining -= 1;
        } else if (prefs.auto_apply_enabled && prefs.review_mode === "eligible_only" && tailoredAtsScore < (prefs.auto_apply_min_ats_score ?? 85)) {
          actions.push({
            tool: "queue_submit",
            input: { draft_id: draftId, portal: evaluation.portal },
            result: { status: "needs_review", reason: "tailored ATS score is below the automatic submission threshold", ats_score: tailoredAtsScore, minimum_required: prefs.auto_apply_min_ats_score ?? 85 },
            ts: new Date().toISOString(),
          });
        }
      } catch (error) {
        actions.push({
          tool: "prepare_draft",
          input: { evaluation_id: evaluation.id, title: evaluation.title, fit_score: evaluation.fit_score },
          result: { error: error instanceof Error ? error.message : String(error) },
          ts: new Date().toISOString(),
        });
        failed += 1;
        remaining -= 1;
      }
    }
  }

  // "Eligible only" must not depend on when a packet was tailored: ready
  // drafts from earlier runs (or prepared from the Agent page) that already
  // pass the fit and tailored-ATS gates are queued here, so no per-job click
  // is ever required. career-ops-submit re-checks every guard and is
  // idempotent, so overlap with the in-run leg above resolves to one task.
  if (remaining > 0
    && submissionsRemaining > 0
    && prefs.auto_apply_enabled
    && prefs.review_mode === "eligible_only") {
    const minFit = prefs.auto_apply_min_fit_score ?? 82;
    const minAts = prefs.auto_apply_min_ats_score ?? 85;
    const supportedPortals = new Set(["greenhouse", "ashby", "lever", "workable"]);
    const enabledPortals = new Set(prefs.auto_apply_portals ?? []);
    const { data: readyDrafts } = await client.from("draft_applications")
      .select("id,tailored_resume_id,error_message,evaluation:job_evaluations(fit_score,eligible,dismissed_at,scanned_jobs(id,company:scan_companies(api_type,api_identifier)))")
      .eq("user_id", userId)
      .eq("status", "ready")
      // Actionable drafts first, then highest-fit first: with 30+ ready
      // drafts, recency ordering starves the batch with below-gate packets
      // and the best applications never get queued.
      .order("error_message", { ascending: true, nullsFirst: true })
      .limit(100);

    const backlog = ((readyDrafts ?? []) as unknown as Array<{
      id: string;
      tailored_resume_id: string | null;
      error_message: string | null;
      evaluation: {
        fit_score: number | null;
        eligible: boolean | null;
        dismissed_at: string | null;
        scanned_jobs: { id: string; company: { api_type: string | null; api_identifier: string | null } | null } | null;
      } | null;
    }>).filter((draft) => {
      const portal = draft.evaluation?.scanned_jobs?.company?.api_type ?? null;
      return Boolean(draft.tailored_resume_id)
        && draft.evaluation?.eligible === true
        && !draft.evaluation.dismissed_at
        && Number(draft.evaluation.fit_score ?? 0) >= minFit
        && typeof portal === "string"
        && supportedPortals.has(portal)
        && enabledPortals.has(portal)
        && !isManualIntakeIdentifier(draft.evaluation?.scanned_jobs?.company?.api_identifier)
        && !/employer verification is required|complete the final check|required field\(s\) still need review|flagged as possible spam|couldn.t submit your application/i.test(draft.error_message ?? "");
    });

    // Highest-fit applications first so daily caps go to the best matches.
    backlog.sort((a, b) => Number(b.evaluation?.fit_score ?? 0) - Number(a.evaluation?.fit_score ?? 0));
    const resumeIds = [...new Set(backlog.map((draft) => String(draft.tailored_resume_id)))];
    const { data: atsRows } = resumeIds.length > 0
      ? await client.from("ats_scores")
        .select("resume_id,scanned_job_id,overall,created_at")
        .eq("user_id", userId)
        .in("resume_id", resumeIds)
        .order("created_at", { ascending: false })
      : { data: [] };
    // Rows arrive newest-first; the first row per resume+job pair is the
    // latest tailored ATS result.
    const latestAtsByPair = new Map<string, number>();
    for (const row of (atsRows ?? []) as Array<{ resume_id: string; scanned_job_id: string; overall: number | null }>) {
      const key = `${row.resume_id}:${row.scanned_job_id}`;
      if (!latestAtsByPair.has(key)) latestAtsByPair.set(key, Number(row.overall ?? 0));
    }

    for (const draft of backlog) {
      if (remaining <= 0 || submissionsRemaining <= 0) break;
      const portal = String(draft.evaluation?.scanned_jobs?.company?.api_type ?? "");
      const jobId = String(draft.evaluation?.scanned_jobs?.id ?? "");
      const atsOverall = latestAtsByPair.get(`${draft.tailored_resume_id}:${jobId}`) ?? 0;
      // Below-threshold packets stay ready for human review; they are not
      // failures and must not flood the action log every run.
      if (atsOverall < minAts) continue;
      try {
        const submitResponse = await callEdgeFunction("career-ops-submit", {
          user_id: userId,
          draft_application_id: draft.id,
        });
        actions.push({
          tool: "queue_submit",
          input: { draft_application_id: draft.id, portal, source: "ready_backlog" },
          result: asRecord(submitResponse.task),
          ts: new Date().toISOString(),
        });
        queued += 1;
        submissionsRemaining -= 1;
      } catch (error) {
        actions.push({
          tool: "queue_submit",
          input: { draft_application_id: draft.id, portal, source: "ready_backlog" },
          result: { error: error instanceof Error ? error.message : String(error) },
          ts: new Date().toISOString(),
        });
        failed += 1;
      }
      remaining -= 1;
    }
  }

  const used = actions.length;
  // Counter semantics (keep aligned with the UI):
  // - This summary counts only NEW actions taken during THIS run. Matches that
  //   already have a packet are deduplicated (see listUnpreparedEvaluations),
  //   so "prepared" here can be 0 while the Agent-page tiles and the
  //   Applications page show more: those surfaces count the CURRENT
  //   draft_applications pipeline (prepared = status draft/ready,
  //   queued = status queued).
  const preparedNote = alreadyPrepared > 0
    ? ` (${alreadyPrepared} match${alreadyPrepared === 1 ? " was" : "es were"} already prepared earlier)`
    : "";
  const summary = used === 0
    ? "No fresh or eligible work was available this hour."
    : `This run scored ${scored} fresh job${scored === 1 ? "" : "s"}, prepared ${prepared} new draft${prepared === 1 ? "" : "s"}${preparedNote}, ATS-checked ${atsScored}, queued ${queued}, and recorded ${failed} failed action${failed === 1 ? "" : "s"}.`;
  return finalize(client, runId, "completed", summary, actions, used);
}

async function finalize(
  client: ReturnType<typeof svc>,
  runId: string,
  status: "completed" | "failed" | "capped",
  summary: string,
  actions: AgentAction[],
  actionsUsed: number,
) {
  const { data: run } = await client.from("agent_runs").select("user_id").eq("id", runId).single();
  await client.from("agent_runs").update({
    status,
    iterations: 1,
    summary,
    tokens_in: 0,
    tokens_out: 0,
    model: "deterministic-v1",
    actions,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);

  if (run?.user_id) {
    const { data: prefs } = await client.from("user_job_prefs")
      .select("agent_actions_today").eq("user_id", run.user_id).single();
    await client.from("user_job_prefs").update({
      agent_actions_today: (prefs?.agent_actions_today ?? 0) + actionsUsed,
      last_agent_run_at: new Date().toISOString(),
    }).eq("user_id", run.user_id);
  }
  return { run_id: runId, status, summary, actions_taken: actionsUsed };
}

function normalized(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.toLowerCase().trim()).filter(Boolean);
}

function inferWorkMode(remotePolicy: string | null, location: string | null): string | null {
  const value = `${remotePolicy ?? ""} ${location ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(value)) return "hybrid";
  if (/\b(on[- ]?site|in[- ]?office|in person)\b/.test(value)) return "onsite";
  if (/\b(remote|work from home|distributed)\b/.test(value)) return "remote";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as { user_id?: string };
    if (!body.user_id) return jsonResponse({ error: "user_id required" }, 400);

    const client = svc();
    try {
      await enforceAutoApplyEntitlement(client, body.user_id);
    } catch (entitlementError) {
      const status = entitlementError instanceof HttpError ? entitlementError.status : 500;
      const message = entitlementError instanceof Error ? entitlementError.message : String(entitlementError);
      return jsonResponse({ error: message }, status);
    }
    const { data: run, error } = await client.from("agent_runs").insert({
      user_id: body.user_id,
      agent: "job_hunter",
      status: "running",
      model: "deterministic-v1",
    }).select("id").single();
    if (error || !run) return jsonResponse({ error: error?.message ?? "could not create agent run" }, 500);

    try {
      return jsonResponse(await runAgent(body.user_id, run.id));
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      await client.from("agent_runs").update({
        status: "failed",
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      return jsonResponse({ run_id: run.id, status: "failed", error: message }, 500);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({ error: message }, status);
  }
});

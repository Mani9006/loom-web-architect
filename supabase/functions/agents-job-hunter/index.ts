/**
 * agents-job-hunter — deterministic hourly career-ops worker.
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserPrefs {
  negative_keywords: string[];
  excluded_companies: string[];
  work_modes: string[];
  auto_apply_min_fit_score: number;
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
  return Boolean(token) && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
): Promise<Array<{ id: string; scanned_job_id: string; fit_score: number; title: string; portal: string | null }>> {
  const { data: evaluations } = await client.from("job_evaluations")
    .select("id,scanned_job_id,fit_score,scanned_jobs(title,company:scan_companies(api_type))")
    .eq("user_id", userId)
    .eq("eligible", true)
    .eq("score_version", "career-fit-v2")
    .gte("fit_score", minFitScore)
    .order("fit_score", { ascending: false })
    .limit(30);
  const { data: drafts } = await client.from("draft_applications").select("evaluation_id").eq("user_id", userId);
  const drafted = new Set((drafts ?? []).map((row: { evaluation_id: string }) => row.evaluation_id));

  return (evaluations ?? [])
    .filter((evaluation: { id: string }) => !drafted.has(evaluation.id))
    .slice(0, limit)
    .map((evaluation: {
      id: string;
      scanned_job_id: string;
      fit_score: number;
      scanned_jobs: { title: string; company: { api_type: string | null } | null } | null;
    }) => ({
      id: evaluation.id,
      scanned_job_id: evaluation.scanned_job_id,
      fit_score: evaluation.fit_score,
      title: evaluation.scanned_jobs?.title ?? "Unknown role",
      portal: evaluation.scanned_jobs?.company?.api_type ?? null,
    }));
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
  let atsScored = 0;
  let queued = 0;
  let failed = 0;

  // Refresh the full resume-and-preference match story first. This is a
  // deterministic zero-token pass over current company-direct roles, so the
  // hourly worker does not waste language-model calls deciding what to score.
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

  const candidates = await listUnscoredMatches(client, userId, prefs, Math.min(5, remaining));
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

  if (remaining > 0) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: queuedToday } = await client.from("draft_applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "submitted"])
      .gte("updated_at", dayStart.toISOString());
    let submissionsRemaining = Math.max(0, (prefs.daily_apply_cap ?? 10) - (queuedToday ?? 0));
    const evaluations = await listUnpreparedEvaluations(
      client,
      userId,
      prefs.auto_apply_min_fit_score ?? 82,
      Math.min(3, remaining),
    );
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
            actions.push({
              tool: "score_ats",
              input: { resume_id: tailoredResumeId, scanned_job_id: evaluation.scanned_job_id },
              result: { ats_score_id: ats.id, overall: ats.overall },
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
        // only supported Greenhouse applications; every other portal remains
        // review/manual and is never silently treated as submitted.
        const shouldAutoQueue = submissionsRemaining > 0
          && prefs.auto_apply_enabled
          && prefs.review_mode === "eligible_only"
          && prefs.auto_apply_portals.includes("greenhouse")
          && evaluation.portal === "greenhouse";
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

  const used = actions.length;
  const summary = used === 0
    ? "No fresh or eligible work was available this hour."
    : `Scored ${scored} fresh job${scored === 1 ? "" : "s"}, prepared ${prepared} draft${prepared === 1 ? "" : "s"}, ATS-checked ${atsScored}, queued ${queued}, and recorded ${failed} failed action${failed === 1 ? "" : "s"}.`;
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

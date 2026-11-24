/**
 * mc-ai-run — cloud runner for the My Collection AI job queue (mc_ai_jobs).
 *
 * My Collection enqueues AI work (resume tailoring, job discovery) into
 * mc_ai_jobs. Historically only a self-hosted local worker drained that
 * queue, so any user without one saw "AI offline" and every Tailor / Find
 * jobs click timed out after six minutes. This function lets the browser
 * ask the server to run a still-queued job instead.
 *
 *   POST { job_id: uuid }  (user JWT required)
 *   → { claimed: false }                      job already picked up / not queued
 *   → { claimed: true, status: "done" | "failed" }
 *
 * The claim is an atomic conditional UPDATE (status = 'queued' → 'running'),
 * so a local worker and this function can never both process one job. The
 * result is written back onto the row; the browser's existing realtime/poll
 * wait in src/lib/mc-ai-jobs.ts picks it up unchanged.
 *
 * Discovery (input.feature === "find_jobs") does NOT ask an LLM to invent
 * postings: it pulls real listings from public ATS boards and only uses the
 * model to score fit against the candidate's resume.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chatFree } from "../_shared/llm.ts";
import { searchDirectJobSources } from "../_shared/direct-job-sources.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser,
  enforceAccountActive, enforceDailyCap, serviceClient, HttpError,
} from "../_shared/guards.ts";
import {
  type CandidateJob, type FitScore,
  dedupeCandidates, filterByLocations, maxTokensFor, mergeFitScores, parseFindJobsInput, tierFor, usageKindFor,
} from "../_shared/mc-ai-run-core.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROMPT_CHARS = 60_000;

interface QueuedJob {
  id: string;
  user_id: string;
  kind: string;
  model: string | null;
  prompt: string;
  input: Record<string, unknown> | null;
}

async function runFindJobs(
  svc: SupabaseClient,
  userId: string,
  job: QueuedJob,
): Promise<{ result: string; result_json: unknown }> {
  const target = parseFindJobsInput(job.input);
  const roles = target.target_roles.length ? target.target_roles : [""];

  // One board sweep per role (each sweep already fans out across every
  // configured ATS board); location filtering happens locally so multiple
  // target locations don't multiply the outbound requests.
  const sweeps = await Promise.all(
    roles.map((role) =>
      searchDirectJobSources({
        query: role,
        remoteFilter: target.remote_only ? "remote-only" : undefined,
        limit: 30,
      }).catch(() => [] as CandidateJob[])
    ),
  );
  const candidates = dedupeCandidates(
    filterByLocations(sweeps.flat(), target.target_locations, target.remote_only),
  ).slice(0, 40);
  if (candidates.length === 0) {
    const empty = { jobs: [] };
    return { result: JSON.stringify(empty), result_json: empty };
  }

  const resume = String((job.input as Record<string, unknown> | null)?.resume_md ?? "").slice(0, 6000);
  let scores: FitScore[] | null = null;
  if (resume) {
    const listing = candidates
      .map((c, i) =>
        `[${i}] ${c.title} — ${c.company} (${c.location || "n/a"})\n${c.description.replace(/\s+/g, " ").slice(0, 400)}`
      )
      .join("\n\n");
    try {
      const r = await chatFree<{ scores: FitScore[] }>(
        "lite",
        [
          {
            role: "system",
            content:
              "You rate job fit for a candidate. Be honest. fit_score: 0=irrelevant, 1=stretch, 2=good fit, 3=strong fit. " +
              "fit_reason: one sentence citing the candidate's real experience. summary: one sentence on what the role is. " +
              'Return ONLY JSON: {"scores":[{"i":number,"fit_score":number,"fit_reason":string,"summary":string}]}',
          },
          { role: "user", content: `CANDIDATE RESUME:\n${resume}\n\nJOBS:\n${listing}` },
        ],
        { maxTokens: 3000, temperature: 0.2, parseJson: true, usage: { svc, userId, kind: "search" } },
      );
      scores = Array.isArray(r.text?.scores) ? r.text.scores : null;
    } catch (e) {
      // Scoring is best-effort; real listings are still useful unscored.
      console.warn("[mc-ai-run] fit scoring failed:", e instanceof Error ? e.message : e);
    }
  }

  const out = { jobs: mergeFitScores(candidates, scores) };
  return { result: JSON.stringify(out), result_json: out };
}

async function runPrompt(
  svc: SupabaseClient,
  userId: string,
  job: QueuedJob,
): Promise<{ result: string; result_json: unknown }> {
  const r = await chatFree<string>(
    tierFor(job.kind, job.model),
    [{ role: "user", content: job.prompt.slice(0, MAX_PROMPT_CHARS) }],
    {
      maxTokens: maxTokensFor(job.kind),
      temperature: 0.3,
      usage: { svc, userId, kind: usageKindFor(job.kind) },
    },
  );
  const text = String(r.text ?? "").trim();
  if (!text) throw new Error("The AI returned an empty response. Please try again.");
  return { result: text, result_json: null };
}

serve((req) => {
  if (req.method === "OPTIONS") return Promise.resolve(new Response(null, { headers: corsHeaders() }));
  return withErrorHandler(async () => {
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.job_id ?? "");
    if (!UUID_RE.test(jobId)) throw new HttpError(400, "job_id required");

    const svc = serviceClient();

    // Atomic claim: only a still-queued job owned by the caller.
    const { data: claimed, error: claimErr } = await svc
      .from("mc_ai_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id)
      .eq("status", "queued")
      .select("id,user_id,kind,model,prompt,input")
      .maybeSingle();
    if (claimErr) throw new HttpError(500, claimErr.message);
    if (!claimed) return jsonResponse({ claimed: false });

    const job = claimed as QueuedJob;
    try {
      const { isPro } = await enforceAccountActive(svc, user.id);
      const feature = job.input?.feature;
      await enforceDailyCap(svc, user.id, usageKindFor(job.kind, feature), isPro);

      const out = feature === "find_jobs"
        ? await runFindJobs(svc, user.id, job)
        : await runPrompt(svc, user.id, job);

      await svc
        .from("mc_ai_jobs")
        .update({
          status: "done",
          result: out.result,
          result_json: out.result_json,
          error: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return jsonResponse({ claimed: true, status: "done" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await svc
        .from("mc_ai_jobs")
        .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
        .eq("id", job.id);
      return jsonResponse({ claimed: true, status: "failed", error: message });
    }
  });
});

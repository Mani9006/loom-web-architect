/**
 * apply-engine-enqueue — fan-out independent cloud application jobs.
 *
 * Each evaluation becomes its own applypass_tasks row so the worker pool can
 * tailor + submit many jobs at once. Detection of an ATS is not a submit.
 * Unsupported / account-gated boards still get a tailored packet and land in
 * Needs you. Live adapters (greenhouse, lever, ashby, workable, workday)
 * are queued for the browser worker.
 *
 * Body:
 *   { evaluation_ids?: string[], draft_ids?: string[], apply_url?: string,
 *     intent?: "user_selected" | "hands_off", user_id?: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { detectAtsFromUrl } from "../_shared/ats-detect.ts";
import {
  corsHeaders,
  getAuthedUserOrService,
  HttpError,
  jsonResponse,
  serviceClient,
  withErrorHandler,
} from "../_shared/guards.ts";

interface EnqueueBody {
  evaluation_ids?: unknown;
  draft_ids?: unknown;
  apply_url?: string;
  intent?: string;
  user_id?: string;
}

interface EngineRow {
  evaluation_id: string;
  draft_id: string | null;
  task_id: string | null;
  apply_url: string;
  ats: string | null;
  submittable: boolean;
  status: "queued" | "needs_you" | "error";
  reason: string;
}

function asIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.slice(0, 50);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function callEdge(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}_${response.status}:${text.slice(0, 240)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function ingestJobUrl(userId: string, applyUrl: string): Promise<string> {
  const detection = detectAtsFromUrl(applyUrl);
  const parsed = new URL(applyUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  let title = parts.at(-1)?.replace(/[-_]+/g, " ") || "Pasted role";
  let companyName = parts[0] || parsed.hostname.split(".")[0] || "Employer";
  let description: string | null = null;
  let location: string | null = null;

  if (detection.ats === "greenhouse") {
    const boardsIndex = parts.findIndex((part) => ["boards", "job-boards"].includes(part));
    const board = parts[boardsIndex + 1] || parts[0];
    const jobId = parts.find((part, index) => parts[index - 1] === "jobs") || parts.at(-1);
    if (board && jobId && /^\d+$/.test(jobId)) {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`);
      if (res.ok) {
        const job = asRecord(await res.json());
        title = asString(job.title) || title;
        location = asString(asRecord(job.location).name) || location;
        description = asString(job.content) || null;
        companyName = board;
      }
    }
  } else if (detection.ats === "lever") {
    const org = parts[0];
    const postingId = parts[1];
    if (org && postingId) {
      const res = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(org)}/${encodeURIComponent(postingId)}`);
      if (res.ok) {
        const job = asRecord(await res.json());
        title = asString(job.text) || title;
        companyName = org;
        location = asString(asRecord(job.categories).location) || location;
        description = asString(asRecord(job.description).text) || asString(job.descriptionPlain) || null;
      }
    }
  } else if (detection.ats === "ashby") {
    const org = parts[0];
    const postingId = parts[1];
    if (org) {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`);
      if (res.ok) {
        const board = asRecord(await res.json());
        const jobs = Array.isArray(board.jobs) ? board.jobs : [];
        const job = jobs.map(asRecord).find((item) => asString(item.id) === postingId) || asRecord(jobs[0]);
        title = asString(job.title) || title;
        companyName = org;
        location = asString(job.location) || location;
        description = asString(job.descriptionHtml) || asString(job.descriptionPlain) || null;
      }
    }
  }

  const result = await callEdge("career-ops-one-click", {
    user_id: userId,
    title,
    company: companyName,
    location,
    description,
    apply_url: applyUrl,
    source: "paste_url",
    queue_if_supported: false,
  });
  const evaluationId = asString(result.evaluation_id);
  if (!evaluationId) throw new Error("Could not ingest that job URL");
  return evaluationId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as EnqueueBody;
    const user = await getAuthedUserOrService(req, body.user_id);
    const intent = body.intent === "hands_off" ? "hands_off" : "user_selected";
    const db = serviceClient();

    if (intent === "hands_off") {
      const { data: prefs } = await db.from("user_job_prefs")
        .select("auto_apply_enabled,agent_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prefs?.auto_apply_enabled || !prefs?.agent_enabled) {
        throw new HttpError(403, "Hands-off apply is stopped. Turn it on to enqueue automatically.");
      }
    }

    let evaluationIds = asIds(body.evaluation_ids);

    if (asIds(body.draft_ids).length > 0) {
      const { data: drafts } = await db.from("draft_applications")
        .select("id,evaluation_id")
        .eq("user_id", user.id)
        .in("id", asIds(body.draft_ids));
      for (const draft of drafts ?? []) {
        if (draft.evaluation_id && !evaluationIds.includes(draft.evaluation_id)) {
          evaluationIds.push(draft.evaluation_id);
        }
      }
    }

    const pasted = asString(body.apply_url);
    if (pasted) {
      const ingested = await ingestJobUrl(user.id, pasted);
      if (!evaluationIds.includes(ingested)) evaluationIds.unshift(ingested);
    }

    if (evaluationIds.length === 0) {
      throw new HttpError(400, "Select at least one job, or paste a job URL.");
    }

    const { data: evaluations, error: evalError } = await db.from("job_evaluations")
      .select("id,scanned_job_id,fit_score,eligible,scanned_job:scanned_jobs(id,title,apply_url,company:scan_companies(name,api_type,slug))")
      .eq("user_id", user.id)
      .in("id", evaluationIds);
    if (evalError) throw new HttpError(500, "Matches could not be loaded");

    const byId = new Map((evaluations ?? []).map((row: Record<string, unknown>) => [String(row.id), row]));
    const rows: EngineRow[] = [];

    // Insert independent queue jobs without waiting for tailoring. Workers
    // call ensure-packet, then submit or hand off.
    await Promise.all(evaluationIds.map(async (evaluationId) => {
      const evaluation = byId.get(evaluationId);
      if (!evaluation) {
        rows.push({
          evaluation_id: evaluationId, draft_id: null, task_id: null, apply_url: "",
          ats: null, submittable: false, status: "error", reason: "Match not found",
        });
        return;
      }
      const job = asRecord(evaluation.scanned_job);
      const applyUrl = asString(job.apply_url);
      const detection = detectAtsFromUrl(applyUrl);
      const company = asRecord(job.company);

      const { data: existingDraft } = await db.from("draft_applications")
        .select("id,status")
        .eq("user_id", user.id)
        .eq("evaluation_id", evaluationId)
        .maybeSingle();

      let draftId = existingDraft?.id as string | undefined;
      if (!draftId) {
        const { data: created, error: draftError } = await db.from("draft_applications").insert({
          user_id: user.id,
          evaluation_id: evaluationId,
          status: "draft",
          answers: [],
        }).select("id").single();
        if (draftError || !created) {
          rows.push({
            evaluation_id: evaluationId, draft_id: null, task_id: null, apply_url: applyUrl,
            ats: detection.ats, submittable: detection.submittable, status: "error",
            reason: "Could not open an application packet",
          });
          return;
        }
        draftId = created.id;
      }

      const { data: active } = await db.from("applypass_tasks")
        .select("id,status")
        .eq("user_id", user.id)
        .eq("task_type", "apply_engine")
        .contains("payload", { draft_application_id: draftId })
        .in("status", ["pending", "running"])
        .maybeSingle();

      if (active?.id) {
      await db.from("draft_applications").update({
        status: "queued",
        applypass_task_id: active.id,
        detected_ats: detection.ats,
        ats_submittable: detection.submittable,
        error_message: detection.submittable ? null : detection.reason,
      }).eq("id", draftId).eq("user_id", user.id);
        rows.push({
          evaluation_id: evaluationId, draft_id: draftId, task_id: active.id, apply_url: applyUrl,
          ats: detection.ats, submittable: detection.submittable,
          status: detection.submittable ? "queued" : "needs_you",
          reason: "Already in the cloud queue",
        });
        return;
      }

      const payload = {
        engine: "apply_engine",
        intent,
        draft_application_id: draftId,
        evaluation_id: evaluationId,
        apply_url: applyUrl,
        detected_ats: detection.ats,
        submittable: detection.submittable,
        company_name: asString(company.name),
        job_title: asString(job.title),
        scanned_job_id: asString(job.id) || asString(evaluation.scanned_job_id),
        jobs: [{
          id: asString(job.id) || evaluationId,
          title: asString(job.title),
          company: asString(company.name),
          url: applyUrl,
          approvalReceipt: intent === "user_selected" || intent === "hands_off"
            ? { approved: true, reviewedAt: new Date().toISOString(), source: intent }
            : undefined,
        }],
      };

      const { data: task, error: taskError } = await db.from("applypass_tasks").insert({
        user_id: user.id,
        task_type: "apply_engine",
        status: "pending",
        payload,
      }).select("id,status").single();
      if (taskError || !task) {
        rows.push({
          evaluation_id: evaluationId, draft_id: draftId, task_id: null, apply_url: applyUrl,
          ats: detection.ats, submittable: detection.submittable, status: "error",
          reason: "Could not enqueue this application",
        });
        return;
      }

      await db.from("draft_applications").update({
        status: "queued",
        applypass_task_id: task.id,
        detected_ats: detection.ats,
        ats_submittable: detection.submittable,
        error_message: detection.submittable ? null : detection.reason,
      }).eq("id", draftId).eq("user_id", user.id);

      rows.push({
        evaluation_id: evaluationId,
        draft_id: draftId,
        task_id: task.id,
        apply_url: applyUrl,
        ats: detection.ats,
        submittable: detection.submittable,
        status: detection.submittable ? "queued" : "needs_you",
        reason: detection.reason,
      });
    }));

    return jsonResponse({
      ok: true,
      intent,
      count: rows.length,
      queued: rows.filter((row) => row.status === "queued").length,
      needs_you: rows.filter((row) => row.status === "needs_you").length,
      jobs: rows,
    });
  });
});

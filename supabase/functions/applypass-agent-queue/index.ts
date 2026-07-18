import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceAutoApplyEntitlement,
  enforceMonthlyAutoApplyExecutionCap,
} from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-applypass-worker-token, x-worker-id",
};

type QueueAction =
  | "enqueue"
  | "list"
  | "cancel"
  | "claim-next"
  | "heartbeat"
  | "verification-code"
  | "complete"
  | "fail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getWorkerToken(req: Request, body: Record<string, unknown>): string {
  return (
    req.headers.get("x-applypass-worker-token") ||
    (typeof body.workerToken === "string" ? body.workerToken : "") ||
    ""
  );
}

function workerAuthorized(req: Request, body: Record<string, unknown>): boolean {
  const expected = Deno.env.get("APPLYPASS_WORKER_TOKEN") || Deno.env.get("WORKER_AUTH_TOKEN") || "";
  if (!expected) return false;
  const actual = getWorkerToken(req, body);
  return Boolean(actual) && actual === expected;
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY for worker actions.");
  }
  return createClient(supabaseUrl, serviceRole);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function syncCareerDraft(
  serviceClient: ReturnType<typeof createServiceClient>,
  taskContext: Record<string, unknown> | null,
  outcome: "complete" | "fail",
  result: unknown,
  errorMessage?: string,
) {
  if (!taskContext || taskContext.task_type !== "career_ops_submit") return;
  const payload = asRecord(taskContext.payload);
  const draftId = typeof payload.draft_application_id === "string" ? payload.draft_application_id : "";
  const trackedJobId = typeof payload.tracked_job_id === "string" ? payload.tracked_job_id : "";
  const userId = typeof taskContext.user_id === "string" ? taskContext.user_id : "";
  if (!draftId || !userId) return;

  if (outcome === "fail") {
    await serviceClient.from("draft_applications").update({
      status: "failed",
      error_message: (errorMessage || "Worker execution failed").slice(0, 1500),
    }).eq("id", draftId).eq("user_id", userId);
    return;
  }

  const jobs = Array.isArray(asRecord(result).jobs) ? asRecord(result).jobs as unknown[] : [];
  const submitted = jobs.some((job) => asRecord(job).status === "submitted" && asRecord(job).submitted === true);
  const firstIssue = jobs
    .map((job) => asRecord(job).error)
    .find((message) => typeof message === "string" && message.trim());

  await serviceClient.from("draft_applications").update({
    status: submitted ? "submitted" : "ready",
    submitted_at: submitted ? new Date().toISOString() : null,
    error_message: submitted ? null : typeof firstIssue === "string" ? firstIssue.slice(0, 1500) : null,
  }).eq("id", draftId).eq("user_id", userId);

  if (submitted && trackedJobId) {
    await serviceClient.from("mc_tracked_jobs").update({
      status: "applied",
      applied_at: new Date().toISOString(),
    }).eq("id", trackedJobId).eq("user_id", userId);
    await serviceClient.from("mc_status_history").insert({
      tracked_job_id: trackedJobId,
      user_id: userId,
      status_from: "saved",
      status_to: "applied",
      source: "auto_apply",
    });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body?.action || "enqueue") as QueueAction;

    const workerActions = new Set<QueueAction>(["claim-next", "heartbeat", "verification-code", "complete", "fail"]);
    if (workerActions.has(action)) {
      if (!workerAuthorized(req, body)) {
        return jsonResponse({ error: "Unauthorized worker action." }, 401);
      }

      const serviceClient = createServiceClient();
      const workerId =
        String(body?.workerId || req.headers.get("x-worker-id") || "applypass-worker").trim() ||
        "applypass-worker";

      if (action === "claim-next") {
        const { data, error } = await serviceClient.rpc("claim_applypass_task", {
          p_worker_id: workerId,
        });

        if (error) throw error;

        const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
        return jsonResponse({ ok: true, task: rows[0] || null });
      }

      const taskId = String(body?.taskId || "").trim();
      if (!taskId) {
        return jsonResponse({ error: "taskId is required" }, 400);
      }

      if (action === "verification-code") {
        const jobId = String(body?.jobId || "").trim();
        if (!jobId) return jsonResponse({ error: "jobId is required" }, 400);

        const { data: task } = await serviceClient
          .from("applypass_tasks")
          .select("id,user_id,payload,status")
          .eq("id", taskId)
          .in("status", ["pending", "running"])
          .maybeSingle();
        if (!task) return jsonResponse({ error: "Active task not found" }, 404);

        const taskPayload = asRecord(task.payload);
        const taskJobs = Array.isArray(taskPayload.jobs) ? taskPayload.jobs.map(asRecord) : [];
        const taskJob = taskJobs.find((job) => String(job.id || "") === jobId);
        if (!taskJob) return jsonResponse({ error: "Job does not belong to this task" }, 403);

        // Poll through the server-side Gmail connection. OAuth tokens never
        // enter the worker payload, browser context, logs, or frontend.
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (supabaseUrl && serviceRole) {
          await fetch(`${supabaseUrl}/functions/v1/mc-gmail-poll`, {
            method: "POST",
            headers: {
              apikey: serviceRole,
              authorization: `Bearer ${serviceRole}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ user_id: task.user_id }),
          }).catch(() => null);
        }

        const trackedJobId = String(taskJob.trackedJobId || taskPayload.tracked_job_id || "").trim();
        if (!trackedJobId) return jsonResponse({ ok: true, available: false });
        let codeQuery = serviceClient
          .from("mc_inbound_emails")
          .select("id,verification_code,verification_code_expires_at")
          .eq("user_id", task.user_id)
          .not("verification_code", "is", null)
          .gt("verification_code_expires_at", new Date().toISOString())
          .order("received_at", { ascending: false })
          .limit(1);
        codeQuery = codeQuery.eq("tracked_job_id", trackedJobId);
        const { data: codeRows } = await codeQuery;
        const codeRow = codeRows?.[0];
        if (!codeRow?.verification_code) return jsonResponse({ ok: true, available: false });

        await serviceClient.from("mc_inbound_emails").update({
          verification_code: null,
          verification_code_expires_at: null,
          verification_code_used_at: new Date().toISOString(),
          is_read: true,
        }).eq("id", codeRow.id);

        return jsonResponse({ ok: true, available: true, code: codeRow.verification_code });
      }

      if (action === "heartbeat") {
        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({ heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", taskId)
          .eq("status", "running")
          .select("id,user_id,status,heartbeat_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        await serviceClient.from("mc_worker_heartbeats").upsert({
          user_id: data.user_id,
          hostname: workerId,
          version: "applypass-browser-worker-v2",
          last_seen: new Date().toISOString(),
        }, { onConflict: "user_id" });

        return jsonResponse({ ok: true, task: data });
      }

      if (action === "complete") {
        const { data: taskContext } = await serviceClient
          .from("applypass_tasks")
          .select("task_type,payload,user_id")
          .eq("id", taskId)
          .maybeSingle();
        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({
            status: "completed",
            result: body?.result || null,
            error_message: null,
            heartbeat_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .in("status", ["running", "pending"])
          .select("id,status,completed_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        await syncCareerDraft(serviceClient, taskContext, "complete", body?.result);

        return jsonResponse({ ok: true, task: data });
      }

      if (action === "fail") {
        const errorMessage = String(body?.errorMessage || "Worker execution failed").slice(0, 1500);
        const { data: taskContext } = await serviceClient
          .from("applypass_tasks")
          .select("task_type,payload,user_id")
          .eq("id", taskId)
          .maybeSingle();

        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({
            status: "failed",
            result: body?.result || null,
            error_message: errorMessage,
            heartbeat_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .in("status", ["running", "pending"])
          .select("id,status,error_message,completed_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        await syncCareerDraft(serviceClient, taskContext, "fail", body?.result, errorMessage);

        return jsonResponse({ ok: true, task: data });
      }

      return jsonResponse({ error: "Unsupported worker action" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Supabase env vars missing" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("applypass_tasks")
        .select("id,task_type,status,error_message,created_at,updated_at,payload,result,run_log,attempt_count,max_attempts,started_at,completed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      return jsonResponse({ ok: true, tasks: data || [] });
    }

    if (action === "cancel") {
      const taskId = String(body?.taskId || "").trim();
      if (!taskId) {
        return jsonResponse({ error: "taskId is required" }, 400);
      }

      const { data, error } = await supabase
        .from("applypass_tasks")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("user_id", user.id)
        .in("status", ["pending", "running"])
        .select("id,status,updated_at")
        .single();

      if (error) throw error;

      return jsonResponse({ ok: true, task: data });
    }

    const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
    if (jobs.length === 0) {
      return jsonResponse({ error: "jobs array is required" }, 400);
    }

    if (jobs.length > 25) {
      return jsonResponse({ error: "Maximum 25 jobs per queued task" }, 400);
    }

    const serviceClient = createServiceClient();
    await enforceAutoApplyEntitlement(serviceClient, user.id);
    await enforceMonthlyAutoApplyExecutionCap(serviceClient, user.id, jobs.length);

    const taskPayload = {
      jobs,
      resumeId: body?.resumeId || null,
      candidateProfile: body?.candidateProfile || null,
      answerMemory: body?.answerMemory || null,
      source: body?.source || "applypass_workspace",
      createdBy: user.email || user.id,
      createdAt: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("applypass_tasks")
      .insert({
        user_id: user.id,
        task_type: String(body?.taskType || "bulk_apply"),
        status: "pending",
        payload: taskPayload,
      })
      .select("id,task_type,status,created_at")
      .single();

    if (error) throw error;

    return jsonResponse({ ok: true, task: data });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, status);
  }
});

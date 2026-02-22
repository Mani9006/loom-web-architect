import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const expected = Deno.env.get("APPLYPASS_WORKER_TOKEN") || "";
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body?.action || "enqueue") as QueueAction;

    const workerActions = new Set<QueueAction>(["claim-next", "heartbeat", "complete", "fail"]);
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

      if (action === "heartbeat") {
        const { data, error } = await serviceClient
          .from("applypass_tasks")
          .update({ heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", taskId)
          .eq("status", "running")
          .select("id,status,heartbeat_at,updated_at")
          .single();

        if (error) throw error;

        if (body?.log) {
          await serviceClient.rpc("append_applypass_task_log", {
            p_task_id: taskId,
            p_entry: body.log,
          });
        }

        return jsonResponse({ ok: true, task: data });
      }

      if (action === "complete") {
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

        return jsonResponse({ ok: true, task: data });
      }

      if (action === "fail") {
        const errorMessage = String(body?.errorMessage || "Worker execution failed").slice(0, 1500);

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
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

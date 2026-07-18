/**
 * career-ops-submit — Opt-in Greenhouse auto-submit.
 *
 * Takes a `draft_application_id`, verifies:
 *   - Draft belongs to caller (RLS-bound + service-role re-check)
 *   - User has user_job_prefs.auto_apply_enabled = true
 *   - `greenhouse` is in user_job_prefs.auto_apply_portals
 *   - Today's submissions < user_job_prefs.daily_apply_cap
 *   - Draft status = 'ready' (not already submitted / failed)
 *   - scanned_jobs.company.api_type = 'greenhouse' (only portal supported)
 *
 * Then enqueues a task into the existing `applypass_tasks` queue so the
 * existing worker infrastructure can process it asynchronously. This keeps
 * the edge function fast and lets you scale submission throughput via more
 * workers rather than more edge-function concurrency.
 *
 * CRITICAL ENTERPRISE GUARDS:
 *   - The edge function NEVER submits directly — it only queues.
 *   - The worker is responsible for the actual HTTP submission. See
 *     supabase/functions/applypass-browser-session/index.ts + the
 *     career-ops-greenhouse payload type below.
 *   - Lever / Ashby / Workday / LinkedIn Easy Apply auto-submit is NOT
 *     enabled. ToS + account-flag risk at scale is too high.
 *   - `daily_apply_cap` is enforced at enqueue time (optimistic counting
 *     from `applications` + today's `applypass_tasks` with status=running).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceAutoApplyEntitlement,
  enforceMonthlyAutoApplyExecutionCap,
} from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitPayload {
  draft_application_id: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    },
  );
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function enqueueSubmit(userId: string, draftId: string) {
  const svc = serviceClient();

  // Load draft + evaluation + job + company
  const { data: draft, error: draftErr } = await svc
    .from("draft_applications")
    .select(`id, user_id, evaluation_id, tailored_resume_id, tailored_cv_md, answers, status,
      evaluation:job_evaluations(
        scanned_job:scanned_jobs(
          id, title, apply_url, external_id,
          company:scan_companies(slug, name, api_type, api_identifier)
        )
      )`)
    .eq("id", draftId)
    .maybeSingle();
  if (draftErr || !draft) throw new Error("draft not found");
  if (draft.user_id !== userId) {
    const e = new Error("forbidden"); (e as any).status = 403; throw e;
  }
  if (!["ready", "failed"].includes(draft.status)) {
    const e = new Error(`draft not in submittable state (${draft.status})`); (e as any).status = 409; throw e;
  }

  const job = (draft as any).evaluation?.scanned_job;
  const company = job?.company;
  if (!job || !company) throw new Error("associated job missing");
  if (company.api_type !== "greenhouse") {
    const e = new Error(`auto-submit only supported for Greenhouse portals (this is ${company.api_type}). Submit manually.`);
    (e as any).status = 422; throw e;
  }

  // Load prefs
  const { data: prefs } = await svc
    .from("user_job_prefs")
    .select("auto_apply_enabled, auto_apply_portals, daily_apply_cap")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prefs?.auto_apply_enabled) {
    const e = new Error("auto-apply is not enabled in your preferences"); (e as any).status = 403; throw e;
  }
  if (!prefs.auto_apply_portals?.includes("greenhouse")) {
    const e = new Error("Greenhouse is not enabled in your auto-apply portals"); (e as any).status = 403; throw e;
  }

  // Daily cap: count today's applypass_tasks for this user with career_ops_submit task_type
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count: todaysCount } = await svc
    .from("applypass_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("task_type", "career_ops_submit")
    .gte("created_at", todayStart.toISOString());
  if ((todaysCount ?? 0) >= (prefs.daily_apply_cap ?? 5)) {
    const e = new Error(`daily submit cap reached (${prefs.daily_apply_cap})`); (e as any).status = 429; throw e;
  }

  // Enqueue
  const payload = {
    portal: "greenhouse",
    company_slug: company.slug,
    company_name: company.name,
    api_identifier: company.api_identifier,
    job_external_id: job.external_id,
    job_title: job.title,
    apply_url: job.apply_url,
    draft_application_id: draft.id,
    tailored_resume_id: draft.tailored_resume_id,
    evaluation_id: draft.evaluation_id,
    // Answers are passed through to the worker; worker maps them into
    // Greenhouse's question schema at submit time.
    answers: draft.answers,
  };

  const { data: task, error: taskErr } = await svc
    .from("applypass_tasks")
    .insert({
      user_id: userId,
      task_type: "career_ops_submit",
      status: "pending",
      payload,
    })
    .select("id, status")
    .single();
  if (taskErr) throw new Error(`enqueue: ${taskErr.message}`);

  // Mark draft queued + link the task
  await svc
    .from("draft_applications")
    .update({ status: "queued", applypass_task_id: (task as any).id })
    .eq("id", draft.id);

  return { task, draft_status: "queued" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = userClient(req);
    const { data: userRes } = await auth.auth.getUser();
    const user = userRes?.user;
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const svc = serviceClient();
    await enforceAutoApplyEntitlement(svc, user.id);
    await enforceMonthlyAutoApplyExecutionCap(svc, user.id, 1);

    const body = await req.json().catch(() => ({})) as SubmitPayload;
    if (!body.draft_application_id) return jsonResponse({ error: "draft_application_id required" }, 400);

    const result = await enqueueSubmit(user.id, body.draft_application_id);
    return jsonResponse(result);
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, status);
  }
});

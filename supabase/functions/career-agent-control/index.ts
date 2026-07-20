import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAutoApplyEntitlement, getAuthedUser } from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ControlAction = "start" | "stop" | "pass";

interface ControlBody {
  action?: ControlAction;
  evaluation_id?: string;
  auto_apply_min_fit_score?: number;
  auto_apply_min_ats_score?: number;
  tailoring_mode?: "evidence_only" | "coverage_boost";
  daily_apply_cap?: number;
  agent_max_actions_per_day?: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

async function dispatchImmediateRun(userId: string): Promise<void> {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agents-job-hunter`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId, source: "continuous_apply_start" }),
  });
  if (!response.ok) throw new Error(`Immediate Agent run was not accepted (${response.status}).`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({})) as ControlBody;
    const action = body.action;
    const client = serviceClient();

    if (action === "pass") {
      if (!body.evaluation_id) return jsonResponse({ error: "A job selection is required." }, 400);
      const { data, error } = await client.from("job_evaluations").update({
        dismissed_at: new Date().toISOString(),
      }).eq("id", body.evaluation_id).eq("user_id", user.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "That job is no longer available." }, 404);
      return jsonResponse({ ok: true, action: "pass", evaluation_id: data.id });
    }

    if (action === "stop") {
      await client.from("user_job_prefs").update({
        agent_enabled: false,
        auto_apply_enabled: false,
      }).eq("user_id", user.id);

      const { data: canceledTasks } = await client.from("applypass_tasks").update({
        status: "canceled",
        error_message: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).in("status", ["pending", "running"]).select("id");

      await client.from("draft_applications").update({
        status: "ready",
        error_message: null,
      }).eq("user_id", user.id).eq("status", "queued");

      return jsonResponse({
        ok: true,
        action: "stop",
        state: "stopped",
        canceled: canceledTasks?.length ?? 0,
      });
    }

    if (action !== "start") return jsonResponse({ error: "Choose start or stop." }, 400);

    await enforceAutoApplyEntitlement(client, user.id);
    // Default daily cap of 25: research-backed anti-flag pacing. Callers can
    // still raise it explicitly (clamped to 75), but the out-of-box default
    // keeps submission volume inside normal human application patterns.
    const dailyCap = clamp(body.daily_apply_cap, 1, 75, 25);
    const dailyActions = clamp(body.agent_max_actions_per_day, 30, 300, 240);
    const minFit = clamp(body.auto_apply_min_fit_score, 50, 100, 82);
    const minAts = clamp(body.auto_apply_min_ats_score, 70, 95, 85);
    const tailoringMode = body.tailoring_mode === "coverage_boost" ? "coverage_boost" : "evidence_only";

    const { error: prefsError } = await client.from("user_job_prefs").upsert({
      user_id: user.id,
      agent_enabled: true,
      auto_apply_enabled: true,
      review_mode: "eligible_only",
      auto_apply_min_fit_score: minFit,
      auto_apply_min_ats_score: minAts,
      tailoring_mode: tailoringMode,
      daily_apply_cap: dailyCap,
      agent_max_actions_per_day: dailyActions,
      auto_apply_portals: ["greenhouse", "ashby", "lever"],
      last_agent_run_at: null,
    }, { onConflict: "user_id" });
    if (prefsError) throw prefsError;

    // Start returns after the first run attempt. A temporary dispatch failure
    // never disables the saved command; the ten-minute scheduler retries it.
    let immediateRunAccepted = true;
    try {
      await dispatchImmediateRun(user.id);
    } catch {
      immediateRunAccepted = false;
    }

    return jsonResponse({
      ok: true,
      action: "start",
      state: "running",
      weekly_target: 400,
      monthly_allowance: 1600,
      next_refresh_minutes: 10,
      immediate_run_accepted: immediateRunAccepted,
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    const message = error instanceof Error ? error.message : "The Agent command could not be completed.";
    return jsonResponse({ error: message }, status);
  }
});

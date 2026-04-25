/**
 * agents-orchestrator — Hourly fan-out for autopilot agents.
 *
 * Picks users with `agent_enabled=true` whose last_agent_run_at is older
 * than ~55 minutes (or null) and dispatches `agents-job-hunter` for each,
 * with bounded concurrency so we don't burst the Anthropic API.
 *
 * Triggered by pg_cron every hour at minute :13. Manual admin kicks via
 * POST { source: "admin" } with the service role bearer.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY = 4;
const STALE_MINUTES = 55;
const MAX_USERS_PER_RUN = 200;

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function dispatch(userId: string): Promise<{ user_id: string; ok: boolean; error?: string }> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agents-job-hunter`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
      return { user_id: userId, ok: false, error: `${res.status}` };
    }
    return { user_id: userId, ok: true };
  } catch (e) {
    return { user_id: userId, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!req.headers.get("authorization")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const client = svc();
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

    // Pull users due for a run.
    const { data: rows } = await client
      .from("user_job_prefs")
      .select("user_id, agent_actions_today, agent_max_actions_per_day, last_agent_run_at")
      .eq("agent_enabled", true)
      .or(`last_agent_run_at.is.null,last_agent_run_at.lt.${cutoff}`)
      .limit(MAX_USERS_PER_RUN);

    const users = ((rows || []) as Array<{
      user_id: string;
      agent_actions_today: number;
      agent_max_actions_per_day: number;
    }>)
      .filter((r) => r.agent_actions_today < r.agent_max_actions_per_day)
      .map((r) => r.user_id);

    const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];
    const queue = [...users];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) return;
        results.push(await dispatch(id));
      }
    });
    await Promise.all(workers);

    const ok = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({
      dispatched: ok,
      failed: results.length - ok,
      total_eligible: users.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

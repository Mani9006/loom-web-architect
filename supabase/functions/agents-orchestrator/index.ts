/**
 * agents-orchestrator — Ten-minute fan-out for autopilot agents.
 *
 * Picks users with `agent_enabled=true` whose last_agent_run_at is older
 * than ~9 minutes (or null) and dispatches `agents-job-hunter` for each,
 * with bounded concurrency so downstream evaluation and tailoring stay within
 * provider and database limits.
 *
 * Triggered by pg_cron every ten minutes. Manual admin kicks via
 * POST { source: "admin" } with the service role bearer.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY = 4;
const STALE_MINUTES = 9;
const MAX_USERS_PER_RUN = 200;
const SCAN_STALE_HOURS = 6;
const SCAN_WAIT_MS = 90_000;

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

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const workerToken = Deno.env.get("WORKER_AUTH_TOKEN") || "";
  if (!token || (token !== serviceRole && token !== workerToken)) {
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

    const candidates = ((rows || []) as Array<{
      user_id: string;
      agent_actions_today: number;
      agent_max_actions_per_day: number;
    }>)
      .filter((r) => r.agent_actions_today < r.agent_max_actions_per_day)
      .map((r) => r.user_id);

    // The service worker must not run costly matching/tailoring work for a
    // free, canceled, or suspended account even if a stale preference remains.
    const { data: accessRows } = candidates.length > 0
      ? await client.from("user_access_controls")
        .select("user_id,account_status,purchase_state,subscription_plan")
        .in("user_id", candidates)
      : { data: [] };
    const entitled = new Set(((accessRows || []) as Array<{
      user_id: string;
      account_status: string;
      purchase_state: string;
      subscription_plan: string;
    }>)
      .filter((row) => row.account_status === "active"
        && ["trial", "active", "manual"].includes(row.purchase_state)
        && ["autopilot", "premium"].includes((row.subscription_plan || "").toLowerCase()))
      .map((row) => row.user_id));
    const users = candidates.filter((userId) => entitled.has(userId));

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

    // Scan backstop: career-ops-scan normally runs on its own hourly pg_cron.
    // If the newest posting is stale >6h that schedule is likely down, so kick
    // one scan here (service-role, same internal pattern as the fan-out). The
    // backstop is best-effort and never fails the fan-out response.
    let scanRefresh = "fresh";
    try {
      const { data: newest } = await client
        .from("scanned_jobs")
        .select("last_seen_at")
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const newestTs = newest?.last_seen_at ? Date.parse(newest.last_seen_at) : 0;
      if (newestTs < Date.now() - SCAN_STALE_HOURS * 3600_000) {
        scanRefresh = "triggered";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SCAN_WAIT_MS);
        try {
          const scanRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/career-ops-scan`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ source: "orchestrator-stale-backstop" }),
            signal: controller.signal,
          });
          // A client-side abort leaves the accepted scan running server-side.
          scanRefresh = scanRes.ok ? "completed" : `http_${scanRes.status}`;
        } catch (scanError) {
          scanRefresh = scanError instanceof Error && scanError.name === "AbortError" ? "started_timeout" : "failed";
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      scanRefresh = "check_failed";
    }

    const ok = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({
      dispatched: ok,
      failed: results.length - ok,
      total_eligible: users.length,
      skipped_unentitled: candidates.length - users.length,
      scan_refresh: scanRefresh,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

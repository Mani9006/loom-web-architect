import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceKey);
    const { data: beats } = await service.from("mc_worker_heartbeats").select("last_seen").order("last_seen", { ascending: false }).limit(1);
    const last = beats?.[0]?.last_seen ? new Date(beats[0].last_seen).getTime() : 0;
    const { count } = await service
      .from("app_incidents")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", new Date(Date.now() - 3600_000).toISOString());

    const body = {
      ok: true,
      checked_at: new Date().toISOString(),
      supabase: "ok",
      stripe: Deno.env.get("STRIPE_SECRET_KEY") ? "configured" : "missing",
      email: Deno.env.get("RESEND_API_KEY") ? "configured" : "missing",
      worker: last && Date.now() - last < 15 * 60_000 ? "ok" : last ? "stale" : "missing",
      last_heartbeat: beats?.[0]?.last_seen || null,
      incidents_1h: count || 0,
    };

    const degraded = body.worker !== "ok" || (count || 0) >= 8;
    const webhook = Deno.env.get("ALERT_WEBHOOK_URL");
    if (degraded && webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `ResumePreps health degraded: worker=${body.worker} incidents_1h=${body.incidents_1h}` }),
      }).catch(() => undefined);
    }

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "health failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

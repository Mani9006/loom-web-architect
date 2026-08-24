/**
 * mc-ai-worker — drains My Collection's mc_ai_jobs queue for kinds that are
 * a single self-contained prompt (no tool use required).
 *
 * BoardTab and DiscoverTab's "Tailor to job" button enqueue a kind='tailor'
 * row and then wait (realtime + polling, see src/lib/mc-ai-jobs.ts) for it
 * to reach a terminal status. Nothing in this repo previously drained that
 * queue, so the row sat at status='queued' until the caller's 6-minute
 * client-side timeout fired — "Tailor to job" never actually worked.
 *
 * This function claims a small batch of queued kind='tailor' jobs (via the
 * claim_mc_ai_jobs RPC, FOR UPDATE SKIP LOCKED so concurrent invocations
 * never double-process a row), answers each with the existing chatFree()
 * router already used by every other AI edge function in this repo, and
 * writes the result back.
 *
 * kind='other' (DiscoverTab's agentic "find jobs" search) is intentionally
 * NOT claimed here — that prompt instructs the model to use Bash/WebSearch/
 * Task tool calls, which a single Messages API completion cannot fulfill.
 * It's left for the external agentic worker described in mc-ai-jobs.ts.
 *
 * Triggers:
 *   - Every minute via pg_cron (jobname: mc-ai-worker-1min)
 *   - Manual kick: POST with the service-role bearer
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatFree } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Kinds this worker can answer with a plain single-shot completion. Keep in
// sync with the "no tool use required" kinds in src/lib/mc-ai-jobs.ts.
const SUPPORTED_KINDS = ["tailor"];
const BATCH_SIZE = Number(Deno.env.get("MC_AI_WORKER_BATCH_SIZE") || 5);
const MAX_TOKENS = 4000;

interface McAiJob {
  id: string;
  kind: string;
  model: string;
  prompt: string;
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// "sonnet-4-6" / "haiku-4-5" (see src/lib/mc-ai-jobs.ts JobModel) map onto
// this repo's cheap/standard/hard tier router (supabase/functions/_shared/llm.ts).
function tierForModel(model: string): "cheap" | "standard" {
  return /haiku/i.test(model) ? "cheap" : "standard";
}

async function processJob(db: SupabaseClient, job: McAiJob): Promise<void> {
  try {
    const result = await chatFree(
      tierForModel(job.model),
      [
        {
          role: "system",
          content:
            "Follow the instructions in the user message exactly. Output only what is explicitly asked for, in the exact format requested, with no preamble, no commentary, and no markdown code fences around the final answer unless the instructions ask for one.",
        },
        { role: "user", content: job.prompt },
      ],
      { maxTokens: MAX_TOKENS, temperature: 0.3 },
    );

    const { error } = await db
      .from("mc_ai_jobs")
      .update({
        status: "done",
        result: result.text,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[mc-ai-worker] job ${job.id} failed:`, message);
    await db
      .from("mc_ai_jobs")
      .update({
        status: "failed",
        error: message.slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

async function runWorker() {
  const db = svc();
  const { data: claimed, error } = await db.rpc("claim_mc_ai_jobs", {
    p_kinds: SUPPORTED_KINDS,
    p_limit: BATCH_SIZE,
  });
  if (error) throw new Error(`claim_mc_ai_jobs: ${error.message}`);

  const jobs: McAiJob[] = (claimed ?? []) as McAiJob[];
  await Promise.all(jobs.map((job) => processJob(db, job)));
  return { claimed: jobs.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Same trusted-caller pattern as career-ops-scan / mc-gmail-poll: accept
    // the service-role credential the scheduler sends, or a verified admin
    // JWT for a manual kick. Merely sending an Authorization header is not
    // proof of identity.
    const authorization = req.headers.get("authorization") || "";
    const bearer = authorization.replace(/^Bearer\s+/i, "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    let authorized = Boolean(serviceRole && bearer === serviceRole);
    if (!authorized && bearer) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } },
      );
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: role } = await svc()
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        authorized = Boolean(role);
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = await runWorker();
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mc-ai-worker failed", e);
    return new Response(JSON.stringify({ error: "AI worker run failed." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

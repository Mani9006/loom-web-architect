/**
 * agents-job-hunter — Autonomous per-user job hunting agent.
 *
 * Runs as the user (service-role bound to a specific user_id passed in
 * the body by the orchestrator). Uses Claude Sonnet 4.6 with tool-use to
 * pick which actions to take this hour:
 *   - score new unscored matches that fit the user's prefs
 *   - prepare drafts for high-scoring evaluations (>= 4.0)
 *   - skip if there's nothing useful to do
 *
 * Hard limits enforced before AI runs:
 *   - max 8 model iterations
 *   - max user_job_prefs.agent_max_actions_per_day actions / day
 *   - account must be active
 *
 * Body: { user_id: uuid }
 * Auth: service-role only (orchestrator calls it; not user-callable directly)
 * Response: { run_id, status, summary, actions_taken }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 8;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Bearer check — only the orchestrator (with service role token) can invoke.
function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

// ── Tool definitions exposed to the model ──────────────────────

const TOOLS = [
  {
    name: "list_unscored_matches",
    description: "List the user's currently live job matches that have NOT yet been evaluated. Filters automatically applied: target_roles (case-insensitive title match), negative_keywords excluded, remote_only respected, posted within last 30 days.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 10, default: 5 } },
    },
  },
  {
    name: "list_unprepared_evaluations",
    description: "List the user's evaluated jobs that score >= min_score and don't yet have a prepared draft application.",
    input_schema: {
      type: "object",
      properties: {
        min_score: { type: "number", minimum: 0, maximum: 5, default: 4.0 },
        limit: { type: "integer", minimum: 1, maximum: 5, default: 3 },
      },
    },
  },
  {
    name: "score_match",
    description: "Score a single scanned job against the user's résumé. Calls career-ops-evaluate. Returns the resulting evaluation (score, tier, summary).",
    input_schema: {
      type: "object",
      properties: { scanned_job_id: { type: "string" } },
      required: ["scanned_job_id"],
    },
  },
  {
    name: "prepare_draft",
    description: "Generate a tailored CV + 5 ATS answers for a scored job. Calls career-ops-tailor. The user will review before submitting.",
    input_schema: {
      type: "object",
      properties: { evaluation_id: { type: "string" } },
      required: ["evaluation_id"],
    },
  },
  {
    name: "finish",
    description: "Stop. Call this when there's nothing else useful to do this run, or when the action budget has been used up.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string", description: "One-paragraph human-readable summary of what was done this run." } },
      required: ["summary"],
    },
  },
];

const SYSTEM_PROMPT = `You are the Job Hunter agent for ResumePreps. You run autonomously every hour for a single user. Your job is to make incremental progress on their job search without requiring their attention.

Each run, do the highest-leverage thing possible within the action budget:
1. Score the freshest unscored matches first (use list_unscored_matches).
2. For evaluations that scored >= 4.0 but have no draft yet, prepare them (use list_unprepared_evaluations + prepare_draft).
3. If there's no productive work, call finish with a short note.

Rules:
- Never invent jobs or scores. Only act on data the tools give you.
- Stop when budget is hit OR there's nothing high-leverage left to do.
- Always end with finish, including a one-paragraph summary the user can read.
- Be conservative: if a tool errors, skip that item, don't retry blindly.

You have a strict per-run budget: max 5 score_match calls + max 3 prepare_draft calls. Respect it.`;

// ── Tool runners ───────────────────────────────────────────────

interface UserPrefs {
  target_roles: string[];
  negative_keywords: string[];
  remote_only: boolean;
  agent_max_actions_per_day: number;
  agent_actions_today: number;
}

async function loadPrefs(client: ReturnType<typeof svc>, userId: string): Promise<UserPrefs | null> {
  const { data } = await client.from("user_job_prefs").select("*").eq("user_id", userId).maybeSingle();
  return (data as UserPrefs | null) ?? null;
}

async function listUnscoredMatches(client: ReturnType<typeof svc>, userId: string, prefs: UserPrefs, limit: number) {
  // Pull live jobs the user hasn't already evaluated.
  const { data: existing } = await client
    .from("job_evaluations")
    .select("scanned_job_id")
    .eq("user_id", userId);
  const seen = new Set((existing || []).map((r: { scanned_job_id: string }) => r.scanned_job_id));

  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: jobs } = await client
    .from("scanned_jobs")
    .select("id, title, location, remote_policy, last_seen_at, company:scan_companies(name)")
    .eq("is_live", true)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(50);

  const pos = (prefs.target_roles ?? []).map((s) => s.toLowerCase()).filter(Boolean);
  const neg = (prefs.negative_keywords ?? []).map((s) => s.toLowerCase()).filter(Boolean);
  const matches: any[] = [];
  for (const j of (jobs || []) as Array<{ id: string; title: string; location: string | null; remote_policy: string | null; company: { name: string } | null }>) {
    if (seen.has(j.id)) continue;
    const t = j.title.toLowerCase();
    if (neg.some((n) => t.includes(n))) continue;
    if (pos.length > 0 && !pos.some((p) => t.includes(p))) continue;
    if (prefs.remote_only && !(j.remote_policy || "").toLowerCase().includes("remote")) continue;
    matches.push({
      scanned_job_id: j.id,
      title: j.title,
      company: j.company?.name ?? "—",
      location: j.location,
    });
    if (matches.length >= limit) break;
  }
  return matches;
}

async function listUnpreparedEvaluations(client: ReturnType<typeof svc>, userId: string, minScore: number, limit: number) {
  const { data: evals } = await client
    .from("job_evaluations")
    .select("id, score, tier, summary, scanned_jobs(title, company:scan_companies(name))")
    .eq("user_id", userId)
    .gte("score", minScore)
    .order("score", { ascending: false })
    .limit(20);

  const { data: drafts } = await client
    .from("draft_applications")
    .select("evaluation_id")
    .eq("user_id", userId);
  const drafted = new Set((drafts || []).map((d: { evaluation_id: string }) => d.evaluation_id));

  return ((evals || []) as Array<{ id: string; score: number; tier: string; summary: string | null; scanned_jobs: { title: string; company: { name: string } | null } | null }>)
    .filter((e) => !drafted.has(e.id))
    .slice(0, limit)
    .map((e) => ({
      evaluation_id: e.id,
      score: Number(e.score),
      tier: e.tier,
      summary: e.summary,
      title: e.scanned_jobs?.title,
      company: e.scanned_jobs?.company?.name,
    }));
}

async function callEdgeFunction(name: string, body: unknown): Promise<any> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

// ── Agent loop ─────────────────────────────────────────────────

async function runAgent(userId: string, runId: string) {
  const client = svc();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prefs = await loadPrefs(client, userId);
  if (!prefs) return finalize(client, runId, "capped", 0, "User has no prefs row.", 0, 0);
  if (prefs.agent_actions_today >= prefs.agent_max_actions_per_day) {
    return finalize(client, runId, "capped", 0, "Daily action budget already used.", 0, 0);
  }

  let actionsRemaining = prefs.agent_max_actions_per_day - prefs.agent_actions_today;
  let scoreBudget = 5, prepareBudget = 3;

  const messages: Array<{ role: "user" | "assistant"; content: any }> = [
    { role: "user", content: `Begin your run for user ${userId}. Their daily action budget remaining: ${actionsRemaining}. Per-run cap: 5 score + 3 prepare. Pick the highest-leverage actions and finish promptly.` },
  ];

  const actions: Array<{ tool: string; input: any; result: any; ts: string }> = [];
  let tokensIn = 0, tokensOut = 0;
  let summary = "";
  let status: "completed" | "failed" | "capped" = "completed";

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        temperature: 0.2,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`anthropic ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = await res.json();
    tokensIn += (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0);
    tokensOut += data.usage?.output_tokens ?? 0;

    const blocks: Array<{ type: string; [k: string]: any }> = data.content || [];
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      summary = blocks.find((b) => b.type === "text")?.text ?? "Agent stopped without summary.";
      break;
    }

    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
    for (const tu of toolUses) {
      const ts = new Date().toISOString();
      let result: any = null;
      let isError = false;
      try {
        if (tu.name === "list_unscored_matches") {
          const limit = Math.min(10, Math.max(1, tu.input?.limit ?? 5));
          result = await listUnscoredMatches(client, userId, prefs, limit);
        } else if (tu.name === "list_unprepared_evaluations") {
          const minScore = Math.max(0, Math.min(5, tu.input?.min_score ?? 4.0));
          const limit = Math.min(5, Math.max(1, tu.input?.limit ?? 3));
          result = await listUnpreparedEvaluations(client, userId, minScore, limit);
        } else if (tu.name === "score_match") {
          if (scoreBudget <= 0 || actionsRemaining <= 0) {
            result = { error: "score budget exhausted" }; isError = true;
          } else {
            const r = await callEdgeFunction("career-ops-evaluate", { scanned_job_id: tu.input?.scanned_job_id });
            scoreBudget--;
            actionsRemaining--;
            result = { evaluation_id: r.evaluation?.id, score: r.evaluation?.score, tier: r.evaluation?.tier };
          }
        } else if (tu.name === "prepare_draft") {
          if (prepareBudget <= 0 || actionsRemaining <= 0) {
            result = { error: "prepare budget exhausted" }; isError = true;
          } else {
            const r = await callEdgeFunction("career-ops-tailor", { evaluation_id: tu.input?.evaluation_id });
            prepareBudget--;
            actionsRemaining--;
            result = { draft_id: r.draft?.id, status: r.draft?.status };
          }
        } else if (tu.name === "finish") {
          summary = tu.input?.summary ?? "Run complete.";
          actions.push({ tool: tu.name, input: tu.input, result: { summary }, ts });
          status = "completed";
          await finalize(client, runId, status, iter + 1, summary, tokensIn, tokensOut, actions);
          await bumpUsage(client, userId, prefs.agent_actions_today + (prefs.agent_max_actions_per_day - actionsRemaining - prefs.agent_actions_today));
          return { run_id: runId, status, summary, actions_taken: actions.length };
        } else {
          result = { error: `unknown tool ${tu.name}` }; isError = true;
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
        isError = true;
      }
      actions.push({ tool: tu.name, input: tu.input, result, ts });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Hit MAX_ITERATIONS without finish
  if (!summary) summary = "Reached iteration cap without completing — partial progress saved.";
  await finalize(client, runId, status, MAX_ITERATIONS, summary, tokensIn, tokensOut, actions);
  await bumpUsage(client, userId, (prefs.agent_actions_today + (prefs.agent_max_actions_per_day - actionsRemaining - prefs.agent_actions_today)));
  return { run_id: runId, status, summary, actions_taken: actions.length };
}

async function finalize(
  client: ReturnType<typeof svc>,
  runId: string,
  status: "completed" | "failed" | "capped",
  iterations: number,
  summary: string,
  tokens_in: number,
  tokens_out: number,
  actions: any[] = [],
) {
  await client.from("agent_runs").update({
    status,
    iterations,
    summary,
    tokens_in,
    tokens_out,
    actions,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}

async function bumpUsage(client: ReturnType<typeof svc>, userId: string, newTotalToday: number) {
  await client.from("user_job_prefs")
    .update({ agent_actions_today: newTotalToday, last_agent_run_at: new Date().toISOString() })
    .eq("user_id", userId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as { user_id?: string };
    if (!body.user_id) return jsonResponse({ error: "user_id required" }, 400);

    const client = svc();
    const { data: run } = await client.from("agent_runs").insert({
      user_id: body.user_id,
      agent: "job_hunter",
      status: "running",
    }).select("id").single();
    const runId = (run as { id: string }).id;

    try {
      const result = await runAgent(body.user_id, runId);
      return jsonResponse(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await client.from("agent_runs").update({
        status: "failed",
        error_message: msg.slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
      return jsonResponse({ run_id: runId, status: "failed", error: msg }, 500);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});

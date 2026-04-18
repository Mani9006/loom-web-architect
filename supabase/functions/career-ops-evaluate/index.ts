/**
 * career-ops-evaluate — A-F scored evaluation of a scanned job for a user.
 *
 * Ported logic from santifer/career-ops `modes/oferta.md` with schema adjusted
 * for multi-tenant SaaS: reads the user's primary resume + job description,
 * calls Claude Sonnet 4.6 with prompt caching, returns a structured evaluation.
 *
 * Request body:
 *   { scanned_job_id: uuid, force?: boolean }
 *
 * Response:
 *   { evaluation: { id, score, tier, summary, keyword_matches, gaps, star_stories, report_md } }
 *
 * Enterprise guards:
 *   - JWT verified; operation bound to auth.uid()
 *   - Daily cap per tier (free: 20 evaluations/day, pro: 200)
 *   - Short-circuit if evaluation already exists and !force
 *   - Never echoes API keys, tokens, or another tenant's data
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-5-20250929";
const FREE_DAILY_CAP = 20;
const PRO_DAILY_CAP = 200;
const MAX_DESCRIPTION_CHARS = 12_000;

interface EvaluationPayload {
  score: number;
  tier: "A" | "B" | "C" | "D" | "F";
  archetype: string;
  summary: string;
  keyword_matches: string[];
  gaps: string[];
  star_stories: Array<{ situation: string; task: string; action: string; result: string }>;
  report_md: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function userClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// ── Prompt construction ───────────────────────────────────────

const SYSTEM_PROMPT = `You are a career-ops evaluator. You score how well a candidate's resume fits a specific job posting on a 0.0–5.0 scale and produce a concise A-F tiered report.

Scoring dimensions (average them to produce the final score, rounded to 2 decimals):
  1. Role match      — does the title/scope match the candidate's experience?
  2. Skills match    — required hard + soft skills covered?
  3. Level fit       — seniority aligned (too junior → lower score)
  4. Domain fit      — industry / product area alignment
  5. Comp / location — realistic given stated or inferred range
  6. Growth / impact — does this role expand the candidate's range?

Tier thresholds: A >=4.5, B >=3.8, C >=3.0, D >=2.0, F <2.0

Return ONLY valid JSON matching this schema:
{
  "score": number (0-5, two decimals),
  "tier": "A" | "B" | "C" | "D" | "F",
  "archetype": string (one of: "Backend", "Frontend", "Fullstack", "ML", "Data", "PM", "Design", "DevOps", "Security", "SA", "Other"),
  "summary": string (one sentence, concrete),
  "keyword_matches": string[] (5-12 specific tech/skill terms from BOTH the JD and the resume),
  "gaps": string[] (3-8 specific things the resume does NOT demonstrate that the JD wants),
  "star_stories": [{situation, task, action, result}] (2-3 brief stories mined from the resume that address the JD's behavioral asks),
  "report_md": string (markdown report, 250-500 words, sections: "## Role summary", "## Match", "## Gaps", "## How to win this")
}
No preamble, no markdown fences, no code blocks — JSON only.`;

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildResumeText(resume: any): string {
  if (!resume) return "";
  const parts: string[] = [];
  if (resume.personal_info?.summary || resume.summary) parts.push("## Summary\n" + (resume.summary || resume.personal_info?.summary));
  if (Array.isArray(resume.experience)) {
    parts.push("## Experience");
    for (const x of resume.experience) {
      parts.push(`- ${x.title ?? ""} @ ${x.company ?? ""} (${x.start_date ?? ""} – ${x.end_date ?? "present"})`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets) parts.push(`  • ${b}`);
      else if (x.description) parts.push(`  • ${x.description}`);
    }
  }
  if (Array.isArray(resume.skills)) parts.push("## Skills\n" + resume.skills.map((s: any) => s.name || s).join(", "));
  if (Array.isArray(resume.projects)) {
    parts.push("## Projects");
    for (const p of resume.projects) parts.push(`- ${p.name ?? ""}: ${p.description ?? ""}`);
  }
  if (Array.isArray(resume.education)) {
    parts.push("## Education");
    for (const e of resume.education) parts.push(`- ${e.degree ?? ""} @ ${e.school ?? ""}`);
  }
  return parts.join("\n");
}

// ── Claude call with prompt caching ──────────────────────────

async function callClaude(resumeText: string, job: any, company: string): Promise<{ payload: EvaluationPayload; tokens_in: number; tokens_out: number; }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const body = {
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.2,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Candidate resume (cached):\n\n${resumeText}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content:
          `Evaluate this job for the candidate above.\n\n` +
          `Company: ${company}\n` +
          `Title: ${job.title}\n` +
          `Location: ${job.location ?? "n/a"}\n` +
          `Compensation: ${job.compensation_text ?? "not disclosed"}\n\n` +
          `Job description:\n${truncate(job.description_md, MAX_DESCRIPTION_CHARS)}`,
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`anthropic ${res.status}: ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const tokens_in = (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0);
  const tokens_out = data.usage?.output_tokens ?? 0;

  // Trim any stray markdown fences or preamble just in case.
  const jsonText = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: EvaluationPayload;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`model returned non-JSON: ${jsonText.slice(0, 200)}`);
  }
  return { payload: parsed, tokens_in, tokens_out };
}

// ── Handler ───────────────────────────────────────────────────

async function evaluateForUser(userId: string, scannedJobId: string, force: boolean) {
  const svc = serviceClient();

  // If cached evaluation exists and !force, return it.
  if (!force) {
    const { data: existing } = await svc
      .from("job_evaluations")
      .select("*")
      .eq("user_id", userId)
      .eq("scanned_job_id", scannedJobId)
      .maybeSingle();
    if (existing) return { evaluation: existing, cached: true };
  }

  // Determine plan cap.
  const { data: access } = await svc
    .from("user_access_controls")
    .select("subscription_plan, ai_features_enabled, account_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (access && access.account_status !== "active") {
    throw new Error("account not active");
  }
  const isPro = (access?.subscription_plan && access.subscription_plan !== "free") || false;
  const dailyCap = isPro ? PRO_DAILY_CAP : FREE_DAILY_CAP;

  const { data: usage } = await svc
    .from("ai_usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", new Date().toISOString().slice(0, 10))
    .eq("kind", "evaluation")
    .maybeSingle();
  if ((usage?.count ?? 0) >= dailyCap) {
    const err = new Error(`daily evaluation cap reached (${dailyCap}). Upgrade for more.`);
    (err as any).status = 429;
    throw err;
  }

  // Load scanned job + resume.
  const { data: job, error: jobErr } = await svc
    .from("scanned_jobs")
    .select("*, company:scan_companies(name)")
    .eq("id", scannedJobId)
    .maybeSingle();
  if (jobErr || !job) throw new Error("job not found");

  const { data: resumes } = await svc
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  const resume = resumes?.[0];
  if (!resume) {
    const err = new Error("user has no resume yet — upload or create one first");
    (err as any).status = 412;
    throw err;
  }

  const resumeText = buildResumeText(resume);
  if (!resumeText || resumeText.length < 120) {
    const err = new Error("resume is too thin to evaluate — please flesh it out");
    (err as any).status = 412;
    throw err;
  }

  const companyName = (job as any).company?.name ?? "the company";
  const { payload, tokens_in, tokens_out } = await callClaude(resumeText, job, companyName);

  // Write evaluation (upsert).
  const row = {
    user_id: userId,
    scanned_job_id: scannedJobId,
    resume_id: resume.id,
    score: payload.score,
    archetype: payload.archetype,
    tier: payload.tier,
    summary: payload.summary,
    keyword_matches: payload.keyword_matches ?? [],
    gaps: payload.gaps ?? [],
    star_stories: payload.star_stories ?? [],
    report_md: payload.report_md,
    model: MODEL,
    tokens_in,
    tokens_out,
    evaluated_at: new Date().toISOString(),
  };

  const { data: saved, error: saveErr } = await svc
    .from("job_evaluations")
    .upsert(row, { onConflict: "user_id,scanned_job_id" })
    .select()
    .single();
  if (saveErr) throw new Error(`save: ${saveErr.message}`);

  await svc.rpc("increment_ai_usage", {
    p_user_id: userId,
    p_kind: "evaluation",
    p_tokens_in: tokens_in,
    p_tokens_out: tokens_out,
  });

  return { evaluation: saved, cached: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = userClient(req);
    const { data: userRes } = await auth.auth.getUser();
    const user = userRes?.user;
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as { scanned_job_id?: string; force?: boolean };
    if (!body.scanned_job_id) return jsonResponse({ error: "scanned_job_id required" }, 400);

    const result = await evaluateForUser(user.id, body.scanned_job_id, Boolean(body.force));
    return jsonResponse(result);
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, status);
  }
});

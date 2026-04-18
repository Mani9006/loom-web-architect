/**
 * career-ops-tailor — Tailored CV + draft answers for a scored job.
 *
 * Given a job_evaluation_id, this function:
 *   1. Loads the user's base resume + the job evaluation + scanned job
 *   2. Calls Claude Sonnet 4.5 with prompt caching to produce:
 *        - A tailored resume (JSONB mirroring `resumes` schema,
 *          with bullets rewritten to emphasise the job's ask)
 *        - A short cover note
 *        - Draft answers for 5 common ATS form questions
 *   3. Writes to `draft_applications` (upsert on user_id+evaluation_id),
 *      creates a `resumes` row for the tailored CV, and increments
 *      `ai_usage_daily.kind='tailor'`
 *
 * Enterprise guards:
 *   - JWT-bound via auth.uid(); no cross-tenant access
 *   - Daily cap: free=10 tailors/day, pro=100
 *   - Accepts { evaluation_id } in body; evaluation must belong to caller
 *   - Never returns another tenant's resume or job data
 *   - Never logs prompt text
 *   - Structured error codes: 401/412/429/500
 *
 * Cost: prompt caching makes the resume + system prompt ~$0.003/call at
 * Sonnet 4.5 pricing (input=cached). 10,000 users × 5 tailors/day = ~$150/day.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-5-20250929";
const FREE_DAILY_CAP = 10;
const PRO_DAILY_CAP = 100;
const MAX_DESC_CHARS = 10_000;

interface TailorPayload {
  tailored_resume: {
    summary: string;
    experience: Array<{
      title: string;
      company: string;
      start_date?: string;
      end_date?: string;
      bullets: string[];
    }>;
    skills: string[];
    projects?: Array<{ name: string; description: string }>;
  };
  cover_note: string;
  answers: Array<{ question: string; answer: string }>;
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

const SYSTEM_PROMPT = `You are a senior résumé editor and application coach. Given a candidate's base resume and a specific job posting, produce:

1. A tailored resume (JSON) — keep ALL facts truthful (never invent roles, skills, dates, or numbers), but reorder bullets and rewrite phrasing to foreground what the job wants. Start each bullet with a strong verb, quantify when the source bullet had a number, omit irrelevant bullets.
2. A one-paragraph cover note (3-4 sentences, "I'm choosing you" tone, specific proof points from the resume, no fluff).
3. Draft answers for five standard ATS questions:
   a. "Why are you interested in this role?"
   b. "Why do you want to work at {company}?"
   c. "Tell us about a relevant project or achievement."
   d. "What makes you a good fit for this position?"
   e. "When can you start? / Work authorization"

Rules:
- Never fabricate experience the resume doesn't support.
- Keep each answer under 120 words; 2-4 sentences.
- Reference something specific from the JD in every answer.
- Return ONLY valid JSON, no markdown fences, no preamble. Schema:
{
  "tailored_resume": {
    "summary": string,
    "experience": [{"title","company","start_date","end_date","bullets": string[]}],
    "skills": string[],
    "projects": [{"name","description"}]
  },
  "cover_note": string,
  "answers": [{"question","answer"}, ...]
}`;

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildResumePrompt(resume: any): string {
  const parts: string[] = [];
  if (resume.personal_info?.name) parts.push(`Name: ${resume.personal_info.name}`);
  if (resume.summary || resume.personal_info?.summary) parts.push(`Summary: ${resume.summary || resume.personal_info.summary}`);
  if (Array.isArray(resume.experience)) {
    parts.push("## Experience");
    for (const x of resume.experience) {
      parts.push(`- ${x.title ?? ""} @ ${x.company ?? ""} (${x.start_date ?? ""}–${x.end_date ?? "present"})`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets) parts.push(`  • ${b}`);
      else if (x.description) parts.push(`  • ${x.description}`);
    }
  }
  if (Array.isArray(resume.skills)) parts.push("## Skills\n" + resume.skills.map((s: any) => s?.name || s).join(", "));
  if (Array.isArray(resume.projects)) {
    parts.push("## Projects");
    for (const p of resume.projects) parts.push(`- ${p.name}: ${p.description}`);
  }
  return parts.join("\n");
}

async function callClaude(resumeText: string, job: any, company: string, evaluationHints: any): Promise<{ payload: TailorPayload; tokens_in: number; tokens_out: number }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const body = {
    model: MODEL,
    max_tokens: 3500,
    temperature: 0.3,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Candidate resume (cached):\n\n${resumeText}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content:
          `Company: ${company}\n` +
          `Title: ${job.title}\n` +
          `Location: ${job.location ?? "n/a"}\n` +
          `Compensation: ${job.compensation_text ?? "not disclosed"}\n\n` +
          `JD:\n${truncate(job.description_md, MAX_DESC_CHARS)}\n\n` +
          `Prior evaluation notes — strengths: ${(evaluationHints.keyword_matches || []).join(", ")}. ` +
          `Gaps: ${(evaluationHints.gaps || []).join(", ")}.`,
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

  const jsonText = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: TailorPayload;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`model returned non-JSON: ${jsonText.slice(0, 200)}`);
  }
  return { payload: parsed, tokens_in, tokens_out };
}

function renderMarkdown(tailored: TailorPayload["tailored_resume"], name: string): string {
  const lines: string[] = [];
  lines.push(`# ${name}`);
  if (tailored.summary) { lines.push("", "## Summary", tailored.summary); }
  if (tailored.experience?.length) {
    lines.push("", "## Experience");
    for (const x of tailored.experience) {
      lines.push(`\n**${x.title}** — ${x.company}  `);
      lines.push(`_${x.start_date ?? ""} – ${x.end_date ?? "present"}_`);
      for (const b of x.bullets) lines.push(`- ${b}`);
    }
  }
  if (tailored.skills?.length) { lines.push("", "## Skills", tailored.skills.join(" · ")); }
  if (tailored.projects?.length) {
    lines.push("", "## Projects");
    for (const p of tailored.projects) lines.push(`- **${p.name}** — ${p.description}`);
  }
  return lines.join("\n");
}

async function tailorForUser(userId: string, evaluationId: string) {
  const svc = serviceClient();

  // Load evaluation (must belong to user)
  const { data: evaluation, error: evalErr } = await svc
    .from("job_evaluations")
    .select("id,user_id,scanned_job_id,keyword_matches,gaps,resume_id")
    .eq("id", evaluationId)
    .maybeSingle();
  if (evalErr || !evaluation) throw new Error("evaluation not found");
  if (evaluation.user_id !== userId) {
    const e = new Error("forbidden"); (e as any).status = 403; throw e;
  }

  // Daily cap
  const { data: access } = await svc
    .from("user_access_controls")
    .select("subscription_plan, account_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (access && access.account_status !== "active") {
    const e = new Error("account not active"); (e as any).status = 402; throw e;
  }
  const isPro = !!(access?.subscription_plan && access.subscription_plan !== "free");
  const cap = isPro ? PRO_DAILY_CAP : FREE_DAILY_CAP;
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await svc
    .from("ai_usage_daily")
    .select("count").eq("user_id", userId).eq("day", today).eq("kind", "tailor")
    .maybeSingle();
  if ((usage?.count ?? 0) >= cap) {
    const e = new Error(`daily tailor cap reached (${cap}). Upgrade for more.`); (e as any).status = 429; throw e;
  }

  // Load job + base resume
  const { data: job, error: jobErr } = await svc
    .from("scanned_jobs")
    .select("id,title,location,compensation_text,description_md,apply_url,company:scan_companies(name)")
    .eq("id", evaluation.scanned_job_id)
    .maybeSingle();
  if (jobErr || !job) throw new Error("job not found");

  const { data: resume, error: resumeErr } = await svc
    .from("resumes")
    .select("*")
    .eq("id", evaluation.resume_id)
    .maybeSingle();
  const baseResume = resume || (await (async () => {
    const { data } = await svc
      .from("resumes").select("*").eq("user_id", userId)
      .order("updated_at", { ascending: false }).limit(1);
    return data?.[0];
  })());
  if (resumeErr || !baseResume) {
    const e = new Error("no resume found for user"); (e as any).status = 412; throw e;
  }

  // Invoke Claude
  const companyName = (job as any).company?.name ?? "the company";
  const resumeText = buildResumePrompt(baseResume);
  const { payload, tokens_in, tokens_out } = await callClaude(
    resumeText, job, companyName, evaluation,
  );

  // Persist a child resume row (reuses existing resumes schema → printable + searchable)
  const childTitle = `${baseResume.title || "Resume"} — ${companyName} ${job.title}`.slice(0, 120);
  const { data: childResume, error: childErr } = await svc
    .from("resumes")
    .insert({
      user_id: userId,
      title: childTitle,
      personal_info: baseResume.personal_info,
      summary: payload.tailored_resume.summary,
      experience: payload.tailored_resume.experience,
      education: baseResume.education || [],
      skills: payload.tailored_resume.skills?.map((s) => ({ name: s })) || baseResume.skills,
      projects: payload.tailored_resume.projects || baseResume.projects || [],
      certifications: baseResume.certifications || [],
      languages: baseResume.languages || [],
      template: baseResume.template || "default",
    })
    .select("id")
    .single();
  if (childErr) throw new Error(`save tailored resume: ${childErr.message}`);

  const name = (baseResume as any).personal_info?.name || "Candidate";
  const tailored_cv_md = renderMarkdown(payload.tailored_resume, name);

  // Upsert draft_applications
  const { data: draft, error: draftErr } = await svc
    .from("draft_applications")
    .upsert({
      user_id: userId,
      evaluation_id: evaluationId,
      tailored_resume_id: (childResume as any).id,
      tailored_cv_md,
      answers: [
        ...payload.answers,
        { question: "Cover note", answer: payload.cover_note },
      ],
      status: "ready",
    }, { onConflict: "user_id,evaluation_id" })
    .select()
    .single();
  if (draftErr) throw new Error(`save draft: ${draftErr.message}`);

  await svc.rpc("increment_ai_usage", {
    p_user_id: userId, p_kind: "tailor",
    p_tokens_in: tokens_in, p_tokens_out: tokens_out,
  });

  return { draft };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = userClient(req);
    const { data: userRes } = await auth.auth.getUser();
    const user = userRes?.user;
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as { evaluation_id?: string };
    if (!body.evaluation_id) return jsonResponse({ error: "evaluation_id required" }, 400);

    const result = await tailorForUser(user.id, body.evaluation_id);
    return jsonResponse(result);
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, status);
  }
});

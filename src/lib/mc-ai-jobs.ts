// ─────────────────────────────────────────────────────────────────────────────
// mc-ai-jobs.ts — frontend helper for the local-Claude job queue.
//
// The website never calls Anthropic API directly. Instead it inserts a row
// into mc_ai_jobs (Supabase). The user's Mac mini runs a worker that picks
// up queued jobs, runs `claude -p` locally using their Max plan, and writes
// the result back. This file gives the frontend a clean async API on top.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

export type JobKind =
  | "tailor"
  | "score_job"
  | "classify_email"
  | "company_research"
  | "rewrite_line"
  | "test"
  | "other";

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

// We deliberately exclude opus from the supported set — Sonnet 4.6 is the
// cap for cost reasons. Haiku 4.5 is the default for cheap operations.
export type JobModel = "haiku-4-5" | "sonnet-4-6";

/**
 * Pick the right model for a task by default. Sonnet = orchestrator and
 * heavy synthesis (full-document tailoring, multi-step job search).
 * Haiku = everything else (single-line rewrites, classification, scoring,
 * company research, simple summarization). This is wired so the
 * frontend doesn't have to think about model choice — the queue helper
 * applies a sensible default per JobKind.
 */
const DEFAULT_MODEL_FOR_KIND: Record<JobKind, JobModel> = {
  tailor: "sonnet-4-6",          // outputs a full resume — complex
  score_job: "haiku-4-5",        // single fit score — cheap
  classify_email: "haiku-4-5",   // categorize one email — cheap
  rewrite_line: "haiku-4-5",     // tighten one bullet — cheap
  company_research: "haiku-4-5", // produce a brief — cheap
  test: "haiku-4-5",
  other: "sonnet-4-6",           // catchall: assume non-trivial
};

export function defaultModelFor(kind: JobKind): JobModel {
  return DEFAULT_MODEL_FOR_KIND[kind] ?? "haiku-4-5";
}

export interface AIJob {
  id: string;
  user_id: string;
  session_id: string | null;
  kind: JobKind;
  status: JobStatus;
  model: JobModel | string;
  prompt: string;
  input: unknown;
  result: string | null;
  result_json: unknown;
  error: string | null;
  attempts: number;
  priority: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface EnqueueArgs {
  kind: JobKind;
  prompt: string;
  model?: JobModel;
  sessionId?: string | null;
  input?: unknown;
  priority?: number;
}

export interface EnqueueResult {
  jobId: string;
}

/**
 * Insert a job into the queue. Returns the jobId — the worker on the user's
 * Mac will pick it up within ~3 seconds.
 */
export async function enqueueJob(args: EnqueueArgs): Promise<EnqueueResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("Not signed in. Please refresh and try again.");
  }

  const payload = {
    user_id: userData.user.id,
    session_id: args.sessionId ?? null,
    kind: args.kind,
    // Use the explicit model if caller asked for one; otherwise pick
    // Haiku/Sonnet per the task-kind map (no Opus, ever).
    model: args.model ?? defaultModelFor(args.kind),
    prompt: args.prompt,
    input: args.input ?? null,
    priority: args.priority ?? 5,
    status: "queued" as const,
  };

  const { data, error } = await (supabase as any)
    .from("mc_ai_jobs")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Couldn't enqueue job: ${error?.message ?? "unknown error"}`);
  }
  return { jobId: data.id };
}

/**
 * Wait for a job to reach a terminal state (done | failed | canceled).
 * Uses Supabase realtime first, falls back to polling. Returns the final row.
 *
 * Throws on failure or timeout (default 5 minutes).
 */
export async function waitForJob(
  jobId: string,
  opts: { timeoutMs?: number; onProgress?: (status: JobStatus) => void } = {}
): Promise<AIJob> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();

  // First, check if it's already done.
  const initial = await fetchJob(jobId);
  if (!initial) throw new Error("Job not found");
  opts.onProgress?.(initial.status);
  if (initial.status === "done") return initial;
  if (initial.status === "failed") throw new Error(initial.error || "Job failed");
  if (initial.status === "canceled") throw new Error("Job was canceled");

  // Subscribe to changes on this row via realtime.
  return new Promise<AIJob>((resolve, reject) => {
    let resolved = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const finish = (job: AIJob | null, err?: Error) => {
      if (resolved) return;
      resolved = true;
      if (pollHandle) clearInterval(pollHandle);
      try {
        channel.unsubscribe();
      } catch { /* Realtime cleanup is best-effort. */ }
      if (err) reject(err);
      else if (job) resolve(job);
      else reject(new Error("Job vanished"));
    };

    const channel = supabase
      .channel(`mc_ai_job_${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "mc_ai_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload: any) => {
          const row = payload.new as AIJob;
          opts.onProgress?.(row.status);
          if (row.status === "done") finish(row);
          else if (row.status === "failed") finish(null, new Error(row.error || "Job failed"));
          else if (row.status === "canceled") finish(null, new Error("Job canceled"));
        }
      )
      .subscribe();

    // Belt-and-suspenders polling in case realtime drops.
    pollHandle = setInterval(async () => {
      if (Date.now() - start > timeoutMs) {
        finish(null, new Error("Timed out waiting for AI to respond. Please try again in a moment."));
        return;
      }
      try {
        const row = await fetchJob(jobId);
        if (!row) return;
        opts.onProgress?.(row.status);
        if (row.status === "done") finish(row);
        else if (row.status === "failed") finish(null, new Error(row.error || "Job failed"));
        else if (row.status === "canceled") finish(null, new Error("Job canceled"));
      } catch { /* The next polling cycle can recover from a transient read. */ }
    }, 4000);
  });
}

async function fetchJob(jobId: string): Promise<AIJob | null> {
  const { data, error } = await (supabase as any)
    .from("mc_ai_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AIJob) ?? null;
}

/**
 * One-shot helper: enqueue a job and return the result string when done.
 * Throws on error/timeout.
 */
export async function runOnLocalWorker(
  args: EnqueueArgs & { timeoutMs?: number; onProgress?: (status: JobStatus) => void }
): Promise<{ result: string; resultJson: unknown; jobId: string }> {
  const { jobId } = await enqueueJob(args);
  const job = await waitForJob(jobId, {
    timeoutMs: args.timeoutMs,
    onProgress: args.onProgress,
  });
  return {
    jobId,
    result: job.result ?? "",
    resultJson: job.result_json,
  };
}

/**
 * Converts a row from the `resumes` table (Resume Builder schema) into a
 * single markdown string the AI tailor can read.
 *
 * The `resumes` table doesn't have one big "content" column — it stores the
 * resume as a set of JSON columns: personal_info, summary, experience,
 * education, skills, projects, certifications, languages, section_order.
 * This helper stitches them back into well-formed markdown.
 */
export function resumeRowToMarkdown(row: any): string {
  if (!row) return "";
  const parts: string[] = [];

  const h = row.personal_info ?? {};
  if (h.name) parts.push(`# ${h.name}`);
  const contact = [h.email, h.phone, h.location, h.linkedin].filter(Boolean).join(" · ");
  if (contact) parts.push(contact);

  if (row.summary) {
    parts.push("## Summary", String(row.summary).trim());
  }

  if (Array.isArray(row.experience) && row.experience.length) {
    parts.push("## Experience");
    for (const e of row.experience) {
      const head = `**${e.role ?? ""}**${e.company_or_client ? ` — ${e.company_or_client}` : ""}`;
      const datesParts = [e.start_date, e.end_date].filter(Boolean);
      const meta = [datesParts.join(" – "), e.location].filter(Boolean).join(" · ");
      parts.push(`${head}${meta ? `  \n${meta}` : ""}`);
      if (Array.isArray(e.bullets)) {
        for (const b of e.bullets) parts.push(`- ${b}`);
      }
    }
  }

  if (Array.isArray(row.education) && row.education.length) {
    parts.push("## Education");
    for (const ed of row.education) {
      const head = `**${ed.degree ?? ""}${ed.field ? ` in ${ed.field}` : ""}**${ed.institution ? ` — ${ed.institution}` : ""}`;
      const meta = [ed.graduation_date, ed.location, ed.gpa ? `GPA ${ed.gpa}` : ""].filter(Boolean).join(" · ");
      parts.push(`${head}${meta ? `  \n${meta}` : ""}`);
    }
  }

  if (row.skills && typeof row.skills === "object" && Object.keys(row.skills).length) {
    parts.push("## Skills");
    for (const [cat, vals] of Object.entries(row.skills)) {
      const list = Array.isArray(vals) ? (vals as string[]).join(", ") : String(vals);
      if (!list) continue;
      const label = cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      parts.push(`**${label}:** ${list}`);
    }
  }

  if (Array.isArray(row.projects) && row.projects.length) {
    parts.push("## Projects");
    for (const p of row.projects) {
      const head = `**${p.title ?? ""}**${p.organization ? ` — ${p.organization}` : ""}${p.date ? ` (${p.date})` : ""}`;
      parts.push(head);
      if (Array.isArray(p.bullets)) for (const b of p.bullets) parts.push(`- ${b}`);
    }
  }

  if (Array.isArray(row.certifications) && row.certifications.length) {
    parts.push("## Certifications");
    for (const c of row.certifications) {
      parts.push(
        `- ${c.name ?? ""}${c.issuer ? ` — ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`,
      );
    }
  }

  if (Array.isArray(row.languages) && row.languages.length) {
    parts.push("## Languages");
    for (const l of row.languages) {
      parts.push(`- ${l.language ?? ""}${l.proficiency ? ` (${l.proficiency})` : ""}`);
    }
  }

  return parts.join("\n\n").trim();
}

/**
 * Returns true if the user has a worker that has heartbeat'd in the last
 * 90 seconds. Used by the WorkerStatusBadge.
 */
export async function isWorkerOnline(userId: string): Promise<{
  online: boolean;
  lastSeen: string | null;
  hostname: string | null;
}> {
  const { data, error } = await (supabase as any)
    .from("mc_worker_heartbeats")
    .select("last_seen,hostname")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { online: false, lastSeen: null, hostname: null };
  const ageMs = Date.now() - new Date(data.last_seen).getTime();
  return {
    online: ageMs < 90 * 1000,
    lastSeen: data.last_seen,
    hostname: data.hostname,
  };
}

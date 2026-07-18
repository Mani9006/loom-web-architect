/**
 * User-initiated application intake.
 * Registers a searched job, scores it against the full resume story, creates a
 * truthful tailored packet, runs ATS checks, and queues supported portals.
 * Unsupported portals stop at "ready" with the direct application link.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  getAuthedUser,
  HttpError,
  jsonResponse,
  serviceClient,
  withErrorHandler,
} from "../_shared/guards.ts";

interface IntakeBody {
  title?: string;
  company?: string;
  location?: string | null;
  description?: string | null;
  apply_url?: string | null;
  source?: string | null;
  queue_if_supported?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({})) as IntakeBody;
    const title = clean(body.title, 240);
    const companyName = clean(body.company, 180);
    const applyUrl = safeUrl(body.apply_url);
    if (!title || !companyName || !applyUrl) throw new HttpError(400, "Job title, company, and direct link are required");

    const portal = detectPortal(applyUrl);
    const companySlug = `intake-${slug(companyName)}-${(await shortHash(companyName.toLowerCase())).slice(0, 8)}`;
    const db = serviceClient();
    const { data: company, error: companyError } = await db.from("scan_companies").upsert({
      slug: companySlug,
      name: companyName,
      api_type: portal.type,
      api_identifier: portal.identifier || `manual-${companySlug}`,
      careers_url: new URL(applyUrl).origin,
      category: portal.supported ? "Application queue" : "Manual application",
      enabled: false,
      last_scanned_at: new Date().toISOString(),
    }, { onConflict: "slug" }).select("id").single();
    if (companyError || !company) throw new HttpError(500, "The application could not be prepared");

    const externalId = `intake-${await shortHash(applyUrl)}`;
    const { data: job, error: jobError } = await db.from("scanned_jobs").upsert({
      company_id: company.id,
      external_id: externalId,
      title,
      location: clean(body.location, 180) || null,
      description_md: clean(body.description, 24_000) || null,
      apply_url: applyUrl,
      remote_policy: /remote/i.test(`${body.location || ""} ${body.description || ""}`) ? "remote" : null,
      employment_type: null,
      posted_at: null,
      last_seen_at: new Date().toISOString(),
      is_live: true,
      raw: { source: clean(body.source, 80) || "job_search", user_initiated: true },
    }, { onConflict: "company_id,external_id" }).select("id").single();
    if (jobError || !job) throw new HttpError(500, "The application could not be prepared");

    const authorization = req.headers.get("authorization") || "";
    try {
      const evaluationResult = await callAsUser("career-ops-evaluate", authorization, {
        scanned_job_id: job.id,
        force: true,
      });
      const evaluation = asRecord(evaluationResult.evaluation);
      if (!evaluation.id) throw new Error("evaluation_missing");

      const tailorResult = await callAsUser("career-ops-tailor", authorization, {
        evaluation_id: evaluation.id,
        allow_outside_preferences: true,
      });
      const draft = asRecord(tailorResult.draft);
      if (!draft.id) throw new Error("draft_missing");

      let atsScore: number | null = null;
      if (draft.tailored_resume_id) {
        try {
          const atsResult = await callAsUser("career-ops-ats", authorization, {
            resume_id: draft.tailored_resume_id,
            scanned_job_id: job.id,
          });
          atsScore = Number(asRecord(atsResult.ats).overall ?? 0) || null;
        } catch (error) {
          console.error("career-ops-one-click ATS", error);
        }
      }

      let status = "ready";
      let queueNotice: string | null = null;
      if (body.queue_if_supported && portal.supported && portal.type === "greenhouse") {
        try {
          const submitResult = await callAsUser("career-ops-submit", authorization, {
            draft_application_id: draft.id,
          });
          status = asRecord(submitResult.task).status === "pending" ? "queued" : "ready";
        } catch (error) {
          // A portal/policy/entitlement failure must not discard the tailored
          // packet that was already created successfully. The review screen can
          // explain the next safe action without exposing provider internals.
          console.error("career-ops-one-click queue", error);
          queueNotice = "The application packet is ready for review, but automatic submission is not available for this job or current policy.";
        }
      }

      return jsonResponse({
        status,
        draft_id: draft.id,
        evaluation_id: evaluation.id,
        fit_score: evaluation.fit_score,
        ats_score: atsScore,
        direct_apply_url: applyUrl,
        needs_user_action: status !== "queued",
        queue_notice: queueNotice,
      });
    } catch (error) {
      console.error("career-ops-one-click workflow", error);
      const message = error instanceof Error ? error.message : String(error);
      if (/no resume|source resume|412/i.test(message)) {
        throw new HttpError(412, "Add a source resume before preparing an application");
      }
      throw new HttpError(500, "The application packet could not be prepared right now");
    }
  });
});

async function callAsUser(name: string, authorization: string, body: Record<string, unknown>) {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}_${response.status}:${text.slice(0, 220)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

function detectPortal(value: string): { type: "greenhouse" | "ashby" | "lever"; identifier: string; supported: boolean } {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  if (/greenhouse\.io$/i.test(url.hostname)) {
    const boardsIndex = parts.findIndex((part) => ["boards", "job-boards"].includes(part));
    return { type: "greenhouse", identifier: parts[boardsIndex + 1] || parts[0] || "unknown", supported: true };
  }
  if (/ashbyhq\.com$/i.test(url.hostname)) return { type: "ashby", identifier: parts[0] || "unknown", supported: false };
  if (/lever\.co$/i.test(url.hostname)) return { type: "lever", identifier: parts[0] || "unknown", supported: false };
  return { type: "lever", identifier: "manual", supported: false };
}

function clean(value: unknown, max: number): string {
  return typeof value === "string"
    ? Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    }).join("").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function safeUrl(value: unknown): string {
  const text = clean(value, 2000);
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "company";
}

async function shortHash(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

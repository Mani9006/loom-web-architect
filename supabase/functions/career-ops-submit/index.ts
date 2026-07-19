/**
 * career-ops-submit — Opt-in supported-portal auto-submit.
 *
 * Takes a `draft_application_id`, verifies:
 *   - Draft belongs to caller (RLS-bound + service-role re-check)
 *   - User has user_job_prefs.auto_apply_enabled = true
 *   - The job portal is enabled in user_job_prefs.auto_apply_portals
 *   - Today's submissions < user_job_prefs.daily_apply_cap
 *   - Draft status = 'ready' (not already submitted / failed)
 *   - scanned_jobs.company.api_type is a guarded simple-form adapter
 *
 * Then enqueues a task into the existing `applypass_tasks` queue so the
 * existing worker infrastructure can process it asynchronously. This keeps
 * the edge function fast and lets you scale submission throughput via more
 * workers rather than more edge-function concurrency.
 *
 * CRITICAL ENTERPRISE GUARDS:
 *   - The edge function NEVER submits directly — it only queues.
 *   - The worker is responsible for the actual HTTP submission. See
 *     supabase/functions/applypass-browser-session/index.ts + the
 *     career-ops-greenhouse payload type below.
 *   - Workday / Oracle / iCIMS multi-page flows remain review-only until a
 *     dedicated adapter has receipt-level integration tests.
 *   - `daily_apply_cap` is enforced at enqueue time (optimistic counting
 *     from `applications` + today's `applypass_tasks` with status=running).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceAutoApplyEntitlement,
  enforceMonthlyAutoApplyExecutionCap,
  getAuthedUserOrService,
} from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitPayload {
  draft_application_id: string;
  user_id?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function answersToMemory(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  const entries = value.flatMap((item) => {
    const answer = asRecord(item);
    const question = asString(answer.question);
    const response = asString(answer.answer);
    return question && response ? [[question, response] as const] : [];
  });
  return Object.fromEntries(entries);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function enqueueSubmit(userId: string, draftId: string) {
  const svc = serviceClient();

  // Load draft + evaluation + job + company
  const { data: draft, error: draftErr } = await svc
    .from("draft_applications")
    .select(`id, user_id, evaluation_id, tailored_resume_id, tailored_cv_md, tailored_cv_pdf_url, answers, status,
      evaluation:job_evaluations(
        scanned_job:scanned_jobs(
          id, title, apply_url, external_id,
          company:scan_companies(slug, name, api_type, api_identifier)
        )
      )`)
    .eq("id", draftId)
    .maybeSingle();
  if (draftErr || !draft) throw new Error("draft not found");
  if (draft.user_id !== userId) {
    const e = new Error("forbidden"); (e as any).status = 403; throw e;
  }
  if (!["ready", "failed"].includes(draft.status)) {
    const e = new Error(`draft not in submittable state (${draft.status})`); (e as any).status = 409; throw e;
  }

  const job = (draft as any).evaluation?.scanned_job;
  const company = job?.company;
  if (!job || !company) throw new Error("associated job missing");
  const portal = asString(company.api_type).toLowerCase();
  const supportedPortals = new Set(["greenhouse", "ashby", "lever"]);
  if (!supportedPortals.has(portal)) {
    const e = new Error("This employer portal still needs review before submission.");
    (e as any).status = 422; throw e;
  }

  // Load prefs
  const { data: prefs } = await svc
    .from("user_job_prefs")
    .select("auto_apply_enabled, auto_apply_portals, daily_apply_cap")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prefs?.auto_apply_enabled) {
    const e = new Error("auto-apply is not enabled in your preferences"); (e as any).status = 403; throw e;
  }
  if (!prefs.auto_apply_portals?.includes(portal)) {
    const e = new Error("This employer portal is not enabled in your application rules."); (e as any).status = 403; throw e;
  }

  // Daily cap: count today's applypass_tasks for this user with career_ops_submit task_type
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count: todaysCount } = await svc
    .from("applypass_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("task_type", "career_ops_submit")
    .gte("created_at", todayStart.toISOString());
  if ((todaysCount ?? 0) >= (prefs.daily_apply_cap ?? 5)) {
    const e = new Error(`daily submit cap reached (${prefs.daily_apply_cap})`); (e as any).status = 429; throw e;
  }

  const [{ data: profile }, { data: tailoredResume }] = await Promise.all([
    svc.from("profiles")
      .select("email,full_name,job_preferences")
      .eq("user_id", userId)
      .maybeSingle(),
    draft.tailored_resume_id
      ? svc.from("resumes").select("personal_info,experience").eq("id", draft.tailored_resume_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const storedProfile = asRecord(asRecord(asRecord(profile?.job_preferences).applypass).profile);
  const personalInfo = asRecord(tailoredResume?.personal_info);
  const experience = Array.isArray(tailoredResume?.experience) ? tailoredResume.experience : [];
  const candidateProfile = {
    fullName: asString(storedProfile.fullName) || asString(profile?.full_name) || asString(personalInfo.name),
    email: asString(storedProfile.email) || asString(profile?.email) || asString(personalInfo.email),
    phone: asString(storedProfile.phone) || asString(personalInfo.phone),
    location: asString(storedProfile.location) || asString(personalInfo.location),
    currentTitle: asString(storedProfile.currentTitle) || asString(personalInfo.title) || asString(asRecord(experience[0]).role),
    yearsExperience: asString(storedProfile.yearsExperience),
    linkedinUrl: asString(storedProfile.linkedinUrl) || asString(personalInfo.linkedin),
    portfolioUrl: asString(storedProfile.portfolioUrl),
    expectedSalary: asString(storedProfile.expectedSalary),
    workAuthorization: asString(storedProfile.workAuthorization),
    noticePeriod: asString(storedProfile.noticePeriod),
  };

  const queuedAt = new Date().toISOString();
  let resumeFileUrl = asString((draft as any).tailored_cv_pdf_url);
  if (draft.tailored_resume_id) {
    const renderResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/mc-render-resume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resume_id: draft.tailored_resume_id, format: "pdf", user_id: userId }),
    });
    const renderBody = await renderResponse.json().catch(() => ({}));
    if (!renderResponse.ok || !renderBody?.url) {
      throw new Error("The job-specific résumé PDF could not be generated; the application was not queued.");
    }
    resumeFileUrl = String(renderBody.url);
    await svc.from("draft_applications").update({ tailored_cv_pdf_url: resumeFileUrl }).eq("id", draft.id).eq("user_id", userId);
  }
  let trackedJobId: string | null = null;

  // Keep Agent submissions in the same application workspace that powers
  // Gmail matching. This lets verification mail and later status updates map
  // to the exact job without scanning unrelated personal messages.
  const { data: gmailConnection } = await svc
    .from("mc_gmail_connections")
    .select("session_id")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let applicationSession: { id: string } | null = gmailConnection?.session_id
    ? { id: gmailConnection.session_id }
    : null;
  if (!applicationSession) {
    const { data: latestSession } = await svc
      .from("mc_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    applicationSession = latestSession;
  }
  if (!applicationSession) {
    const { data: createdSession } = await svc
      .from("mc_sessions")
      .insert({
        user_id: userId,
        name: "Application Agent",
        master_resume_id: draft.tailored_resume_id,
      })
      .select("id,status")
      .single();
    applicationSession = createdSession;
  }

  if (applicationSession?.id) {
    const { data: existingTracked } = await svc
      .from("mc_tracked_jobs")
      .select("id")
      .eq("user_id", userId)
      .eq("scanned_job_id", job.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingTracked?.id) {
      trackedJobId = existingTracked.id;
      await svc.from("mc_tracked_jobs").update({
        session_id: applicationSession.id,
        status: ["discovered", "saved"].includes(existingTracked.status) ? "saved" : existingTracked.status,
        apply_url: job.apply_url,
        tailored_resume_id: draft.tailored_resume_id,
      }).eq("id", existingTracked.id);
    } else {
      const { data: createdTracked } = await svc.from("mc_tracked_jobs").insert({
        user_id: userId,
        session_id: applicationSession.id,
        scanned_job_id: job.id,
        job_title: job.title,
        company: company.name,
        apply_url: job.apply_url,
        tailored_resume_id: draft.tailored_resume_id,
        status: "saved",
      }).select("id").single();
      trackedJobId = createdTracked?.id || null;
    }
  }

  // Enqueue
  const payload = {
    jobs: [{
      id: job.id,
      title: job.title,
      company: company.name,
      url: job.apply_url,
      trackedJobId,
      approvalReceipt: {
        approved: true,
        reviewedAt: queuedAt,
        source: "eligible_only_policy",
      },
    }],
    resumeId: draft.tailored_resume_id,
    resumeFileUrl,
    tailoredResumeMarkdown: draft.tailored_cv_md,
    candidateProfile,
    answerMemory: answersToMemory(draft.answers),
    source: "career_agent",
    createdAt: queuedAt,
    portal,
    company_slug: company.slug,
    company_name: company.name,
    api_identifier: company.api_identifier,
    job_external_id: job.external_id,
    job_title: job.title,
    apply_url: job.apply_url,
    draft_application_id: draft.id,
    tailored_resume_id: draft.tailored_resume_id,
    evaluation_id: draft.evaluation_id,
    tracked_job_id: trackedJobId,
    // Answers are passed through to the worker; worker maps them into
    // Greenhouse's question schema at submit time.
    answers: draft.answers,
  };

  const { data: task, error: taskErr } = await svc
    .from("applypass_tasks")
    .insert({
      user_id: userId,
      task_type: "career_ops_submit",
      status: "pending",
      payload,
    })
    .select("id, status")
    .single();
  if (taskErr) throw new Error(`enqueue: ${taskErr.message}`);

  // Mark draft queued + link the task
  await svc
    .from("draft_applications")
    .update({ status: "queued", applypass_task_id: (task as any).id })
    .eq("id", draft.id);

  return { task, draft_status: "queued" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as SubmitPayload;
    const user = await getAuthedUserOrService(req, body.user_id);

    const svc = serviceClient();
    await enforceAutoApplyEntitlement(svc, user.id);
    await enforceMonthlyAutoApplyExecutionCap(svc, user.id, 1);

    if (!body.draft_application_id) return jsonResponse({ error: "draft_application_id required" }, 400);

    const result = await enqueueSubmit(user.id, body.draft_application_id);
    return jsonResponse(result);
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, status);
  }
});

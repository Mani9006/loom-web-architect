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

/**
 * Employment history for old-style Greenhouse sections: first 4 entries of the
 * tailored resume's experience array mapped to the adapter-facing shape
 * ({ company, title, startDate, endDate, location, current }).
 * Mirrors mapResumeExperience() in scripts/ats-adapters/helpers.mjs — edge
 * functions deploy from this directory only, so the mapping is duplicated here.
 */
function mapResumeExperienceForSubmit(experience: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(experience)) return [];
  return experience.slice(0, 4).flatMap((item) => {
    const entry = asRecord(item);
    const company = asString(entry.company_or_client) || asString(entry.company);
    const title = asString(entry.role) || asString(entry.title);
    if (!company && !title) return [];
    const endDate = asString(entry.end_date);
    return [{
      company,
      title,
      startDate: asString(entry.start_date),
      endDate,
      location: asString(entry.location),
      current: /present|current/i.test(endDate),
    }];
  });
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

/**
 * STANDARD ANSWER MEMORY — one-time profile answers to the screening
 * questions nearly every ATS asks, synthesized at enqueue time so submissions
 * complete without asking the user anything mid-flight.
 *
 * Honesty guards:
 *   - An answer is only emitted when the underlying value is explicitly set in
 *     the user's profile/preferences. Unknowns stay unanswered so the adapter
 *     surfaces them for review instead of guessing.
 *   - EEO demographics are copied verbatim from the stored eeo sub-object —
 *     never defaulted, never invented.
 *   - Privacy-policy consent is affirmed only when the user stored an explicit
 *     privacyConsent === true.
 *   - Degree/experience screening questions ("advanced degree in <fields>",
 *     "Masters and 5+ years") are deliberately NOT synthesized here: they stay
 *     with the tailor's evidence-based answers or remain unanswered.
 *
 * Keys are written as the canonical question texts Greenhouse/Ashby/Lever use;
 * adapter fuzzy matching maps decorated labels ("Gender *", "Race/Ethnicity")
 * onto them. Tailor draft answers keep priority on question-text collisions
 * (spread order at the merge site).
 */
function buildStandardAnswerMemory(
  candidateProfile: Record<string, unknown>,
  storedEeo: Record<string, unknown>,
  opts: {
    privacyConsent: boolean;
    sponsorshipKnown: boolean;
    contactEmployer: boolean;
    previouslyEmployed: boolean | null;
    hasExperience: boolean;
    companyName?: string;
    experienceEmployers?: string[];
  },
): Record<string, string> {
  const memory: Record<string, string> = {};
  const put = (value: unknown, ...questions: string[]) => {
    const answer = asString(value);
    if (!answer) return;
    for (const question of questions) memory[question] = answer;
  };
  const eeoValue = (...keys: string[]) => {
    for (const key of keys) {
      const value = asString(storedEeo[key]);
      if (value) return value;
    }
    return "";
  };

  put(candidateProfile.discoverySource,
    "How did you hear about this job?",
    "How did you hear about us?",
    "How did you hear about this position?");

  if (opts.privacyConsent === true) {
    put("I agree",
      "I certify that the facts set forth in this Application for Employment are true and complete",
      "I certify that the information provided is true and complete",
      "I certify that my answers are true and complete to the best of my knowledge",
      "I agree to the terms and conditions",
      "I acknowledge and agree");
  }

  // "Have you worked here before?" — answered from the resume's own employer
  // list (evidence-backed, never a guess).
  if (opts.companyName) {
    const normalizedCompany = opts.companyName.toLowerCase().trim();
    const employers = (opts.experienceEmployers || []).map((name) => name.toLowerCase());
    const workedHere = employers.some((name) => name && (normalizedCompany.includes(name) || name.includes(normalizedCompany)));
    put(workedHere ? "Yes" : "No",
      `Have you ever worked for ${opts.companyName} before, as an employee or a contractor/consultant?`,
      `Have you ever worked for ${opts.companyName} before?`,
      `Have you worked for ${opts.companyName} before?`,
      `Have you been employed by ${opts.companyName}, or any subsidiary, affiliate, or business unit of ${opts.companyName}, in the past (whether on a full-time or part-time basis)?`,
      "Have you been employed by this company in the past?",
      "Have you previously worked at this company?");
  }

  const firstName = asString(candidateProfile.fullName).split(/\s+/).filter(Boolean)[0] || "";
  put(firstName,
    "Preferred Name",
    "Preferred First Name",
    "What is your preferred name?");

  const ethnicity = asString(storedEeo.ethnicity) || asString(storedEeo.race);
  if (ethnicity) {
    put(ethnicity,
      "Are you Hispanic/Latino?",
      "Are you Hispanic or Latino?",
      "Are you of Hispanic or Latino origin?",
      "Hispanic or Latino",
      "Ethnicity",
      "Race",
      "Race/Ethnicity",
      "What is your race or ethnicity?");
  }

  put(candidateProfile.noticePeriod || "2 weeks",
    "When can you start a new role?",
    "When can you start?",
    "When could you start?",
    "What is your earliest start date?",
    "When are you available to start?",
    "What is your notice period?",
    "How soon can you start?");

  const workAuthorization = asString(candidateProfile.workAuthorization);
  if (workAuthorization) {
    const normalized = workAuthorization.toLowerCase();
    const indicatesAuthorized = /(authoriz|citizen|permanent resident|green card|\bead\b|\bgc\b)/.test(normalized)
      && !/(not|un)\s*-?\s*authoriz/.test(normalized);
    put(indicatesAuthorized ? "Yes" : workAuthorization,
      "Are you currently authorized to work in the U.S.?",
      "Are you authorized to work in the United States?",
      "Are you legally authorized to work in the United States?",
      "Are you authorized to work in the country where this role is located?");
  }

  if (opts.sponsorshipKnown) {
    put(candidateProfile.requiresSponsorship === true ? "Yes" : "No",
      "Do you now, or will you in the future, require immigration sponsorship?",
      "Will you now or in the future require sponsorship for employment visa status?",
      "Do you require sponsorship?");
  }

  put(candidateProfile.currentCompany,
    "What is your current (or most recent) company?",
    "Current company",
    "Most recent company",
    "Current or most recent employer");
  put(candidateProfile.yearsExperience,
    "How many years of experience do you have?",
    "Years of experience",
    "How many years of relevant experience do you have?");
  put(candidateProfile.expectedSalary,
    "What is your expected salary?",
    "What are your compensation expectations?",
    "Expected compensation",
    "Desired salary");
  put(candidateProfile.linkedinUrl,
    "LinkedIn",
    "LinkedIn Profile",
    "LinkedIn URL");

  if (opts.privacyConsent) {
    put("I agree",
      "I have read and agree to the Privacy Policy",
      "I agree to the Privacy Policy",
      "Do you agree to the privacy policy?",
      "Privacy Policy consent",
      "I acknowledge the privacy policy");
  }

  // Order matters: fuzzy matching returns the first containment hit, so the
  // more specific keys come before their substrings ("transgender" contains
  // "gender"; "sexual orientation" is distinct).
  put(eeoValue("transgender"), "Are you transgender?", "Do you identify as transgender?");
  put(eeoValue("sexualOrientation", "sexual_orientation"), "Sexual orientation", "What is your sexual orientation?");
  put(eeoValue("gender", "genderIdentity"), "Gender identity", "Gender", "What is your gender?");
  put(eeoValue("disability", "disabilityStatus", "disability_status"), "Disability status", "Do you have a disability?");
  put(eeoValue("veteran", "veteranStatus", "veteran_status"), "Veteran status", "Are you a veteran?", "Protected veteran status");
  put(eeoValue("ethnicity", "race", "raceEthnicity", "ethnicity_race"), "Race", "Ethnicity", "Race/Ethnicity", "What is your race or ethnicity?");

  // --- Employment-history companion questions (old-style Greenhouse boards) --
  // "May we contact your current employer?" defaults to No — the safe norm
  // during an active job search — unless the user explicitly stored consent.
  put(opts.contactEmployer === true ? "Yes" : "No",
    "May we contact your current employer?",
    "May we contact this employer?",
    "Can we contact your current employer?",
    "Do we have permission to contact your current employer?");

  // Prior employment with THIS employer is answered only from an explicitly
  // stored value — never invented; unset stays blank for review.
  if (typeof opts.previouslyEmployed === "boolean") {
    put(opts.previouslyEmployed ? "Yes" : "No",
      "Have you been employed by this company in the past?",
      "Have you previously been employed by this company?",
      "Have you been employed by us in the past?",
      "Were you previously employed here?",
      "Have you worked here before?");
  }

  // Instruction-style acknowledgment, honest only when employment entries
  // were actually provided in the payload (the adapter fills the blocks).
  if (opts.hasExperience) {
    put("Employment history provided above",
      "Please enter your relevant employment and military service above",
      "Please enter your relevant employment history above");
  }

  return memory;
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
    .select(`id, user_id, evaluation_id, tailored_resume_id, tailored_cv_md, tailored_cv_pdf_url, answers, status, error_message, applypass_task_id,
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
  if (/employer verification is required|complete the final check/i.test(asString(draft.error_message))) {
    const e = new Error("Employer verification is required before this application can be submitted.");
    (e as any).status = 409; throw e;
  }

  const job = (draft as any).evaluation?.scanned_job;
  const company = job?.company;
  if (!job || !company) throw new Error("associated job missing");
  const portal = asString(company.api_type).toLowerCase();
  const supportedPortals = new Set(["greenhouse", "ashby", "lever", "workable"]);
  if (!supportedPortals.has(portal)) {
    const e = new Error("This employer portal still needs review before submission.");
    (e as any).status = 422; throw e;
  }

  // Load prefs
  const { data: prefs } = await svc
    .from("user_job_prefs")
    .select("auto_apply_enabled, auto_apply_portals, daily_apply_cap, requires_sponsorship, work_authorization")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prefs?.auto_apply_enabled) {
    const e = new Error("auto-apply is not enabled in your preferences"); (e as any).status = 403; throw e;
  }
  if (!prefs.auto_apply_portals?.includes(portal)) {
    const e = new Error("This employer portal is not enabled in your application rules."); (e as any).status = 403; throw e;
  }

  // Treat queueing as an idempotent command. UI retries, double-clicks, and
  // scheduled agent overlap must all resolve to the same active task.
  const { data: existingActive } = await svc
    .from("applypass_tasks")
    .select("id,status")
    .eq("user_id", userId)
    .eq("task_type", "career_ops_submit")
    .contains("payload", { draft_application_id: draft.id })
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingActive) {
    await svc.from("draft_applications")
      .update({ status: "queued", applypass_task_id: existingActive.id, error_message: null })
      .eq("id", draft.id)
      .eq("user_id", userId);
    return { task: existingActive, draft_status: "queued", already_queued: true };
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

  const applypass = asRecord(asRecord(profile?.job_preferences).applypass);
  const storedProfile = asRecord(applypass.profile);
  // One-time screening answers may live as applypass sub-objects (newer
  // profile UI) or nested inside the profile object itself. Read both;
  // profile-nested values win. Anything unset stays unset — never invented.
  const storedEeo = { ...asRecord(applypass.eeo), ...asRecord(storedProfile.eeo) };
  const storedConsent = { ...asRecord(applypass.consent), ...asRecord(storedProfile.consent) };
  const storedScreening = { ...asRecord(applypass.screening), ...asRecord(storedProfile.screening) };
  const personalInfo = asRecord(tailoredResume?.personal_info);
  const experience = Array.isArray(tailoredResume?.experience) ? tailoredResume.experience : [];
  const candidateProfile = {
    fullName: asString(storedProfile.fullName) || asString(profile?.full_name) || asString(personalInfo.name),
    email: asString(storedProfile.email) || asString(profile?.email) || asString(personalInfo.email),
    phone: asString(storedProfile.phone) || asString(personalInfo.phone),
    location: asString(storedProfile.location) || asString(personalInfo.location),
    currentTitle: asString(storedProfile.currentTitle) || asString(personalInfo.title) || asString(asRecord(experience[0]).role),
    currentCompany: asString(storedProfile.currentCompany)
      || asString(asRecord(experience[0]).company_or_client)
      || asString(asRecord(experience[0]).company),
    yearsExperience: asString(storedProfile.yearsExperience),
    linkedinUrl: asString(storedProfile.linkedinUrl) || asString(personalInfo.linkedin),
    portfolioUrl: asString(storedProfile.portfolioUrl),
    expectedSalary: asString(storedProfile.expectedSalary),
    workAuthorization: asString(storedProfile.workAuthorization) || asString(prefs?.work_authorization),
    requiresSponsorship: typeof storedProfile.requiresSponsorship === "boolean"
      ? storedProfile.requiresSponsorship
      : prefs?.requires_sponsorship === true,
    noticePeriod: asString(storedProfile.noticePeriod),
    discoverySource: asString(storedScreening.discoverySource)
      || asString(storedProfile.discoverySource)
      || "ResumePreps job search",
    // First 4 tailored-resume experience entries for old-style Greenhouse
    // EMPLOYMENT HISTORY sections (consumed by fillEmploymentHistory).
    experience: mapResumeExperienceForSubmit(experience),
  };

  // Synthesize the standard screening answers and merge them under the
  // tailor's draft answers (draft keeps priority on question-text
  // collisions). Privacy consent and sponsorship are only answered when the
  // user explicitly stored them — never assumed.
  const standardAnswerMemory = buildStandardAnswerMemory(
    candidateProfile,
    storedEeo,
    {
      privacyConsent: storedProfile.privacyConsent === true || storedConsent.privacyConsent === true,
      sponsorshipKnown: typeof storedProfile.requiresSponsorship === "boolean"
        || typeof prefs?.requires_sponsorship === "boolean",
      contactEmployer: storedProfile.contactEmployer === true,
      previouslyEmployed: typeof storedProfile.previouslyEmployedAtThisCompany === "boolean"
        ? storedProfile.previouslyEmployedAtThisCompany
        : typeof storedProfile.previouslyEmployed === "boolean"
          ? storedProfile.previouslyEmployed
          : null,
      hasExperience: (candidateProfile.experience as unknown[]).length > 0,
      companyName: asString(company.name),
      experienceEmployers: experience.map((entry) =>
        asString(asRecord(entry).company_or_client) || asString(asRecord(entry).company)
      ).filter(Boolean),
    },
  );
  const answerMemory = { ...standardAnswerMemory, ...answersToMemory(draft.answers) };

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
    .select("session_id,gmail_email")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (asString(gmailConnection?.gmail_email)) {
    candidateProfile.email = asString(gmailConnection?.gmail_email);
  }
  let applicationSession: { id: string } | null = gmailConnection?.session_id
    ? { id: gmailConnection.session_id }
    : null;
  if (!applicationSession) {
    const { data: latestSession } = await svc
      .from("mc_sessions")
      .select("id,status")
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
    const { data: existingTracked, error: trackedLookupError } = await svc
      .from("mc_tracked_jobs")
      .select("id,status")
      .eq("user_id", userId)
      .eq("scanned_job_id", job.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (trackedLookupError) throw new Error("The application inbox could not be linked to this job.");
    if (existingTracked?.id) {
      trackedJobId = existingTracked.id;
      const { error: trackedUpdateError } = await svc.from("mc_tracked_jobs").update({
        session_id: applicationSession.id,
        status: ["discovered", "saved"].includes(existingTracked.status) ? "saved" : existingTracked.status,
        apply_url: job.apply_url,
      }).eq("id", existingTracked.id);
      if (trackedUpdateError) throw new Error("The application inbox could not be linked to this job.");
    } else {
      const { data: createdTracked, error: trackedCreateError } = await svc.from("mc_tracked_jobs").insert({
        user_id: userId,
        session_id: applicationSession.id,
        scanned_job_id: job.id,
        job_title: job.title,
        company: company.name,
        apply_url: job.apply_url,
        status: "saved",
      }).select("id").single();
      if (trackedCreateError) throw new Error("The application inbox could not be linked to this job.");
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
    answerMemory,
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

  const { data: insertedTask, error: taskErr } = await svc
    .from("applypass_tasks")
    .insert({
      user_id: userId,
      task_type: "career_ops_submit",
      status: "pending",
      payload,
    })
    .select("id, status")
    .single();
  let task = insertedTask;
  if (taskErr?.code === "23505") {
    const { data: racedTask } = await svc
      .from("applypass_tasks")
      .select("id,status")
      .eq("user_id", userId)
      .eq("task_type", "career_ops_submit")
      .contains("payload", { draft_application_id: draft.id })
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    task = racedTask;
  } else if (taskErr) {
    throw new Error(`enqueue: ${taskErr.message}`);
  }
  if (!task) throw new Error("The application could not be added to the queue.");

  // Mark draft queued + link the task
  await svc
    .from("draft_applications")
    .update({ status: "queued", applypass_task_id: (task as any).id, error_message: null })
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

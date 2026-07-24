import { supabase } from "@/integrations/supabase/client";

/**
 * Email → application deep-link resolution.
 *
 * An inbound email is linked to a job through mc_inbound_emails.tracked_job_id
 * → mc_tracked_jobs. From there the best in-app destination is resolved in a
 * strict priority order (see pickEmailLinkTarget):
 *
 *   1. Draft application review  /applications/<draft_id>
 *      (mc_tracked_jobs.scanned_job_id → job_evaluations → draft_applications,
 *       latest draft for this user)
 *   2. External apply URL        mc_tracked_jobs.apply_url (new tab)
 *   3. My Collection job board   /my-collection/<session_id>?tab=board
 *
 * If the email has no tracked job, or none of the above resolve, there is no
 * target and the UI shows "No linked application yet".
 */

/** Human labels for mc_inbound_emails.classification values. */
export const emailClassificationLabels: Record<string, string> = {
  all: "All",
  verification: "Codes",
  confirmation: "Applied",
  interview_invite: "Interview",
  take_home: "Assessment",
  offer: "Offer",
  reject: "Not selected",
  other_recruiter: "Recruiter update",
  irrelevant: "Other",
};

export interface TrackedJobLinkRow {
  id: string;
  session_id: string | null;
  scanned_job_id: string | null;
  apply_url: string | null;
  job_title: string;
  company: string;
}

export type EmailLinkTarget =
  | { kind: "draft"; href: string; draftId: string }
  | { kind: "external"; href: string }
  | { kind: "session"; href: string };

/** Pure priority decision, kept separate from I/O for unit testing. */
export function pickEmailLinkTarget(
  trackedJob: Pick<TrackedJobLinkRow, "apply_url" | "session_id"> | null | undefined,
  draftId: string | null,
): EmailLinkTarget | null {
  if (!trackedJob) return null;
  if (draftId) return { kind: "draft", href: `/applications/${draftId}`, draftId };
  if (trackedJob.apply_url) return { kind: "external", href: trackedJob.apply_url };
  if (trackedJob.session_id) {
    return { kind: "session", href: `/my-collection/${trackedJob.session_id}?tab=board` };
  }
  return null;
}

/** One-line "linked to: <Job Title @ Company>" label for list rows. */
export function formatLinkedJobLabel(job: Pick<TrackedJobLinkRow, "job_title" | "company"> | null | undefined): string | null {
  if (!job) return null;
  const title = job.job_title?.trim();
  const company = job.company?.trim();
  if (title && company) return `${title} @ ${company}`;
  return title || company || null;
}

export async function fetchTrackedJobLink(trackedJobId: string, userId: string): Promise<TrackedJobLinkRow | null> {
  const { data, error } = await supabase
    .from("mc_tracked_jobs")
    .select("id,session_id,scanned_job_id,apply_url,job_title,company")
    .eq("id", trackedJobId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as TrackedJobLinkRow | null) ?? null;
}

/**
 * Latest draft application (by created_at) whose evaluation points at the
 * given scanned job: draft_applications.evaluation_id → job_evaluations.id
 * where job_evaluations.scanned_job_id = scannedJobId.
 */
export async function findLatestDraftIdForScannedJob(scannedJobId: string, userId: string): Promise<string | null> {
  const { data: evaluations, error: evaluationsError } = await supabase
    .from("job_evaluations")
    .select("id")
    .eq("user_id", userId)
    .eq("scanned_job_id", scannedJobId);
  if (evaluationsError) throw evaluationsError;
  const evaluationIds = (evaluations || []).map((row) => row.id);
  if (!evaluationIds.length) return null;

  const { data: draft, error: draftError } = await supabase
    .from("draft_applications")
    .select("id,created_at")
    .eq("user_id", userId)
    .in("evaluation_id", evaluationIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftError) throw draftError;
  return draft?.id ?? null;
}

export interface ResolvedEmailLink {
  target: EmailLinkTarget | null;
  trackedJob: TrackedJobLinkRow | null;
}

/** Full resolution chain for an email row. Throws on query errors. */
export async function resolveEmailApplicationLink(trackedJobId: string | null, userId: string): Promise<ResolvedEmailLink> {
  if (!trackedJobId) return { target: null, trackedJob: null };
  const trackedJob = await fetchTrackedJobLink(trackedJobId, userId);
  if (!trackedJob) return { target: null, trackedJob: null };
  const draftId = trackedJob.scanned_job_id
    ? await findLatestDraftIdForScannedJob(trackedJob.scanned_job_id, userId)
    : null;
  return { target: pickEmailLinkTarget(trackedJob, draftId), trackedJob };
}

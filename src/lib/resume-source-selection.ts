export interface ProfileResumeCandidate {
  id: string;
  user_id: string;
  title: string | null;
  updated_at: string;
  created_at?: string | null;
  source_document_id?: string | null;
  personal_info?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function resumeDocumentRole(resume: ProfileResumeCandidate): string | null {
  const personalInfo = asRecord(resume.personal_info);
  const extras = asRecord(personalInfo._v2_extras);
  return typeof extras.document_role === "string" ? extras.document_role : null;
}

export function isApplicationResumeVariant(resume: ProfileResumeCandidate): boolean {
  const personalInfo = asRecord(resume.personal_info);
  const extras = asRecord(personalInfo._v2_extras);
  const role = resumeDocumentRole(resume);

  return role === "application_snapshot"
    || role === "tailored_draft"
    || (typeof extras.source_resume_id === "string" && extras.source_resume_id.length > 0);
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Select the source resume displayed on Profile.
 *
 * The owner's explicit primary resume wins when it is a master/source record.
 * If that pointer is missing or targets an application-only variant, choose
 * the most recently updated eligible source resume.
 */
export function selectProfileSourceResume(
  resumes: ProfileResumeCandidate[],
  primaryResumeId: string | null | undefined,
  userId: string,
): ProfileResumeCandidate | null {
  const eligible = resumes.filter(
    (resume) => resume.user_id === userId && !isApplicationResumeVariant(resume),
  );

  const primary = primaryResumeId
    ? eligible.find((resume) => resume.id === primaryResumeId)
    : undefined;
  if (primary) return primary;

  return [...eligible].sort((a, b) => {
    const updatedDifference = timestamp(b.updated_at) - timestamp(a.updated_at);
    if (updatedDifference !== 0) return updatedDifference;
    return timestamp(b.created_at) - timestamp(a.created_at);
  })[0] ?? null;
}

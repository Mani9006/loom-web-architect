export interface EmailMatchJob {
  company?: unknown;
  job_title?: unknown;
}

export interface EmailMatchInput {
  subject: string;
  from: string;
  body: string;
}

const BODY_LEAD_LIMIT = 800;

export function normalizeEmailMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function trustedEmailBodyLead(body: string): string {
  const readable = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const historicalSection = readable.search(
    /\n\s*(?:copied resume|resume details|candidate profile|work experience|employment history|professional experience|application responses?)\s*[:\n]/i,
  );
  const identitySection = historicalSection >= 0
    ? readable.slice(0, historicalSection)
    : readable;
  return identitySection.slice(0, BODY_LEAD_LIMIT);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

interface Candidate<T> {
  job: T;
  score: number;
  hasCompanySignal: boolean;
  companyInSubject: boolean;
  companyInSender: boolean;
}

function scoreJob<T extends EmailMatchJob>(job: T, input: EmailMatchInput): Candidate<T> | null {
  const subject = normalizeEmailMatchText(input.subject);
  const sender = normalizeEmailMatchText(input.from);
  const lead = normalizeEmailMatchText(trustedEmailBodyLead(input.body));
  const company = normalizeEmailMatchText(String(job.company || ""));
  const title = normalizeEmailMatchText(String(job.job_title || ""));

  const companyInSubject = company.length >= 3 && containsPhrase(subject, company);
  const companyInSender = company.length >= 3 && containsPhrase(sender, company);
  const companyInLead = company.length >= 3 && containsPhrase(lead, company);
  const titleInSubject = title.length >= 5 && containsPhrase(subject, title);
  const titleInLead = title.length >= 5 && containsPhrase(lead, title);
  const hasCompanySignal = companyInSubject || companyInSender || companyInLead;

  // A title buried in an email body is too weak: copied resumes and prior
  // application details regularly contain many historical job titles.
  if (!hasCompanySignal && !titleInSubject) return null;

  const score =
    (companyInSubject ? 12 : 0) +
    (companyInSender ? 10 : 0) +
    (companyInLead ? 8 : 0) +
    (titleInSubject ? 5 : 0) +
    (titleInLead ? 2 : 0);

  return {
    job,
    score,
    hasCompanySignal,
    companyInSubject,
    companyInSender,
  };
}

function subjectClaimsSpecificApplication(subject: string): boolean {
  const normalized = normalizeEmailMatchText(subject);
  return (
    /\bapplication (?:to|at|with|for) [a-z0-9]/.test(normalized) ||
    /\byour [a-z0-9+# ]{2,48} application\b/.test(normalized)
  );
}

function selectUnambiguous<T>(candidates: Candidate<T>[]): T | null {
  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  const [best, runnerUp] = sorted;
  if (!best) return null;
  if (!runnerUp) return best.job;
  if (!best.hasCompanySignal) return null;
  if (best.score === runnerUp.score || best.score - runnerUp.score < 4) return null;
  return best.job;
}

/**
 * Match an authenticated application email to one tracked job.
 *
 * Only the subject, sender, and the leading 800 characters of the body are
 * trusted as identity signals. The rest of the body may contain copied
 * resumes, screening answers, or older application history. Ties and close
 * competing signals fail closed instead of assigning mail to the wrong job.
 */
export function matchEmailToJob<T extends EmailMatchJob>(
  trackedJobs: readonly T[],
  input: EmailMatchInput,
): T | null {
  const candidates = trackedJobs
    .map((job) => scoreJob(job, input))
    .filter((candidate): candidate is Candidate<T> => candidate !== null);

  if (candidates.length === 0) return null;

  const subjectCandidates = candidates.filter((candidate) => candidate.companyInSubject);
  if (subjectCandidates.length > 0) return selectUnambiguous(subjectCandidates);
  // If the subject explicitly names an application target that is not one of
  // the tracked employers, a later body mention must never override it.
  if (subjectClaimsSpecificApplication(input.subject)) return null;

  const senderCandidates = candidates.filter((candidate) => candidate.companyInSender);
  if (senderCandidates.length > 0) return selectUnambiguous(senderCandidates);
  return selectUnambiguous(candidates);
}

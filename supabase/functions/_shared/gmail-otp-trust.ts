import {
  classifyAtsApplyUrl,
  type SupportedAtsPortal,
} from "./ats-url-policy.ts";
import { matchEmailToJob } from "./email-job-match.ts";

export interface OtpTrackedJob {
  id: string;
  company: string;
  job_title?: string | null;
  apply_url?: string | null;
  scanned_job_id?: string | null;
}

export interface OtpJobEvidence {
  trackedJobId: string;
  company: string;
  jobTitle?: string | null;
  applyUrl: string;
  provider: string;
  jobId?: string | null;
  providerIdentifier?: string | null;
}

export interface OtpVerifiedSource {
  scannedJobId: string;
  company: string;
  provider: string;
  providerIdentifier: string;
  applyUrl: string;
  companyUrl?: string | null;
}

export interface VerifiedOtpJobTarget {
  trackedJobId: string;
  company: string;
  job_title: string;
  applyUrl: string;
  provider: SupportedAtsPortal;
  providerIdentifier: string;
  companyDomain: string | null;
}

export interface OtpSenderAuthentication {
  authenticated: boolean;
  fromDomain: string | null;
  alignedDmarc: boolean;
  alignedDkim: boolean;
  alignedSpf: boolean;
}

export interface OtpTrustDecision {
  target: VerifiedOtpJobTarget | null;
  authentication: OtpSenderAuthentication;
  reason:
    | "trusted"
    | "invalid_from"
    | "unaligned_authentication"
    | "sender_not_bound"
    | "ambiguous_target";
}

const PROVIDER_SENDER_DOMAINS: Readonly<
  Record<SupportedAtsPortal, readonly string[]>
> = {
  greenhouse: ["greenhouse.io"],
  lever: ["lever.co"],
  ashby: ["ashbyhq.com"],
  // Workable documents both its product domain and workablemail.com as
  // service-owned outbound sender domains.
  workable: ["workable.com", "workablemail.com"],
};

function normalizeDomain(value: string): string | null {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\.$/, "");
  if (
    !domain ||
    domain.length > 253 ||
    !domain.includes(".") ||
    domain.includes("..") ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    domain.split(".").some((label) =>
      !label ||
      label.length > 63 ||
      label.startsWith("-") ||
      label.endsWith("-")
    )
  ) {
    return null;
  }
  return domain;
}

function domainFromAddress(value: string): string | null {
  const candidate = value
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/^mailto:/i, "");
  const at = candidate.lastIndexOf("@");
  return at >= 0 && at < candidate.length - 1
    ? normalizeDomain(candidate.slice(at + 1))
    : null;
}

function domainFromAuthenticationIdentity(value: string): string | null {
  const candidate = value.trim().replace(/^<|>$/g, "");
  return domainFromAddress(candidate) || normalizeDomain(candidate);
}

export function singleFromDomain(from: string): string | null {
  const value = String(from || "").trim();
  if (!value) return null;

  const bracketed = [...value.matchAll(/<\s*([^<>]+)\s*>/g)].map((match) =>
    match[1]
  );
  const addressSource = bracketed.length > 0 ? bracketed : [value];
  if (addressSource.length !== 1) return null;

  // A multi-mailbox From field is not safe for secret routing. Display names
  // can contain commas, so count addr-specs instead of splitting on commas.
  const addresses = addressSource[0].match(
    /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/gi,
  ) ?? [];
  if (addresses.length !== 1) return null;
  return domainFromAddress(addresses[0]);
}

function domainAligned(left: string, right: string): boolean {
  const a = normalizeDomain(left);
  const b = normalizeDomain(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function googleAuthenticationResults(values: readonly string[]): string[] {
  const first = values.find((value) => {
    const authservId = String(value || "").split(";", 1)[0].trim()
      .toLowerCase();
    return /^mx\.google\.com(?:\s|$)/.test(authservId);
  });
  // Gmail prepends its result above any Authentication-Results header that
  // arrived with the message. A lower, sender-supplied lookalike must never
  // override the first Google boundary result.
  return first ? [first] : [];
}

function resultClauses(value: string): string[] {
  return value
    .replace(/\r?\n[ \t]+/g, " ")
    .split(";")
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function authProperty(clause: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = clause.match(
    new RegExp(`\\b${escaped}\\s*=\\s*(?:\"([^\"]+)\"|([^\\s;()]+))`, "i"),
  );
  return (match?.[1] || match?.[2] || "").trim() || null;
}

function methodPassed(
  clause: string,
  method: "dmarc" | "dkim" | "spf",
): boolean {
  return new RegExp(`^${method}\\s*=\\s*pass\\b`, "i").test(clause);
}

/**
 * Authenticate the one visible RFC5322 From domain against Gmail's own
 * Authentication-Results header. ARC assertions are intentionally excluded:
 * they describe an earlier hop and are not a fresh authentication result for
 * the visible sender Gmail delivered.
 */
export function authenticateOtpSender(
  from: string,
  authenticationResults: readonly string[],
): OtpSenderAuthentication {
  const fromDomain = singleFromDomain(from);
  if (!fromDomain) {
    return {
      authenticated: false,
      fromDomain: null,
      alignedDmarc: false,
      alignedDkim: false,
      alignedSpf: false,
    };
  }

  let alignedDmarc = false;
  let alignedDkim = false;
  let alignedSpf = false;
  for (const value of googleAuthenticationResults(authenticationResults)) {
    for (const clause of resultClauses(value)) {
      if (methodPassed(clause, "dmarc")) {
        const headerFrom = authProperty(clause, "header.from");
        if (headerFrom && normalizeDomain(headerFrom) === fromDomain) {
          alignedDmarc = true;
        }
      } else if (methodPassed(clause, "dkim")) {
        const dkimDomain = authProperty(clause, "header.d") ||
          domainFromAddress(authProperty(clause, "header.i") || "");
        if (dkimDomain && domainAligned(dkimDomain, fromDomain)) {
          alignedDkim = true;
        }
      } else if (methodPassed(clause, "spf")) {
        const mailFromDomain = domainFromAuthenticationIdentity(
          authProperty(clause, "smtp.mailfrom") || "",
        );
        if (mailFromDomain && domainAligned(mailFromDomain, fromDomain)) {
          alignedSpf = true;
        }
      }
    }
  }

  return {
    authenticated: alignedDmarc || alignedDkim || alignedSpf,
    fromDomain,
    alignedDmarc,
    alignedDkim,
    alignedSpf,
  };
}

function normalizeIdentity(value: unknown): string {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function publicHttpsDomain(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return null;
    }
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Convert a tracked job plus server-verified task/receipt evidence into an
 * exact OTP routing target. Any provider, company, job id, or apply URL drift
 * fails closed.
 */
export function verifyOtpJobTarget(
  trackedJob: OtpTrackedJob,
  evidence: OtpJobEvidence,
  source?: OtpVerifiedSource | null,
): VerifiedOtpJobTarget | null {
  if (
    !trackedJob.id ||
    trackedJob.id !== evidence.trackedJobId ||
    normalizeIdentity(trackedJob.company) !==
      normalizeIdentity(evidence.company)
  ) {
    return null;
  }
  if (
    evidence.jobTitle &&
    normalizeIdentity(trackedJob.job_title) !==
      normalizeIdentity(evidence.jobTitle)
  ) {
    return null;
  }

  const trackedTarget = classifyAtsApplyUrl(trackedJob.apply_url);
  const evidenceTarget = classifyAtsApplyUrl(evidence.applyUrl);
  if (
    !trackedTarget.supported ||
    !evidenceTarget.supported ||
    trackedTarget.type === "manual" ||
    evidenceTarget.type === "manual" ||
    trackedTarget.type !== evidenceTarget.type ||
    trackedTarget.type !== normalizeIdentity(evidence.provider) ||
    trackedTarget.normalizedUrl !== evidenceTarget.normalizedUrl
  ) {
    return null;
  }
  if (
    evidence.providerIdentifier &&
    evidenceTarget.identifier !== evidence.providerIdentifier
  ) {
    return null;
  }

  let companyDomain: string | null = null;
  if (trackedJob.scanned_job_id) {
    if (
      !source ||
      source.scannedJobId !== trackedJob.scanned_job_id ||
      (evidence.jobId && evidence.jobId !== source.scannedJobId) ||
      normalizeIdentity(source.company) !==
        normalizeIdentity(trackedJob.company) ||
      normalizeIdentity(source.provider) !== trackedTarget.type ||
      source.providerIdentifier !== trackedTarget.identifier
    ) {
      return null;
    }
    const sourceTarget = classifyAtsApplyUrl(source.applyUrl);
    if (
      !sourceTarget.supported ||
      sourceTarget.type === "manual" ||
      sourceTarget.type !== trackedTarget.type ||
      sourceTarget.normalizedUrl !== trackedTarget.normalizedUrl
    ) {
      return null;
    }
    companyDomain = publicHttpsDomain(source.companyUrl);
  }

  return {
    trackedJobId: trackedJob.id,
    company: trackedJob.company,
    job_title: String(trackedJob.job_title || evidence.jobTitle || ""),
    applyUrl: trackedTarget.normalizedUrl,
    provider: trackedTarget.type,
    providerIdentifier: trackedTarget.identifier,
    companyDomain,
  };
}

export function senderDomainBoundToOtpTarget(
  from: string,
  target: VerifiedOtpJobTarget,
): boolean {
  const fromDomain = singleFromDomain(from);
  if (!fromDomain) return false;
  const providerBound = PROVIDER_SENDER_DOMAINS[target.provider]
    .some((domain) => domainAligned(fromDomain, domain));
  const companyBound = Boolean(
    target.companyDomain && domainAligned(fromDomain, target.companyDomain),
  );
  return providerBound || companyBound;
}

/**
 * Select one exact job for a code. Authentication, sender ownership, and job
 * identity are independent gates; duplicate targets are collapsed, but two
 * genuinely different candidates require an unambiguous company/title signal.
 */
export function selectTrustedOtpTarget(input: {
  from: string;
  authenticationResults: readonly string[];
  targets: readonly VerifiedOtpJobTarget[];
  subject: string;
  body: string;
}): OtpTrustDecision {
  const authentication = authenticateOtpSender(
    input.from,
    input.authenticationResults,
  );
  if (!authentication.fromDomain) {
    return { target: null, authentication, reason: "invalid_from" };
  }
  if (!authentication.authenticated) {
    return { target: null, authentication, reason: "unaligned_authentication" };
  }

  const unique = new Map<string, VerifiedOtpJobTarget>();
  for (const target of input.targets) {
    if (!senderDomainBoundToOtpTarget(input.from, target)) continue;
    unique.set(`${target.trackedJobId}\n${target.applyUrl}`, target);
  }
  const candidates = [...unique.values()];
  if (candidates.length === 0) {
    return { target: null, authentication, reason: "sender_not_bound" };
  }
  if (candidates.length === 1) {
    return { target: candidates[0], authentication, reason: "trusted" };
  }

  const matched = matchEmailToJob(candidates, {
    subject: input.subject,
    from: input.from,
    body: input.body,
  });
  return matched
    ? { target: matched, authentication, reason: "trusted" }
    : { target: null, authentication, reason: "ambiguous_target" };
}

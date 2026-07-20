const ENTER_CODE = /(?:enter|use|paste|copy(?:\s+and\s+paste)?)\s+(?:the|this|your)?\s*(?:verification|security|one[- ]?time|authentication|confirmation|login|access)?\s*(?:code|password|passcode|pin|otp)\s*(?:is|:|-)?\s*([A-Z0-9]{4,8})\b/i;
const CODE_AFTER_LABEL = /(?:your\s+)?(?:verification|security|one[- ]?time|authentication|confirmation|login|access)\s+(?:code|password|passcode|pin|otp)\s*(?:is|:|-)?\s*([A-Z0-9]{4,8})\b/i;
const CODE_BEFORE_LABEL = /\b([A-Z0-9]{4,8})\s+(?:is\s+)?(?:your|the)\s+(?:verification|security|one[- ]?time|authentication|confirmation|login|access)\s*(?:code|password|passcode|pin|otp)\b/i;
const OTP_LABEL = /(?:\botp\b|\bpasscode\b|\bverification code\b)\s*(?:is|:|-)\s*([A-Z0-9]{4,8})\b/i;

export function extractVerificationCode(value: string): string | null {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const match = normalized.match(ENTER_CODE)
    || normalized.match(CODE_BEFORE_LABEL)
    || normalized.match(CODE_AFTER_LABEL)
    || normalized.match(OTP_LABEL);
  // Employer codes can be case-sensitive (Greenhouse commonly sends mixed
  // case codes), so preserve the exact characters from the email.
  return match?.[1] || null;
}

// ── Job-application sender screening (OTP inbox) ────────────────────────────
// ATS portals send employer verification codes from their own domains, or from
// a generic noreply@ address on the employer's domain. Only mail from these
// senders is eligible for the loose digit-only fallback below; the strict
// extractor above stays sender-agnostic.
export const APPLICATION_SENDER_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "workable.com",
] as const;

const CODE_CONTEXT = /verification code|security code|confirm your email|one[- ]?time (?:code|passcode|password)|authentication code|code\s*(?:is|:|-)/i;
const LOOSE_CODE_AFTER_LABEL = /\b(?:the|your|this)?\s*(?:code|pin|passcode)\s*(?:is|:|-)\s*(\d{4,8})\b/i;
const LOOSE_CONFIRM_EMAIL = /confirm\s+your\s+email[\s\S]{0,80}?\b(\d{4,8})\b/i;

export function senderAddress(from: string): string {
  const value = String(from || "").toLowerCase();
  return (value.match(/<([^>]+)>/)?.[1] || value).trim();
}

export function applicationSenderDomain(from: string): string | null {
  const domain = senderAddress(from).split("@")[1] || "";
  return APPLICATION_SENDER_DOMAINS.find((known) => domain === known || domain.endsWith(`.${known}`)) || null;
}

export function isApplicationSender(from: string): boolean {
  return Boolean(applicationSenderDomain(from)) || /^no[-_]?reply@/.test(senderAddress(from));
}

// Digit-only fallback for ATS senders whose wording the strict extractor does
// not label ("code is 482913", "confirm your email ... 482913"). Digits only:
// loose alnum matching false-positives on ordinary words.
export function extractApplicationCode(value: string): string | null {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized || !CODE_CONTEXT.test(normalized)) return null;
  const match = normalized.match(LOOSE_CODE_AFTER_LABEL) || normalized.match(LOOSE_CONFIRM_EMAIL);
  return match?.[1] || null;
}

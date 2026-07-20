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

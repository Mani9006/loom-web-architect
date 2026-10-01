// Deterministic (regex) classification of job-application emails for
// mc-gmail-poll. Kept dependency-free so it can be unit tested under vitest.
//
// Order matters: rejection wording is checked FIRST. Rejections routinely
// contain words the other patterns look for ("we have decided to move forward
// with other candidates for this position", "thank you for taking the time to
// interview with us. Unfortunately ..."), and a misclassified rejection moves
// the tracked job forward and emails the user "great news".

export type DeterministicEmailClass =
  | "offer"
  | "interview_invite"
  | "take_home"
  | "reject"
  | "confirmation";

export interface DeterministicClassifiedEmail {
  classification: DeterministicEmailClass;
  confidence: number;
  summary: string;
  next_action?: string;
}

const REJECT_PATTERN = /unfortunately|not (?:be )?moving forward|other candidates|will not proceed|not selected/;
// Requires an offer noun right after the verb so generic "move forward with
// ... position" wording (common in rejections) can't match.
const OFFER_PATTERN = /pleased to (?:offer|extend (?:you )?(?:an|this|the) offer)|offer letter|extend(?:ing)? (?:you )?(?:an|this|the|a formal) offer|(?:decided|chosen) to (?:move forward with|extend) (?:you )?(?:an|a formal|the) offer/;
const INTERVIEW_PATTERN = /interview|schedule (?:a|your) (?:call|conversation)|availability for (?:a|the) call/;
const TAKE_HOME_PATTERN = /take[- ]?home|coding (?:test|challenge|assessment)|technical assessment|complete (?:the|this) assessment|hackerrank|codility|codesignal|karat|hirevue|online assessment|assessment invitation|test invitation|aptitude test/;
const CONFIRMATION_PATTERN = /application (?:has been )?(?:received|submitted)|thank you for applying|we received your application/;

export function deterministicClassification(text: string): DeterministicClassifiedEmail | null {
  const value = text.toLowerCase();
  if (REJECT_PATTERN.test(value)) {
    return { classification: "reject", confidence: 0.93, summary: "Application was not selected" };
  }
  if (OFFER_PATTERN.test(value)) {
    return { classification: "offer", confidence: 0.96, summary: "Offer received", next_action: "Review the offer details and response deadline." };
  }
  if (INTERVIEW_PATTERN.test(value)) {
    return { classification: "interview_invite", confidence: 0.92, summary: "Interview invitation received", next_action: "Confirm availability and prepare for the conversation." };
  }
  if (TAKE_HOME_PATTERN.test(value)) {
    return { classification: "take_home", confidence: 0.92, summary: "Assessment requested", next_action: "Review the instructions and completion deadline." };
  }
  if (CONFIRMATION_PATTERN.test(value)) {
    return { classification: "confirmation", confidence: 0.94, summary: "Application received" };
  }
  return null;
}

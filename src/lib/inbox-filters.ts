// Filter chips for the application inbox.
//
// "Needs you" surfaces mail the user has to act on: interview invites,
// assessments, offers, an active verification code, or any message the
// classifier attached a next step to.

export type InboxFilter = "needs_you" | "all" | "confirmations" | "rejections";

export const INBOX_FILTERS: ReadonlyArray<{ value: InboxFilter; label: string }> = [
  { value: "needs_you", label: "Needs you" },
  { value: "all", label: "All" },
  { value: "confirmations", label: "Confirmations" },
  { value: "rejections", label: "Rejections" },
];

export interface FilterableMessage {
  classification: string | null;
  next_action: string | null;
  verification_code: string | null;
  verification_code_expires_at: string | null;
}

const ACTION_CLASSIFICATIONS = new Set(["interview_invite", "take_home", "offer"]);

export function hasActiveCode(message: FilterableMessage, now: number): boolean {
  if (!message.verification_code) return false;
  if (!message.verification_code_expires_at) return true;
  return new Date(message.verification_code_expires_at).getTime() > now;
}

export function needsAttention(message: FilterableMessage, now: number): boolean {
  return ACTION_CLASSIFICATIONS.has(String(message.classification))
    || hasActiveCode(message, now)
    || Boolean(message.next_action && message.next_action.trim());
}

export function matchesInboxFilter(message: FilterableMessage, filter: InboxFilter, now: number): boolean {
  switch (filter) {
    case "needs_you":
      return needsAttention(message, now);
    case "confirmations":
      return message.classification === "confirmation";
    case "rejections":
      return message.classification === "reject";
    default:
      return true;
  }
}

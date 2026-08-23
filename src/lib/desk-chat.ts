/**
 * Home desk chat: tool-calling planner with hard product guardrails.
 * Never invents work history. Never marks submitted. Never applies unless
 * the user clicked Apply or hands-off is enabled.
 */

export type DeskToolName =
  | "search_matches"
  | "explain_match"
  | "apply_one_job"
  | "open_application"
  | "tune_hands_off"
  | "summarize_inbox"
  | "refuse";

export interface DeskToolCall {
  name: DeskToolName;
  args: Record<string, string>;
  reason: string;
}

const OFF_POLICY = /invent|make up|fabricate|lie|fake submit|mark (this |it |as )?submitted|apply to (india|uk|canada|europe)|sponsor fraud|work history that (i )?never/i;

export function planDeskTurn(input: string, context: { handsOffEnabled: boolean }): DeskToolCall {
  const text = input.trim();
  if (!text) return { name: "refuse", args: {}, reason: "Empty message." };
  if (OFF_POLICY.test(text)) {
    return { name: "refuse", args: {}, reason: "Off-policy: we do not invent history, fake submits, or leave the United States search." };
  }

  if (/hands-?off|daily cap|recipe|auto apply|scheduler/i.test(text)) {
    return { name: "tune_hands_off", args: { query: text }, reason: "Open hands-off controls." };
  }
  if (/inbox|email|verification|recruiter mail/i.test(text)) {
    return { name: "summarize_inbox", args: {}, reason: "Summarize recruiter inbox." };
  }
  if (/open (the )?application|show receipt|application #|status of/i.test(text)) {
    return { name: "open_application", args: { query: text }, reason: "Locate an application record." };
  }
  if (/why (this|that)? ?match|explain|fit score|how well/i.test(text)) {
    return { name: "explain_match", args: { query: text }, reason: "Explain a match from stored scores." };
  }
  if (/apply (this|that|to|one)|queue (this|that)|submit (this|that)/i.test(text)) {
    return { name: "apply_one_job", args: { query: text }, reason: "Queue one job only after an explicit apply intent." };
  }
  if (/match|jobs?|roles?|openings?|search/i.test(text)) {
    return { name: "search_matches", args: { query: text }, reason: "Search United States matches." };
  }
  return { name: "search_matches", args: { query: text }, reason: "Default to US match search." };
}

export function deskGuardrailCopy(call: DeskToolCall): string {
  if (call.name === "refuse") {
    return `${call.reason} I can search US matches, explain a score, queue a job you chose, open a receipt, tune hands-off, or summarize inbox mail.`;
  }
  return call.reason;
}

export function canAutoApplyFromChat(handsOffEnabled: boolean, explicitApply: boolean): boolean {
  return explicitApply || handsOffEnabled;
}

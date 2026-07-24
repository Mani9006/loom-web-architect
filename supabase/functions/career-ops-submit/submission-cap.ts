export interface SubmissionCapInput {
  submittedToday: number;
  activeReservedSlots: number;
  dailyLimit: number;
}

export interface SubmissionCapDecision {
  allowed: boolean;
  usedSlots: number;
  dailyLimit: number;
}

function wholeNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * A user's daily cap represents real submissions plus work that can still
 * become a submission. Completed skips, CAPTCHA handoffs, expired jobs, and
 * other non-submission outcomes never consume a customer submission slot.
 */
export function evaluateSubmissionCap(
  input: SubmissionCapInput,
): SubmissionCapDecision {
  const submittedToday = wholeNonNegative(input.submittedToday);
  const activeReservedSlots = wholeNonNegative(input.activeReservedSlots);
  const dailyLimit = Math.max(1, wholeNonNegative(input.dailyLimit));
  const usedSlots = submittedToday + activeReservedSlots;

  return {
    allowed: usedSlots < dailyLimit,
    usedSlots,
    dailyLimit,
  };
}

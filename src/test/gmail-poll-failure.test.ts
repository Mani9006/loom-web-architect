import { describe, expect, it } from "vitest";
import {
  classifyGmailPollFailure,
  gmailPollFailureHealth,
  gmailPollSuccessHealth,
} from "../../supabase/functions/_shared/gmail-poll-failure";

// Regression: a failed poll used to disable mc_gmail_connections rows on
// transient/server-side errors (decrypt, Gmail 401/403), making healthy
// Gmail connections "vanish" from the Inbox minutes after connecting.
// Only permanent OAuth-grant loss may be classified as reconnect-required.
describe("mc-gmail-poll failure classification", () => {
  it.each([
    ["secure_tokens_missing"],
    ["gmail_refresh_invalid_grant"],
  ])("treats permanent grant loss as reconnect-required: %s", (message) => {
    expect(classifyGmailPollFailure(message)).toBe("INBOX_RECONNECT_REQUIRED");
  });

  it.each([
    ["gmail_list_403"], // e.g. Gmail API not enabled for the OAuth client
    ["gmail_list_401"],
    ["gmail_list_500"],
    ["decrypt failed"],
    ["OperationError"],
    ["gmail_refresh_500"],
    ["gmail_refresh_incomplete"],
    ["TypeError: fetch failed"],
  ])("never disables the connection on transient/server errors: %s", (message) => {
    expect(classifyGmailPollFailure(message)).toBe("INBOX_CHECK_FAILED");
  });

  it("keeps rate limiting as its own non-fatal code", () => {
    expect(classifyGmailPollFailure("gmail_list_429")).toBe("INBOX_RATE_LIMITED");
  });

  it("clears stale errors and counters after a successful poll", () => {
    expect(gmailPollSuccessHealth()).toEqual({
      enabled: true,
      status: "connected",
      status_reason: null,
      last_error_code: null,
      last_error_at: null,
      consecutive_failures: 0,
    });
  });

  it("records a transient failure without disconnecting the user", () => {
    expect(gmailPollFailureHealth(
      "gmail_list_500",
      103,
      "2026-07-24T20:00:00.000Z",
    )).toEqual({
      code: "INBOX_CHECK_FAILED",
      update: {
        enabled: true,
        status: "degraded",
        status_reason: "Application inbox checks are temporarily delayed and will retry automatically.",
        last_error_code: "INBOX_CHECK_FAILED",
        last_error_at: "2026-07-24T20:00:00.000Z",
        consecutive_failures: 104,
      },
    });
  });

  it("records permanent grant loss as reconnect-required", () => {
    const health = gmailPollFailureHealth(
      "gmail_refresh_invalid_grant",
      0,
      "2026-07-24T20:00:00.000Z",
    );

    expect(health.code).toBe("INBOX_RECONNECT_REQUIRED");
    expect(health.update).toMatchObject({
      enabled: false,
      status: "disconnected",
      last_error_code: "INBOX_RECONNECT_REQUIRED",
      consecutive_failures: 1,
    });
    expect(health.update.status_reason).not.toContain("invalid_grant");
  });
});

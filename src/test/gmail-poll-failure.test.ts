import { describe, expect, it } from "vitest";
import { classifyGmailPollFailure } from "../../supabase/functions/_shared/gmail-poll-failure";

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
});

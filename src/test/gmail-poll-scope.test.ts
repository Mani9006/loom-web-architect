import { describe, expect, it } from "vitest";
import {
  boundedGmailPollLimit,
  optionalGmailPollUserId,
  requestedGmailPollLimit,
  requireGmailPollWorkspace,
} from "../../supabase/functions/_shared/gmail-poll-scope";

const SESSION_ID = "34ca0867-5b3f-4f8c-9be1-fd9f53ef0745";

describe("user-triggered Gmail polling scope", () => {
  it("requires one valid selected workspace", () => {
    expect(requireGmailPollWorkspace({ session_id: ` ${SESSION_ID} ` })).toEqual({
      ok: true,
      sessionId: SESSION_ID,
    });
    expect(requireGmailPollWorkspace({})).toEqual({ ok: false, code: "SESSION_REQUIRED" });
    expect(requireGmailPollWorkspace({ session_id: "not-a-uuid" })).toEqual({
      ok: false,
      code: "SESSION_INVALID",
    });
  });

  it("does not pass malformed service user filters to Postgres", () => {
    expect(optionalGmailPollUserId({ user_id: SESSION_ID })).toBe(SESSION_ID);
    expect(optionalGmailPollUserId({ user_id: "all-users" })).toBeNull();
  });

  it("caps cron and service batches", () => {
    expect(requestedGmailPollLimit({ limit: 10 })).toBe(10);
    expect(requestedGmailPollLimit({ limit: 10_000 })).toBe(25);
    expect(boundedGmailPollLimit(0)).toBe(1);
    expect(requestedGmailPollLimit({ limit: "bad" })).toBe(25);
  });
});

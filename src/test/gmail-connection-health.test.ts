import { describe, expect, it } from "vitest";
import { presentGmailConnectionHealth } from "@/lib/gmail-connection-health";

describe("Gmail connection presentation", () => {
  it("presents healthy connections as connected", () => {
    expect(presentGmailConnectionHealth({
      enabled: true,
      status: "connected",
      last_error_code: null,
    })).toMatchObject({
      kind: "connected",
      connected: true,
      canPoll: true,
    });
  });

  it("keeps degraded connections visible with safe retry wording", () => {
    const presentation = presentGmailConnectionHealth({
      enabled: true,
      status: "degraded",
      last_error_code: "GMAIL_API_NOT_CONFIGURED",
    });

    expect(presentation).toMatchObject({
      kind: "degraded",
      connected: true,
      canPoll: true,
    });
    expect(presentation.detail).not.toContain("API");
    expect(presentation.detail).not.toContain("configured");
  });

  it("asks for reconnect when the grant is disconnected", () => {
    expect(presentGmailConnectionHealth({
      enabled: false,
      status: "disconnected",
      last_error_code: "INBOX_RECONNECT_REQUIRED",
    })).toMatchObject({
      kind: "disconnected",
      connected: false,
      canPoll: false,
      badge: "Reconnect needed",
    });
  });

  it("fails unknown health states into a safe delayed state", () => {
    expect(presentGmailConnectionHealth({
      enabled: true,
      status: "unexpected",
      last_error_code: null,
    }).kind).toBe("degraded");
  });
});

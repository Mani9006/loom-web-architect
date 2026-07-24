// Failure classification for mc-gmail-poll.
//
// A failed poll must almost NEVER disable the connection: decrypt/key
// problems, Gmail 401/403 (including the Gmail API not being enabled for the
// OAuth client — a server configuration issue reconnecting can never fix),
// 5xx and network errors are all transient or ops-side. Flipping
// mc_gmail_connections.enabled=false on those errors made healthy
// connections "vanish" from the Inbox after the first failed poll.
//
// Only permanent OAuth-grant loss justifies disabling:
//   - secure_tokens_missing: the encrypted token row is gone
//   - gmail_refresh_invalid_grant: Google revoked/expired the refresh token
export type GmailPollFailureCode =
  | "INBOX_RECONNECT_REQUIRED"
  | "INBOX_RATE_LIMITED"
  | "INBOX_CHECK_FAILED";

export type GmailConnectionHealthStatus = "connected" | "degraded" | "disconnected";

export interface GmailConnectionHealthUpdate {
  enabled: boolean;
  status: GmailConnectionHealthStatus;
  status_reason: string | null;
  last_error_code: GmailPollFailureCode | null;
  last_error_at: string | null;
  consecutive_failures: number;
}

export interface GmailPollFailureHealth {
  code: GmailPollFailureCode;
  update: GmailConnectionHealthUpdate;
}

export function classifyGmailPollFailure(message: string): GmailPollFailureCode {
  if (/secure_tokens_missing|gmail_refresh_invalid_grant/i.test(message)) {
    return "INBOX_RECONNECT_REQUIRED";
  }
  if (/gmail_list_429/i.test(message)) return "INBOX_RATE_LIMITED";
  return "INBOX_CHECK_FAILED";
}

function nextFailureCount(current: unknown): number {
  const parsed = Number(current);
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.min(2_147_483_647, Math.floor(parsed) + 1);
}

export function gmailPollFailureHealth(
  message: string,
  currentFailures: unknown,
  failedAt: string,
): GmailPollFailureHealth {
  const code = classifyGmailPollFailure(message);
  const reconnectRequired = code === "INBOX_RECONNECT_REQUIRED";
  const statusReason = reconnectRequired
    ? "Reconnect Google to resume application inbox checks."
    : code === "INBOX_RATE_LIMITED"
      ? "Google asked us to pause briefly. Inbox checks will retry automatically."
      : "Application inbox checks are temporarily delayed and will retry automatically.";

  return {
    code,
    update: {
      enabled: !reconnectRequired,
      status: reconnectRequired ? "disconnected" : "degraded",
      status_reason: statusReason,
      last_error_code: code,
      last_error_at: failedAt,
      consecutive_failures: nextFailureCount(currentFailures),
    },
  };
}

export function gmailPollSuccessHealth(): GmailConnectionHealthUpdate {
  return {
    enabled: true,
    status: "connected",
    status_reason: null,
    last_error_code: null,
    last_error_at: null,
    consecutive_failures: 0,
  };
}

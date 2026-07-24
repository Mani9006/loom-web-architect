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

export function classifyGmailPollFailure(message: string): GmailPollFailureCode {
  if (/secure_tokens_missing|gmail_refresh_invalid_grant/i.test(message)) {
    return "INBOX_RECONNECT_REQUIRED";
  }
  if (/gmail_list_429/i.test(message)) return "INBOX_RATE_LIMITED";
  return "INBOX_CHECK_FAILED";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequiredWorkspaceScope =
  | { ok: true; sessionId: string }
  | { ok: false; code: "SESSION_REQUIRED" | "SESSION_INVALID" };

export function requireGmailPollWorkspace(body: unknown): RequiredWorkspaceScope {
  if (!body || typeof body !== "object") return { ok: false, code: "SESSION_REQUIRED" };
  const value = (body as Record<string, unknown>).session_id;
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, code: "SESSION_REQUIRED" };
  }
  const sessionId = value.trim();
  return UUID_PATTERN.test(sessionId)
    ? { ok: true, sessionId }
    : { ok: false, code: "SESSION_INVALID" };
}

export function optionalGmailPollUserId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>).user_id;
  if (typeof value !== "string" || !value.trim()) return null;
  const userId = value.trim();
  return UUID_PATTERN.test(userId) ? userId : null;
}

export function boundedGmailPollLimit(value: unknown, fallback = 25, maximum = 25): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(parsed)));
}

export function requestedGmailPollLimit(body: unknown): number {
  if (!body || typeof body !== "object") return boundedGmailPollLimit(undefined);
  return boundedGmailPollLimit((body as Record<string, unknown>).limit);
}

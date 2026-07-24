import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

import {
  getAuthHookSigningSecret,
  type SecretReader,
} from "./email-auth.ts";

/**
 * Verify a Supabase HTTP Auth Hook against the exact raw request bytes and
 * Standard Webhooks headers. Missing secrets, stale timestamps, malformed
 * headers, payload changes, and invalid signatures all fail closed.
 */
export function verifyAuthHookPayload(
  payload: string,
  headers: Headers,
  readSecret: SecretReader,
): unknown | null {
  const secret = getAuthHookSigningSecret(readSecret);
  if (!secret) return null;

  try {
    return new Webhook(secret).verify(
      payload,
      Object.fromEntries(headers.entries()),
    );
  } catch {
    return null;
  }
}

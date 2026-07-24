import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

import { verifyAuthHookPayload } from "./email-auth-webhook.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rawSecret = btoa("resume-preps-auth-hook-secret-32b");
const configuredSecret = `v1,whsec_${rawSecret}`;
const payload = JSON.stringify({
  user: { email: "candidate@example.test" },
  email_data: { token: "123456", email_action_type: "magiclink" },
});

function signedHeaders(body = payload): Headers {
  const messageId = "msg_resume_preps_test";
  const timestamp = new Date();
  const signature = new Webhook(rawSecret).sign(
    messageId,
    timestamp,
    body,
  );
  return new Headers({
    "webhook-id": messageId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  });
}

Deno.test("accepts a correctly signed Supabase Auth Hook payload", () => {
  const verified = verifyAuthHookPayload(
    payload,
    signedHeaders(),
    (name) => name === "SEND_EMAIL_HOOK_SECRET" ? configuredSecret : undefined,
  ) as { user?: { email?: string } } | null;

  assert(
    verified?.user?.email === "candidate@example.test",
    "expected the signed payload to verify",
  );
});

Deno.test("rejects payload tampering and missing configuration", () => {
  const headers = signedHeaders();
  const tampered = verifyAuthHookPayload(
    `${payload} `,
    headers,
    () => configuredSecret,
  );
  const unconfigured = verifyAuthHookPayload(payload, headers, () => undefined);

  assert(tampered === null, "expected modified raw bytes to be rejected");
  assert(unconfigured === null, "expected missing configuration to fail closed");
});

Deno.test("rejects a custom token header without Standard Webhooks proof", () => {
  const headers = new Headers({ "x-auth-hook-token": configuredSecret });
  const verified = verifyAuthHookPayload(payload, headers, () => configuredSecret);

  assert(verified === null, "expected an unsigned custom header to be rejected");
});

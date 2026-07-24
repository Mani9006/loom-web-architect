import { describe, expect, it } from "vitest";

import {
  getAuthHookSigningSecret,
  isAuthorizedDirectEmailRequest,
} from "../../supabase/functions/_shared/email-auth";

function secrets(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe("send-email authorization", () => {
  it("fails closed when the auth-hook signing secret is not configured", () => {
    expect(getAuthHookSigningSecret(secrets({}))).toBeNull();
  });

  it("normalizes the Supabase Standard Webhooks secret format", () => {
    expect(
      getAuthHookSigningSecret(
        secrets({ SEND_EMAIL_HOOK_SECRET: "v1,whsec_base64-value" }),
      ),
    ).toBe("base64-value");
    expect(
      getAuthHookSigningSecret(
        secrets({ AUTH_EMAIL_HOOK_SECRET: "legacy-base64-value" }),
      ),
    ).toBe("legacy-base64-value");
  });

  it("accepts an internal token or the service-role credential for direct sends", () => {
    const internal = new Request("https://example.test/send-email", {
      headers: { "x-internal-token": "internal-token" },
    });
    const service = new Request("https://example.test/send-email", {
      headers: { Authorization: "Bearer service-key" },
    });
    const readSecret = secrets({
      INTERNAL_EMAIL_TOKEN: "internal-token",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    });

    expect(isAuthorizedDirectEmailRequest(internal, readSecret)).toBe(true);
    expect(isAuthorizedDirectEmailRequest(service, readSecret)).toBe(true);
  });

  it("rejects unauthenticated direct sends", () => {
    const req = new Request("https://example.test/send-email");

    expect(
      isAuthorizedDirectEmailRequest(
        req,
        secrets({ SUPABASE_SERVICE_ROLE_KEY: "service-key" }),
      ),
    ).toBe(false);
  });
});

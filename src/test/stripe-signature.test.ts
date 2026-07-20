import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyStripeSignature } from "../../supabase/functions/_shared/stripe-signature";

describe("Stripe webhook signature verification", () => {
  const secret = "whsec_resume_preps_test";
  const timestamp = 1_800_000_000;
  const now = timestamp * 1000;
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test" } } });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

  it("accepts a current valid v1 signature", async () => {
    await expect(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, now)).resolves.toBe(true);
  });

  it("rejects a forged payload", async () => {
    await expect(verifyStripeSignature(`${payload}x`, `t=${timestamp},v1=${signature}`, secret, now)).resolves.toBe(false);
  });

  it("rejects signatures outside the replay window", async () => {
    await expect(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, now + 301_000)).resolves.toBe(false);
  });
});

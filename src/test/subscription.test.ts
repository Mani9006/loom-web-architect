import { describe, expect, it } from "vitest";
import { resolveSubscription } from "@/lib/subscription";

describe("subscription entitlement resolution", () => {
  it("defaults missing access controls to the free plan", () => {
    expect(resolveSubscription(null)).toEqual({
      plan: "free",
      status: "active",
      isPremium: false,
      hasAutoApply: false,
    });
  });

  it("recognizes a manually granted Pro account", () => {
    expect(resolveSubscription({
      account_status: "active",
      purchase_state: "manual",
      subscription_plan: "pro",
    })).toEqual({
      plan: "pro",
      status: "active",
      isPremium: true,
      hasAutoApply: false,
    });
  });

  it("keeps an active premium trial unlocked", () => {
    expect(resolveSubscription({
      account_status: "active",
      purchase_state: "trial",
      subscription_plan: "premium",
    })).toEqual({
      plan: "autopilot",
      status: "trialing",
      isPremium: true,
      hasAutoApply: true,
    });
  });

  it.each(["past_due", "canceled"])("locks a %s paid account", (purchaseState) => {
    expect(resolveSubscription({
      account_status: "active",
      purchase_state: purchaseState,
      subscription_plan: "premium",
    }).isPremium).toBe(false);
  });

  it("locks a blocked account even when its paid plan is active", () => {
    expect(resolveSubscription({
      account_status: "blocked",
      purchase_state: "active",
      subscription_plan: "premium",
    })).toEqual({
      plan: "free",
      status: "active",
      isPremium: false,
      hasAutoApply: false,
    });
  });

  it("unlocks cloud auto-apply only for the Autopilot entitlement", () => {
    expect(resolveSubscription({
      account_status: "active",
      purchase_state: "active",
      subscription_plan: "autopilot",
    })).toMatchObject({ plan: "autopilot", isPremium: true, hasAutoApply: true });
  });
});

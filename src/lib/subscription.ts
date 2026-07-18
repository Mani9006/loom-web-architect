export type SubscriptionPlan = "free" | "premium";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

export interface AccountAccessRecord {
  account_status?: string | null;
  purchase_state?: string | null;
  subscription_plan?: string | null;
}

export interface ResolvedSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isPremium: boolean;
}

const PAID_PURCHASE_STATES = new Set(["active", "manual", "trial"]);

/**
 * Resolve the customer-facing subscription from the same access-control row
 * used by server-side feature guards and the admin portal.
 */
export function resolveSubscription(
  access: AccountAccessRecord | null | undefined,
): ResolvedSubscription {
  if (!access) {
    return { plan: "free", status: "active", isPremium: false };
  }

  const accountStatus = (access.account_status || "active").trim().toLowerCase();
  const purchaseState = (access.purchase_state || "trial").trim().toLowerCase();
  const rawPlan = (access.subscription_plan || "free").trim().toLowerCase();
  const hasPaidPlan = rawPlan !== "" && rawPlan !== "free" && rawPlan !== "none";

  const status: SubscriptionStatus = purchaseState === "past_due"
    ? "past_due"
    : purchaseState === "canceled"
      ? "canceled"
      : purchaseState === "trial"
        ? "trialing"
        : "active";

  const isPremium = accountStatus === "active"
    && hasPaidPlan
    && PAID_PURCHASE_STATES.has(purchaseState);

  return {
    plan: isPremium ? "premium" : "free",
    status,
    isPremium,
  };
}

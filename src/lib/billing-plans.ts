export type BillingPlanId = "free" | "pro" | "autopilot";

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

/**
 * Customer-facing launch catalog. Server-side checkout keeps its own validated
 * price map so a client can never choose the amount it is charged.
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    description: "Build a trustworthy foundation before you scale applications.",
    features: [
      "1 source resume",
      "Public job search and tracker",
      "10 fit evaluations / month",
      "3 tailored application packets / month",
      "Manual portal apply",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: 39,
    period: "/month",
    description: "For a focused search with strong materials for every priority role.",
    features: [
      "Everything in Free",
      "100 fit evaluations / month",
      "30 tailored application packets / month",
      "Resume versions, ATS checks, and answer memory",
      "Cover letters, ATS evidence, and reusable answer memory",
    ],
    cta: "Choose Pro",
    popular: true,
  },
  {
    id: "autopilot",
    name: "Autopilot",
    price: 99,
    period: "/month",
    description: "A continuous application service with explicit controls and verified receipts.",
    features: [
      "Everything in Pro",
      "Up to 400 supported application attempts / week",
      "Up to 1,600 supported application attempts / month",
      "Greenhouse, Ashby, and Lever guarded submission",
      "Review before submit by default",
      "Prepared, queued, submitted, failed, and skipped states",
      "System failures refund application credits",
    ],
    cta: "Choose Autopilot",
  },
];

export function formatPlanPrice(price: number): string {
  return price === 0 ? "$0" : `$${price}`;
}

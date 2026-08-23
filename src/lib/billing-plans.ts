export type BillingPlanId = "free" | "starter" | "pro" | "autopilot";

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
 * Credit buckets for the apply engine. 1 credit = 1 successful portal submit.
 * System-side failures do not consume credit. Stripe promotion codes discount
 * the invoice, not the monthly bucket. These are not 500–600 applies/day.
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    description: "Build the packet. Live cloud submits need a paid credit bucket.",
    features: [
      "1 source resume",
      "Job matches and tracker",
      "Apply selected for detect-only ATS (Needs you, 0 credits)",
      "0 live-submit credits",
    ],
    cta: "Start free",
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    period: "/month",
    description: "A small live-submit bucket. Not hundreds of applies per day.",
    features: [
      "30 apply credits / month (1 credit = 1 successful submit)",
      "10 live submits / day",
      "8 in-flight live jobs",
      "Greenhouse, Lever, Ashby, Workable, Workday adapters",
      "Failed system-side submits do not consume credit",
    ],
    cta: "Choose Starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: 39,
    period: "/month",
    description: "More credits for a focused search. Same enqueue path, same receipts.",
    features: [
      "Everything in Starter",
      "80 apply credits / month",
      "20 live submits / day",
      "12 in-flight live jobs",
      "Multi-select Apply selected (up to 60 independent jobs)",
    ],
    cta: "Choose Pro",
    popular: true,
  },
  {
    id: "autopilot",
    name: "Autopilot",
    price: 99,
    period: "/month",
    description: "Hands-off scheduler uses the same enqueue path, with a kill switch.",
    features: [
      "Everything in Pro",
      "250 apply credits / month",
      "40 live submits / day",
      "16 in-flight live jobs",
      "Hourly or daily hands-off enqueue + kill switch",
      "Influencer codes = Stripe 50% off; credits still deduct 1:1",
    ],
    cta: "Choose Autopilot",
  },
];

export function formatPlanPrice(price: number): string {
  return price === 0 ? "$0" : `$${price}`;
}

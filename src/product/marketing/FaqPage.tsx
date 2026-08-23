import { MarketingLayout } from "./MarketingLayout";

const FAQS = [
  { q: "Do you apply outside the United States?", a: "No. Feeds, filters, and the assistant are US-only." },
  { q: "When is an application Submitted?", a: "Only after the worker records a portal receipt. Queued and filling are not submitted." },
  { q: "What do credits cost?", a: "One successful submit spends one credit. System failures refund. Stripe promo codes create invoices only." },
  { q: "Which ATS can you actually submit?", a: "Greenhouse, Lever, Ashby, Workable. Workday and Jobvite stay in Needs you." },
  { q: "Can the assistant apply for me?", a: "It can apply exactly one job, and only after you confirm in the chat. It cannot invent work history or enable hands-off without confirm." },
  { q: "What is hands-off apply?", a: "An explicit toggle with a shared daily cap, recipes, exclude-only instructions, and review-before-submit. The AI tuner previews first." },
];

export default function FaqPage() {
  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[720px] px-5 py-14">
        <h1 className="text-[36px] font-semibold tracking-[-0.03em]">FAQ</h1>
        <div className="mt-8 space-y-3">
          {FAQS.map((item) => (
            <details key={item.q} className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-[15px] font-medium">{item.q}</summary>
              <p className="mt-2 text-[13px] text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </main>
    </MarketingLayout>
  );
}

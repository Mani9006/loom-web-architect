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
      <main className="mx-auto max-w-3xl px-5 py-20">
        <p className="text-caption text-primary">Answers</p>
        <h1 className="mt-4 font-display text-5xl">FAQ</h1>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-6">
              <summary className="cursor-pointer font-display text-xl">{item.q}</summary>
              <p className="mt-3 text-body text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </main>
    </MarketingLayout>
  );
}

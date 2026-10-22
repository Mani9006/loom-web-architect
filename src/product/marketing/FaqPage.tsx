import { MarketingLayout } from "./MarketingLayout";
import { DeskPreview } from "./DeskPreview";

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
      <main className="mx-auto grid max-w-[1440px] gap-6 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_360px] 3xl:max-w-[1520px]">
        <div>
          <p className="rp-kicker">Answers</p>
          <h1 className="mt-2 font-display text-display-md">FAQ</h1>
          <div className="rp-panel-flush mt-6 divide-y divide-border">
            {FAQS.map((item) => (
              <details key={item.q} className="group px-4 py-3.5">
                <summary className="cursor-pointer text-[14px] font-semibold tracking-tight marker:text-primary">
                  {item.q}
                </summary>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <DeskPreview variant="receipt" />
        </aside>
      </main>
    </MarketingLayout>
  );
}

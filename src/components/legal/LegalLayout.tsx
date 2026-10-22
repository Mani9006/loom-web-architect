import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { PublicFrame } from "@/components/brand/PublicFrame";

export const LEGAL_EFFECTIVE_DATE = "August 23, 2026";
export const LEGAL_CONTACT_EMAIL = "support@resumepreps.com";

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-[24px] italic text-rp-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-rp-ink-2">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-rp-accent">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export default function LegalLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} — ResumePreps`; }, [title]);
  return (
    <PublicFrame>
      <main className="mx-auto max-w-[760px] px-6 py-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">Legal</p>
        <h1 className="mt-2 font-display text-[40px] italic leading-none">{title}</h1>
        <p className="mt-3 text-[14px] text-rp-ink-2">Effective {LEGAL_EFFECTIVE_DATE}. {subtitle}</p>
        {children}
        <div className="mt-12 rounded-lg border border-rp-ink/10 bg-rp-paper p-5 text-[14px] text-rp-ink-2">
          Questions: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Also see{" "}
          <Link to="/privacy">Privacy</Link> and <Link to="/terms">Terms</Link>.
        </div>
      </main>
    </PublicFrame>
  );
}

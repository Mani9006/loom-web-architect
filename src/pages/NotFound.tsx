import { Link } from "react-router-dom";
import { PublicFrame } from "@/components/brand/PublicFrame";

export default function NotFound() {
  return (
    <PublicFrame>
      <main className="mx-auto max-w-[640px] px-6 py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">404</p>
        <h1 className="mt-3 font-display text-[48px] italic">This page is not on the desk.</h1>
        <p className="mt-4 text-[16px] text-rp-ink-2">The URL may have moved into Job matches, Applications, or Home.</p>
        <div className="mt-8 flex gap-3">
          <Link to="/" className="rounded-md bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground no-underline">Marketing</Link>
          <Link to="/home" className="rounded-md border border-rp-ink/15 px-4 py-2.5 text-[13px] no-underline">Home</Link>
        </div>
      </main>
    </PublicFrame>
  );
}

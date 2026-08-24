import { Link } from "react-router-dom";
import { Mark } from "@/product/components/Mark";
import { SkipLink } from "@/product/ui/SkipLink";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SkipLink href="/" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-5">
          <Mark href="/" />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-5 py-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">404</p>
        <h1 className="mt-3 font-display text-display-md">Not found</h1>
        <p className="mt-4 max-w-md text-[15px] leading-7 text-muted-foreground">
          This route is not part of ResumePreps. Same night canvas as Home — not a leftover splash.
        </p>
        <div className="mt-8 flex gap-2">
          <Link to="/" className="rp-btn rp-btn-outline no-underline">
            Marketing
          </Link>
          <Link to="/home" className="rp-btn rp-btn-primary no-underline">
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}

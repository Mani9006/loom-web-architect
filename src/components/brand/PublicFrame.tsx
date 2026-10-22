import { Link, useLocation } from "react-router-dom";
import Logo from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/plans", label: "Plans" },
  { href: "/security", label: "Security" },
];

const footer = {
  Product: [
    { href: "/how-it-works", label: "Apply pipeline" },
    { href: "/plans", label: "Plans & credits" },
    { href: "/security", label: "Security" },
    { href: "/auth?mode=signup", label: "Create a desk" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/security", label: "Receipts & vault" },
  ],
  Desk: [
    { href: "/auth?mode=login", label: "Sign in" },
    { href: "/home", label: "Home" },
    { href: "/matches", label: "Job matches" },
    { href: "/applications", label: "Applications" },
  ],
};

export function PublicFrame({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-rp-canvas text-rp-ink">
      <header className="sticky top-0 z-40 border-b border-rp-ink/10 bg-rp-paper/92 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-6">
          <Link to="/" className="no-underline"><Logo size="sm" /></Link>
          <nav className="hidden items-center gap-7 md:flex">
            {nav.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "text-[13.5px] no-underline",
                  location.pathname === link.href ? "text-rp-ink" : "text-rp-ink-2 hover:text-rp-ink",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link to="/home" className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground no-underline">Open desk</Link>
            ) : (
              <>
                <Link to="/auth?mode=login" className="hidden px-3 py-2 text-[13px] text-rp-ink-2 no-underline hover:text-rp-ink sm:inline">Sign in</Link>
                <Link to="/auth?mode=signup" className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground no-underline">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-rp-ink/10 bg-rp-paper">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-6 py-14 md:grid-cols-4">
          <div>
            <Logo size="sm" />
            <p className="mt-4 max-w-[28ch] text-[13px] leading-relaxed text-rp-ink-2">
              United States job-application desk. Matches, tailored packets, cloud workers, and immutable receipts.
            </p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">US only · never fake submitted</p>
          </div>
          {Object.entries(footer).map(([title, links]) => (
            <div key={title}>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">{title}</p>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-[13.5px] text-rp-ink-2 no-underline hover:text-rp-ink">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-rp-ink/10">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[12px] text-rp-ink-3">
            <p>© 2026 ResumePreps. resumepreps.com</p>
            <p>support@resumepreps.com</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

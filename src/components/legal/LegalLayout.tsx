import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export const LEGAL_EFFECTIVE_DATE = "July 24, 2026";
export const LEGAL_CONTACT_EMAIL = "support@resumepreps.com";

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground/60">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function LegalLayout({ title, subtitle, children }: LegalLayoutProps) {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = `${title} — ResumePreps`;
  }, [title]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[12px] font-bold">R</div>
            <span className="text-[15px] font-semibold tracking-tight">ResumePreps</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/"
              className="h-9 px-3 rounded-md text-[13px] text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Back to home
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-[760px] mx-auto px-6 pt-14 pb-20">
        <p className="text-[12px] font-medium text-muted-foreground mb-2">Legal</p>
        <h1 className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground leading-[1.1]">{title}</h1>
        <p className="mt-3 text-[13.5px] text-muted-foreground">
          Effective date: {LEGAL_EFFECTIVE_DATE} · {subtitle}
        </p>
        <div className="mt-4 border-t border-border" />
        {children}

        <div className="mt-14 rounded-xl border border-border bg-card p-5">
          <p className="text-[13.5px] font-semibold text-foreground">Questions about this document?</p>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            Contact us at{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-2 hover:text-foreground/70">
              {LEGAL_CONTACT_EMAIL}
            </a>
            . You can also review our{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-2 hover:text-foreground/70">Privacy Policy</Link>
            {" "}and{" "}
            <Link to="/terms" className="text-foreground underline underline-offset-2 hover:text-foreground/70">Terms of Service</Link>
            {" "}at any time.
          </p>
        </div>
      </main>

      <footer className="border-t border-border py-10">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[12px] font-bold">R</div>
            <span className="text-[14px] font-semibold tracking-tight">ResumePreps</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
            <p className="text-[12px] text-muted-foreground">&copy; {new Date().getFullYear()} ResumePreps. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

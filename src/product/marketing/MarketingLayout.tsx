import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Wordmark } from "@/product/components/Mark";

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="liquid-nav sticky top-0 z-40">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-6 px-5">
          <Link to="/" className="no-underline"><Wordmark /></Link>
          <nav className="hidden md:flex items-center gap-5 text-[13px]">
            <Link to="/how-it-works" className="text-muted-foreground no-underline hover:text-foreground">How it works</Link>
            <Link to="/plans" className="text-muted-foreground no-underline hover:text-foreground">Plans</Link>
            <Link to="/faq" className="text-muted-foreground no-underline hover:text-foreground">FAQ</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={toggleTheme} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => navigate("/auth")} className="h-9 rounded-md px-3 text-[13px]">Sign in</button>
            <button type="button" onClick={() => navigate("/auth?mode=signup")} className="h-9 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground">Start</button>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-4 px-5 py-8 text-[12px] text-muted-foreground">
          <Wordmark />
          <span>US jobs only. Submitted means a receipt.</span>
          <div className="ml-auto flex gap-4">
            <Link to="/terms" className="no-underline hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="no-underline hover:text-foreground">Privacy</Link>
            <Link to="/faq" className="no-underline hover:text-foreground">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

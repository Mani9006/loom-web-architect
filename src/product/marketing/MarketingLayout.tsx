import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { Mark } from "@/product/components/Mark";
import { SkipLink } from "@/product/ui/SkipLink";

const LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/plans", label: "Plans" },
  { to: "/faq", label: "FAQ" },
];

export function MarketingLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-5 3xl:max-w-[1520px]">
          <Mark href="/" />
          <nav className="hidden items-center gap-6 md:flex">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-[13px] font-medium ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="rp-btn rp-btn-ghost"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {user ? (
              <NavLink to="/home" className="rp-btn rp-btn-primary no-underline">
                Open desk
              </NavLink>
            ) : (
              <>
                <NavLink to="/auth" className="rp-btn rp-btn-ghost hidden no-underline md:inline-flex">
                  Sign in
                </NavLink>
                <NavLink to="/auth?mode=signup" className="rp-btn rp-btn-primary no-underline">
                  Start
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <div id="main">{children ?? <Outlet />}</div>
      <footer className="border-t border-border" role="contentinfo">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[12px] text-muted-foreground 3xl:max-w-[1520px]">
          <p>© {new Date().getFullYear()} ResumePreps</p>
          <div className="flex gap-5">
            <NavLink to="/how-it-works" className="md:hidden">How it works</NavLink>
            <NavLink to="/plans" className="md:hidden">Plans</NavLink>
            <NavLink to="/privacy">Privacy</NavLink>
            <NavLink to="/terms">Terms</NavLink>
            <NavLink to="/status">Status</NavLink>
          </div>
        </div>
      </footer>
    </div>
  );
}

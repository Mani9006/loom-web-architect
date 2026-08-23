import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { Mark } from "@/product/components/Mark";

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
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Mark href="/" />
          <nav className="hidden items-center gap-6 md:flex">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-caption ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="border border-border p-2 text-muted-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {user ? (
              <NavLink to="/home" className="bg-primary px-4 py-2 text-caption text-primary-foreground">
                Open desk
              </NavLink>
            ) : (
              <>
                <NavLink to="/auth" className="hidden px-3 py-2 text-caption text-muted-foreground md:inline">
                  Sign in
                </NavLink>
                <NavLink to="/auth?mode=signup" className="bg-primary px-4 py-2 text-caption text-primary-foreground">
                  Start
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      {children ?? <Outlet />}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-caption text-muted-foreground">
          <p>© {new Date().getFullYear()} ResumePreps</p>
          <div className="flex gap-5">
            <NavLink to="/privacy">Privacy</NavLink>
            <NavLink to="/terms">Terms</NavLink>
            <NavLink to="/status">Status</NavLink>
          </div>
        </div>
      </footer>
    </div>
  );
}

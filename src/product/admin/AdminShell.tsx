import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { Activity, AlertTriangle, Flag, HeartPulse, Moon, Receipt, ScrollText, Sun, Users, UserSearch } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Mark } from "@/product/components/Mark";
import type { OperatorSession } from "@/product/lib/company-ops";
import { ROLE_LABELS } from "@/lib/operator-roles";
import { SkipLink } from "@/product/ui/SkipLink";

const LINKS = [
  { to: "/admin", label: "Overview", end: true, icon: Activity },
  { to: "/admin/team", label: "Team", icon: Users },
  { to: "/admin/users", label: "Users", icon: UserSearch },
  { to: "/admin/codes", label: "Billing", icon: Receipt },
  { to: "/admin/errors", label: "Errors", icon: AlertTriangle },
  { to: "/admin/health", label: "Health", icon: HeartPulse },
  { to: "/admin/flags", label: "Flags", icon: Flag },
  { to: "/admin/audit", label: "Audit", icon: ScrollText },
];

export function AdminShell() {
  const session = useOutletContext<OperatorSession>();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SkipLink />
      <aside className="hidden w-[212px] shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <Mark href="/home" />
        </div>
        <p className="px-4 pt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Company</p>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] ${
                  isActive ? "bg-muted font-medium text-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`
              }
            >
              <link.icon className="h-3.5 w-3.5" />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between gap-3 border-b border-border bg-background/88 px-4 backdrop-blur-md">
          <div className="flex items-center gap-3 lg:hidden">
            <Mark href="/home" compact />
          </div>
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="hidden truncate sm:inline">{session.member.email}</span>
            <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-primary">
              {ROLE_LABELS[session.member.role]}
            </span>
            <button type="button" onClick={toggleTheme} className="rp-btn rp-btn-ghost" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] ${
                  isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`
              }
            >
              <link.icon className="h-3.5 w-3.5" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="min-h-0 min-w-0 flex-1 px-4 py-4 sm:px-5">
          <Outlet context={session} />
        </main>
      </div>
    </div>
  );
}

export default AdminShell;

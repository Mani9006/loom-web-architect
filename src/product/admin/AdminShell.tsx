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
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6 3xl:max-w-[1520px]">
          <div className="flex items-center gap-4">
            <Mark href="/home" />
            <span className="hidden h-4 w-px bg-border sm:block" />
            <p className="text-[12px] font-medium text-muted-foreground">Company</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="hidden truncate sm:inline">{session.member.email}</span>
            <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-primary">
              {ROLE_LABELS[session.member.role]}
            </span>
            <button type="button" onClick={toggleTheme} className="rp-btn rp-btn-ghost" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)] 3xl:max-w-[1520px]">
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:block lg:overflow-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] ${
                  isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`
              }
            >
              <link.icon className="h-3.5 w-3.5" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="min-w-0 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet context={session} />
        </main>
      </div>
    </div>
  );
}

export default AdminShell;

import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Mark } from "@/product/components/Mark";
import type { OperatorSession } from "@/product/lib/company-ops";
import { ROLE_LABELS } from "@/lib/operator-roles";

const LINKS = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/team", label: "Team" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/errors", label: "Errors" },
  { to: "/admin/health", label: "Health" },
  { to: "/admin/codes", label: "Codes" },
  { to: "/admin/flags", label: "Flags" },
  { to: "/admin/audit", label: "Audit" },
];

export function AdminShell() {
  const session = useOutletContext<OperatorSession>();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Mark href="/home" />
            <p className="text-caption text-muted-foreground">Company</p>
          </div>
          <div className="flex items-center gap-3 text-caption text-muted-foreground">
            <span>{session.member.email}</span>
            <span className="text-primary">{ROLE_LABELS[session.member.role]}</span>
            <button type="button" onClick={toggleTheme} className="border border-border p-2" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-5 pb-3">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `text-caption ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">
        <Outlet context={session} />
      </main>
    </div>
  );
}

export default AdminShell;

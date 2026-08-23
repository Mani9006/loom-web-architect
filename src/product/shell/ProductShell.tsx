import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Briefcase,
  CircleHelp,
  CreditCard,
  FileText,
  Home,
  Inbox,
  Layers,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { db } from "@/product/lib/table";
import { Mark } from "@/product/components/Mark";
import { AssistantDrawer } from "@/product/assistant/AssistantDrawer";

const NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/matches", label: "Job matches", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: Layers },
  { to: "/inbox", label: "Recruiter inbox", icon: Inbox },
  { to: "/pipeline", label: "Pipeline", icon: MessageSquare },
  { to: "/apply", label: "Hands-off apply", icon: Sparkles },
  { to: "/resume", label: "My resume", icon: FileText },
  { to: "/people", label: "People", icon: Users },
  { to: "/notes", label: "Notes", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_TABS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/matches", label: "Matches", icon: Briefcase },
  { to: "/applications", label: "Apps", icon: Layers },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/apply", label: "Apply", icon: Sparkles },
];

function CreditPill() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["credits", user?.id],
    queryFn: async () => {
      const { data: row } = await db("credit_balances")
        .select("balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (row as { balance?: number } | null)?.balance ?? 0;
    },
    enabled: Boolean(user?.id),
  });
  return (
    <div className="flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-caption">
      <CreditCard className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">Credits</span>
      <span className="font-mono text-foreground">{data ?? "—"}</span>
    </div>
  );
}

export function ProductShell() {
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <button type="button" className="md:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Mark href="/home" />
            <nav className="hidden items-center gap-5 lg:flex">
              {NAV.slice(0, 6).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `text-caption ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <CreditPill />
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="hidden items-center gap-2 border border-border px-3 py-1.5 text-caption text-muted-foreground hover:border-primary hover:text-foreground md:inline-flex"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Ask
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="hidden items-center gap-2 border border-border px-3 py-1.5 text-caption text-muted-foreground hover:text-foreground md:inline-flex"
            >
              <CircleHelp className="h-3.5 w-3.5" />
              Help
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="hidden border border-border px-3 py-1.5 text-caption text-muted-foreground hover:text-foreground md:inline-block"
            >
              Company
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="border border-border p-2 text-muted-foreground hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="border border-border p-2 text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Mark />
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="grid gap-1 p-4">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 text-body ${isActive ? "bg-card text-foreground" : "text-muted-foreground"}`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 py-10 pb-24 md:pb-12">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background md:hidden">
        {MOBILE_TABS.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-[0.14em] ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-4 md:items-center">
          <div className="w-full max-w-md border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Help</h2>
              <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close help">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-body text-muted-foreground">
              ResumePreps searches United States roles, writes a truthful application, and only marks Submitted after
              the worker returns a receipt.
            </p>
            <button
              type="button"
              onClick={() => {
                setHelpOpen(false);
                setAssistantOpen(true);
              }}
              className="mt-5 inline-flex items-center gap-2 bg-primary px-4 py-2 text-caption text-primary-foreground"
            >
              Ask the assistant
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}

export default ProductShell;

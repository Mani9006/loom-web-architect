import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Briefcase, CircleHelp, CreditCard, Inbox, LayoutGrid, LogOut, Moon, Network,
  NotebookPen, Settings, Sparkles, Sun, UserRound, Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { useTheme } from "@/hooks/use-theme";
import { isOwnerEmail } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/product/components/Mark";
import { useCredits } from "@/product/hooks/useCredits";
import { AssistantDrawer } from "@/product/assistant/AssistantDrawer";
import { db } from "@/product/lib/table";

const NAV = [
  { to: "/home", label: "Home" },
  { to: "/matches", label: "Job matches" },
  { to: "/applications", label: "Applications" },
  { to: "/inbox", label: "Recruiter inbox" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/hands-off", label: "Hands-off apply" },
  { to: "/resume", label: "My resume" },
  { to: "/people", label: "People" },
  { to: "/notes", label: "Notes" },
  { to: "/settings", label: "Settings" },
];

const MOBILE = [
  { to: "/home", label: "Home", icon: LayoutGrid },
  { to: "/matches", label: "Matches", icon: Briefcase },
  { to: "/applications", label: "Apps", icon: Inbox },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/pipeline", label: "Pipe", icon: Network },
];

export default function ProductShell() {
  const { user, signOut } = useAuth();
  const { plan } = useSubscription();
  const { theme, toggleTheme } = useTheme();
  const { balance } = useCredits();
  const navigate = useNavigate();
  const location = useLocation();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!user) return;
    db().from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setName((data as { full_name?: string } | null)?.full_name || user.email?.split("@")[0] || "You"));
  }, [user]);

  useEffect(() => {
    if (location.search.includes("assistant=1")) setAssistantOpen(true);
  }, [location.search]);

  if (!user) return null;
  const owner = isOwnerEmail(user.email);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="liquid-nav sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4">
          <Link to="/home" className="shrink-0 no-underline">
            <Wordmark />
          </Link>
          <nav className="hidden xl:flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn(
                  "whitespace-nowrap rounded-md px-2 py-1.5 text-[12.5px] no-underline transition-colors",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate("/plans")}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-2.5 text-[12px] font-medium text-primary"
              title="Application credits"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span className="tabular-nums">{balance ?? "—"}</span>
              <span className="hidden sm:inline text-primary/70">credits</span>
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium hover:border-primary/30"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Assistant
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Help">
              <CircleHelp className="h-4 w-4" />
            </button>
            <button type="button" onClick={toggleTheme} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className="inline-flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-muted">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {name.slice(0, 1).toUpperCase()}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-elevated">
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground truncate">{user.email}</p>
                  <p className="px-2 pb-1 text-[11px] capitalize text-muted-foreground">{plan} plan</p>
                  <Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] no-underline hover:bg-muted">
                    <Settings className="h-3.5 w-3.5" /> Settings
                  </Link>
                  <Link to="/plans" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] no-underline hover:bg-muted">
                    <Zap className="h-3.5 w-3.5" /> Plans
                  </Link>
                  {owner && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] no-underline hover:bg-muted">
                      <UserRound className="h-3.5 w-3.5" /> Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={async () => { await signOut(); navigate("/auth"); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="xl:hidden border-t border-border overflow-x-auto">
          <div className="flex min-w-max px-2 py-1 gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn(
                  "whitespace-nowrap rounded-md px-2 py-1 text-[12px] no-underline",
                  isActive ? "text-primary font-medium" : "text-muted-foreground",
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="pb-16 xl:pb-0">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {MOBILE.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link key={item.to} to={item.to} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] no-underline", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      {assistantOpen && <button type="button" className="fixed inset-0 z-50 bg-black/20" aria-label="Close assistant overlay" onClick={() => setAssistantOpen(false)} />}

      {helpOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setHelpOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold">Help</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li>US roles only. Non-US postings are filtered out.</li>
              <li>Submitted requires a worker receipt. We never invent that state.</li>
              <li>One successful submit costs one credit. System failures refund.</li>
              <li>Unsupported ATS (Workday, Jobvite, …) stay in Needs you.</li>
              <li>The assistant can apply one job only after you confirm in chat.</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <Link to="/how-it-works" className="text-[13px] text-primary" onClick={() => setHelpOpen(false)}>How it works</Link>
              <Link to="/faq" className="text-[13px] text-primary" onClick={() => setHelpOpen(false)}>FAQ</Link>
              <Link to="/notes" className="ml-auto inline-flex items-center gap-1 text-[13px] text-muted-foreground" onClick={() => setHelpOpen(false)}>
                <NotebookPen className="h-3.5 w-3.5" /> Notes
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

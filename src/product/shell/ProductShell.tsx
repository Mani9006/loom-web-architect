import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
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
import { SkipLink } from "@/product/ui/SkipLink";
import { Dialog } from "@/product/ui/Overlay";

const NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/matches", label: "Job matches", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: Layers },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/pipeline", label: "Pipeline", icon: MessageSquare },
  { to: "/apply", label: "Hands-off", icon: Sparkles },
];

const MORE = [
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
    <div className="hidden h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[12px] sm:inline-flex">
      <CreditCard className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">Credits</span>
      <span className="font-mono tabular-nums text-foreground">{data ?? "—"}</span>
    </div>
  );
}

export function ProductShell() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 3xl:max-w-[1520px]">
          <div className="flex min-w-0 items-center gap-6">
            <button type="button" className="rp-btn rp-btn-ghost lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Mark href="/home" />
            <nav className="hidden items-center gap-5 lg:flex">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="rp-nav-link"
                  data-active={location.pathname.startsWith(item.to) || undefined}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditPill />
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="rp-btn rp-btn-outline hidden md:inline-flex"
            >
              <Sparkles className="text-primary" />
              Ask
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rp-btn rp-btn-ghost hidden md:inline-flex"
              aria-label="Help"
            >
              <CircleHelp />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="rp-btn rp-btn-outline max-w-[160px] truncate"
                aria-expanded={accountOpen}
              >
                {user?.email?.split("@")[0] || "Account"}
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {MORE.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setAccountOpen(false);
                        navigate(item.to);
                      }}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate("/admin");
                    }}
                  >
                    Company
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={toggleTheme}
                  >
                    {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-destructive hover:bg-destructive/10"
                    onClick={() => void signOut()}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background lg:hidden">
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <Mark />
            <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="grid gap-0.5 p-3">
            {[...NAV, ...MORE].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] ${isActive ? "bg-muted text-foreground" : "text-muted-foreground"}`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <div className="rp-desk-frame">
        <main id="main" className="rp-desk">
          <Outlet />
        </main>
        <aside className="rp-rail p-4">
          <p className="rp-kicker">Activity</p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            US matches, packets, and recruiter mail stay on this desk. Submitted still waits for a worker receipt.
          </p>
          <button type="button" className="rp-btn rp-btn-outline mt-4 w-full" onClick={() => setAssistantOpen(true)}>
            <Sparkles className="text-primary" />
            Open assistant
          </button>
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur md:hidden">
        {MOBILE_TABS.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Help"
        subtitle="ResumePreps searches United States roles, writes a truthful application, and only marks Submitted after the worker returns a receipt."
      >
        <button
          type="button"
          className="rp-btn rp-btn-primary"
          onClick={() => {
            setHelpOpen(false);
            setAssistantOpen(true);
          }}
        >
          Ask the assistant
        </button>
      </Dialog>

      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}

export default ProductShell;

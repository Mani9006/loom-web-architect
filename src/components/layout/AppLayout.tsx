import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bot, Columns3, Home, Inbox, KanbanSquare, LogOut, Menu, Search, Settings, Sparkles, FileText, UserRound, X,
} from "lucide-react";

import { CreditBalance } from "@/components/apply/CreditBalance";
import Logo from "@/components/shared/Logo";
import { useSubscription } from "@/components/SubscriptionGate";
import { useAuth } from "@/contexts/AuthContext";
import { useApplyCredits } from "@/hooks/use-apply-credits";
import { useIsMobile } from "@/hooks/use-mobile";
import { isOwnerEmail } from "@/lib/admin";
import { creditPlanLabel } from "@/lib/apply-credits";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const mainNav = [
  { label: "Home", path: "/home", icon: Home },
  { label: "Job matches", path: "/matches", icon: Sparkles },
  { label: "Hands-off apply", path: "/agent", icon: Bot },
  { label: "Applications", path: "/applications", icon: Columns3 },
  { label: "Recruiter inbox", path: "/inbox", icon: Inbox },
  { label: "Pipeline", path: "/pipeline", icon: KanbanSquare },
  { label: "Research", path: "/research", icon: Search },
  { label: "My resume", path: "/resume-builder", icon: FileText },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut } = useAuth();
  const { plan } = useSubscription();
  const { snapshot: credits } = useApplyCredits();
  const [displayName, setDisplayName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setDisplayName(data?.full_name || user.email?.split("@")[0] || "You"); });
  }, [user]);

  if (!user) return null;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const rail = (
    <nav className="flex flex-col gap-0.5 p-3">
      {mainNav.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => go(item.path)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px]",
              isActive(item.path) ? "bg-primary text-primary-foreground" : "text-rp-ink-2 hover:bg-rp-paper-2 hover:text-rp-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </button>
        );
      })}
      <div className="mt-4 border-t border-rp-ink/10 pt-3">
        <button type="button" onClick={() => go("/profile")} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px]", isActive("/profile") ? "bg-primary text-primary-foreground" : "text-rp-ink-2 hover:bg-rp-paper-2")}>
          <UserRound className="h-4 w-4" strokeWidth={1.75} /> Profile
        </button>
        <button type="button" onClick={() => go("/settings")} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px]", isActive("/settings") ? "bg-primary text-primary-foreground" : "text-rp-ink-2 hover:bg-rp-paper-2")}>
          <Settings className="h-4 w-4" strokeWidth={1.75} /> Settings
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-rp-canvas text-rp-ink">
      <header className="sticky top-0 z-40 border-b border-rp-ink/10 bg-rp-paper">
        <div className="flex h-14 items-center gap-3 px-4">
          <button type="button" className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Open navigation">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => go("/home")} aria-label="Home"><Logo size="sm" /></button>
          <div className="ml-auto flex items-center gap-4">
            <CreditBalance snapshot={credits} compact />
            <button type="button" onClick={() => go("/profile")} className="hidden text-right sm:block">
              <p className="text-[11px] uppercase tracking-[0.12em] text-rp-ink-3">{creditPlanLabel(plan)}</p>
              <p className="max-w-[160px] truncate text-[13px] font-medium">{displayName}</p>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-56 shrink-0 border-r border-rp-ink/10 bg-rp-paper lg:block">
          {rail}
          <div className="absolute inset-x-0 bottom-0 border-t border-rp-ink/10 p-3">
            {isOwnerEmail(user.email) && (
              <button type="button" onClick={() => go("/admin")} className="mb-1 w-full rounded-md px-3 py-2 text-left text-[12px] text-rp-ink-3">Admin</button>
            )}
            <button type="button" onClick={async () => { await signOut(); navigate("/auth"); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-destructive">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        {(isMobile || open) && open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-rp-ink/30" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-64 bg-rp-paper shadow-xl">{rail}</aside>
          </div>
        )}

        <main className="min-h-[calc(100vh-56px)] min-w-0 flex-1 px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

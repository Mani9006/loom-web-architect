/**
 * App shell — editorial redesign.
 *
 * Aesthetic: think a printed broadsheet that happens to be interactive.
 *   - Paper sidebar with hairline rules in light and dark themes.
 *   - Wordmark in EB Garamond, headline-weight, italic-leaning.
 *   - Nav items as a typographic list (not buttons / pills) — active
 *     state is a left ink rule + heavier weight, not a filled background.
 *   - Section labels are small caps with tracking, with a hairline rule.
 *   - Upgrade module reads like a tear-out box from the back of a magazine.
 *   - Header crumb in mono small caps; page title space is intentionally
 *     restrained — we let the page below own the display typography.
 *
 * The shell follows one clear journey: find, match, apply, then prepare.
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Home, FileText, Search, Bot, Columns3, Sparkles, Map,
  ShieldCheck, Crown, LogOut, Settings,
  User as UserIcon, Menu, X, PanelLeftClose, PanelLeft,
  HelpCircle, Sun, Moon, BookOpen, MessageSquare, CreditCard,
  ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerEmail } from "@/lib/admin";
import AnuChat from "@/components/AnuChat";
import { useTheme } from "@/hooks/use-theme";
import { useSubscription } from "@/components/SubscriptionGate";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
}

const mainNav: NavItem[] = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Job Search", icon: Search, path: "/job-search" },
  { label: "Matches", icon: Sparkles, path: "/matches" },
  { label: "Applications", icon: Columns3, path: "/job-tracker" },
  { label: "Resume", icon: FileText, path: "/resume-builder" },
  { label: "Agent", icon: Bot, path: "/agent" },
];

const ownerOnlyTools: NavItem[] = [
  { label: "Market Map", icon: Map, path: "/market-domination-map" },
  { label: "Control Center", icon: ShieldCheck, path: "/control-center" },
  { label: "Admin Portal", icon: Crown, path: "/admin" },
  { label: "Feature Flags", icon: Settings, path: "/admin/flags" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 mt-6 mb-1.5">
      <span
        className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-rp-ink/45"
        style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
      >
        {children}
      </span>
      <span className="flex-1 h-px bg-rp-ink/[0.08]" />
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { plan, hasAutoApply, loading: subscriptionLoading } = useSubscription();
  const [displayName, setDisplayName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("sidebar") !== "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anuOpen, setAnuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setDisplayName(data?.full_name || user.email?.split("@")[0] || "User"); });
  }, [user]);

  useEffect(() => {
    localStorage.setItem("sidebar", sidebarOpen ? "expanded" : "collapsed");
  }, [sidebarOpen]);

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };
  const handleNavigate = (path: string) => { navigate(path); if (isMobile) setMobileOpen(false); };
  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    e.preventDefault();
    handleNavigate(path);
  };
  const isActive = (path: string) => {
    const [pathname] = path.split("?");
    return location.pathname === pathname;
  };
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  if (!user) return null;
  const showText = isMobile || sidebarOpen;
  const hasAdminAccess = isOwnerEmail(user.email) || isAdmin;
  const visibleOwnerTools = hasAdminAccess ? ownerOnlyTools : [];
  const planLabel = plan === "autopilot" ? "Autopilot" : plan === "pro" ? "Pro" : "Free";
  const primaryAction = hasAutoApply
    ? { label: "Open Agent", path: "/agent" }
    : { label: "Find jobs", path: "/job-search" };

  const allNav = [...mainNav, ...visibleOwnerTools];
  const current = allNav.find((n) => isActive(n.path));
  const crumb = current?.label ?? "";

  // ── Nav item ───────────────────────────────────────────────────────────
  const NavButton = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <a
        href={item.path}
        onClick={(e) => handleLinkClick(e, item.path)}
        title={!showText ? item.label : undefined}
        className={cn(
          "group relative flex items-center gap-3 h-10 transition-colors no-underline rounded-md",
          showText ? "mx-2 px-3" : "mx-2 px-2 justify-center",
          active
            ? "bg-rp-paper-2 text-rp-ink"
            : "text-rp-ink/60 hover:bg-rp-paper-2/60 hover:text-rp-ink",
        )}
      >
        {/* Active rule — a thin vertical ink mark instead of a filled background */}
        {showText && (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-colors",
              active ? "bg-rp-accent" : "bg-transparent",
            )}
          />
        )}
        <Icon
          className={cn("w-[15px] h-[15px] shrink-0 transition-colors")}
          strokeWidth={active ? 2 : 1.6}
        />
        {showText && (
          <>
            <span
              className={cn(
                "flex-1 text-left truncate text-[12.5px] tracking-[-0.01em] transition-[font-weight]",
                active ? "font-semibold" : "font-normal",
              )}
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              {item.label}
            </span>
            {item.badge && (
              <span
                className="text-[9px] uppercase tracking-[0.12em] font-medium px-1.5 py-px rounded-sm bg-rp-ink/[0.06] text-rp-ink/70"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </a>
    );
  };

  const sidebarContent = (
    <aside
      className={cn(
        "flex flex-col shrink-0 h-full transition-[width] duration-200 border-r border-rp-rule",
        "bg-rp-paper",
        isMobile ? "w-[280px]" : sidebarOpen ? "w-[240px]" : "w-[64px]",
      )}
    >
      {/* Brand row */}
      <div className={cn("h-16 flex items-center", showText ? "px-4" : "px-2 justify-center")}>
        <a
          href="/home"
          onClick={(e) => handleLinkClick(e, "/home")}
          className="flex items-center gap-2.5 no-underline group"
        >
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-[26px] h-[26px] bg-rp-ink text-rp-paper rounded-[3px] font-semibold leading-none"
            style={{ fontFamily: '"Manrope", "Inter", system-ui, sans-serif', fontSize: "16px", paddingTop: "1px" }}
          >
            R
          </span>
          {showText && (
            <span
              className="text-rp-ink leading-none"
              style={{
                fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                fontSize: "20px",
                letterSpacing: "-0.005em",
                fontStyle: "italic",
                fontWeight: 500,
              }}
            >
              ResumePreps
            </span>
          )}
        </a>
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1.5 text-rp-ink/45 hover:text-rp-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="h-px bg-rp-rule mx-4" />

      <nav className="flex-1 overflow-y-auto py-2">
        {showText && <SectionLabel>Your workflow</SectionLabel>}
        {mainNav.map((i) => <NavButton key={i.path} item={i} />)}

        {visibleOwnerTools.length > 0 && (
          <>
            {showText && <SectionLabel>Admin</SectionLabel>}
            {visibleOwnerTools.map((i) => <NavButton key={i.path} item={i} />)}
          </>
        )}
      </nav>

      {/* Compact upgrade prompt only for free accounts. */}
      {showText && !hasAdminAccess && !subscriptionLoading && plan === "free" && (
        <div className="px-3 pb-3">
          <button
            onClick={() => navigate("/pricing")}
            className="w-full text-left p-3.5 border border-rp-ink/[0.15] hover:border-rp-ink/40 transition-colors bg-rp-paper relative group"
            style={{
              backgroundImage: "linear-gradient(180deg, rgba(180,83,9,0.04) 0%, rgba(180,83,9,0) 100%)",
            }}
          >
            <div
              className="text-[9px] uppercase tracking-[0.2em] text-rp-accent mb-1.5"
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              Upgrade · No. 01
            </div>
            <div
              className="text-rp-ink leading-tight"
              style={{
                fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                fontSize: "16px",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              Let ResumePreps do the repetitive work.
            </div>
            <div
              className="text-[11px] text-rp-ink/55 mt-1.5 leading-snug"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Per-job tailoring, supervised auto-apply, and one application record.
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span
                className="text-[10.5px] uppercase tracking-[0.14em] text-rp-ink/70 font-medium"
                style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
              >
                See pricing
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-rp-ink/45 group-hover:text-rp-accent transition-colors" strokeWidth={1.75} />
            </div>
          </button>
        </div>
      )}

      <div className={cn("border-t border-rp-rule h-12 flex items-center", showText ? "px-4" : "justify-center")}>
        <span className="inline-flex items-center gap-2 text-[11px] text-rp-ink/55" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          {showText ? `${planLabel} plan · ready` : <span className="sr-only">{planLabel} plan ready</span>}
        </span>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-rp-canvas">
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-rp-ink/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50">{sidebarContent}</div>
        </div>
      )}

      {!isMobile && sidebarContent}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-3 px-4 sm:px-5 border-b border-rp-rule bg-rp-canvas/95 backdrop-blur-sm shrink-0">
          {isMobile ? (
            <button onClick={() => setMobileOpen(true)} className="p-1.5 text-rp-ink/55 hover:text-rp-ink">
              <Menu className="w-[18px] h-[18px]" strokeWidth={1.6} />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 text-rp-ink/55 hover:text-rp-ink transition-colors">
              {sidebarOpen ? <PanelLeftClose className="w-[16px] h-[16px]" strokeWidth={1.6} /> : <PanelLeft className="w-[16px] h-[16px]" strokeWidth={1.6} />}
            </button>
          )}
          {crumb && (
            <>
              <div className="w-px h-3.5 bg-rp-rule" />
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-rp-ink/55"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {crumb}
              </span>
            </>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <a
              href={primaryAction.path}
              onClick={(e) => handleLinkClick(e, primaryAction.path)}
              className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 mr-1 rounded-md bg-rp-ink text-rp-canvas hover:opacity-85 transition-opacity no-underline text-[11.5px] font-medium"
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              {hasAutoApply ? <Sparkles className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
              {primaryAction.label}
            </a>
            <button
              onClick={() => setAnuOpen((v) => !v)}
              aria-pressed={anuOpen}
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] transition-colors",
                anuOpen
                  ? "bg-rp-ink text-rp-paper"
                  : "text-rp-ink/55 hover:text-rp-ink",
              )}
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.6} />
              Ask
            </button>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-rp-ink/55 hover:bg-rp-paper-2 hover:text-rp-ink transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" strokeWidth={1.6} /> : <Moon className="w-4 h-4" strokeWidth={1.6} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-rp-ink/15 text-rp-ink hover:border-rp-ink/45 transition-colors leading-none"
                  style={{ fontFamily: '"Manrope", "Inter", system-ui, sans-serif', fontSize: "12px", paddingTop: "1px" }}
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-md p-1.5">
                <div className="px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-foreground leading-tight">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer rounded-md gap-2">
                  <UserIcon className="w-4 h-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/home")} className="cursor-pointer rounded-md gap-2">
                  <Home className="w-4 h-4" /> Home
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/career-ops/preferences")} className="cursor-pointer rounded-md gap-2">
                  <Settings className="w-4 h-4" /> Preferences
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/pricing")} className="cursor-pointer rounded-md gap-2">
                  <CreditCard className="w-4 h-4" /> Plan & billing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/docs")} className="cursor-pointer rounded-md gap-2">
                  <BookOpen className="w-4 h-4" /> Help & docs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/feedback")} className="cursor-pointer rounded-md gap-2">
                  <MessageSquare className="w-4 h-4" /> Send feedback
                </DropdownMenuItem>
                {hasAdminAccess && (
                  <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer rounded-md gap-2">
                    <Crown className="w-4 h-4" /> Admin Portal
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer rounded-md gap-2 text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 bg-rp-canvas">
          <Outlet />
        </main>
      </div>

      <AnuChat open={anuOpen} onClose={() => setAnuOpen(false)} />
    </div>
  );
}

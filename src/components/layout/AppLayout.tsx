/**
 * App shell — editorial redesign.
 *
 * Aesthetic: think a printed broadsheet that happens to be interactive.
 *   - Paper-colored sidebar (#FAFAF7) with hairline rule, not a card.
 *   - Wordmark in EB Garamond, headline-weight, italic-leaning.
 *   - Nav items as a typographic list (not buttons / pills) — active
 *     state is a left ink rule + heavier weight, not a filled background.
 *   - Section labels are small caps with tracking, with a hairline rule.
 *   - Upgrade module reads like a tear-out box from the back of a magazine.
 *   - Header crumb in mono small caps; page title space is intentionally
 *     restrained — we let the page below own the display typography.
 *
 * Nothing functional changed from the previous version — same nav, same
 * dropdowns, same mobile drawer, same EnvBanner mount. Just visual.
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Home, FileText, Search, Target, Mic, Mail, Wand2,
  MessageCircle, Folder, Zap, Columns3, Sparkles, TrendingUp, Map,
  ShieldCheck, Crown, LogOut, Settings, SlidersHorizontal,
  User as UserIcon, Menu, X, PanelLeftClose, PanelLeft,
  Bell, HelpCircle,
  FolderOpen, ArrowUpRight } from "lucide-react";
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
  { label: "My Collection", icon: FolderOpen, path: "/my-collection" },
  { label: "Resume Builder", icon: FileText, path: "/resume-builder" },
  { label: "ATS Checker", icon: Target, path: "/ats-checker" },
  { label: "Applications", icon: Columns3, path: "/job-tracker" },
  { label: "Cover Letters", icon: Mail, path: "/cover-letters" },
  { label: "Interviews", icon: Mic, path: "/interview-prep" },
  { label: "AI Chat", icon: MessageCircle, path: "/chat" },
];

const pinnedNav: NavItem[] = [
  { label: "AI Toolbox", icon: Wand2, path: "/ai-toolbox" },
  { label: "Documents", icon: Folder, path: "/documents" },
  { label: "Career Controls", icon: SlidersHorizontal, path: "/career-ops/preferences", badge: "NEW" },
  { label: "Auto Apply", icon: Zap, path: "/auto-apply", badge: "PRO" },
  { label: "Analytics", icon: TrendingUp, path: "/analytics" },
];

const ownerOnlyTools: NavItem[] = [
  { label: "Market Map", icon: Map, path: "/market-domination-map" },
  { label: "Control Center", icon: ShieldCheck, path: "/control-center" },
  { label: "Admin Portal", icon: Crown, path: "/admin" },
  { label: "Feature Flags", icon: Settings, path: "/admin/flags" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut, isAdmin } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anuOpen, setAnuOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (isMobile) setSidebarOpen(true); }, [isMobile]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setDisplayName(data?.full_name || user.email?.split("@")[0] || "User"); });
  }, [user?.id]);

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

  const allNav = [...mainNav, ...pinnedNav, ...visibleOwnerTools];
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
          "group relative flex items-center gap-3 h-8 pr-2 transition-colors no-underline",
          showText ? "pl-4" : "px-2 justify-center",
          active
            ? "text-rp-ink"
            : "text-rp-ink/55 hover:text-rp-ink",
        )}
      >
        {/* Active rule — a thin vertical ink mark instead of a filled background */}
        {showText && (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1.5 bottom-1.5 w-px transition-colors",
              active ? "bg-rp-ink" : "bg-transparent group-hover:bg-rp-ink/20",
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

  // ── Section label ─────────────────────────────────────────────────────
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
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

  const sidebarContent = (
    <aside
      className={cn(
        "flex flex-col shrink-0 h-full transition-[width] duration-200 border-r border-rp-rule",
        "bg-rp-paper",
        isMobile ? "w-[268px]" : sidebarOpen ? "w-[228px]" : "w-[60px]",
      )}
    >
      {/* Brand row */}
      <div className={cn("h-[60px] flex items-center", showText ? "px-4" : "px-2 justify-center")}>
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

      <nav className="flex-1 overflow-y-auto py-3">
        {mainNav.map((i) => <NavButton key={i.path} item={i} />)}

        {showText && <SectionLabel>More</SectionLabel>}
        {pinnedNav.map((i) => <NavButton key={i.path} item={i} />)}

        {visibleOwnerTools.length > 0 && (
          <>
            {showText && <SectionLabel>Admin</SectionLabel>}
            {visibleOwnerTools.map((i) => <NavButton key={i.path} item={i} />)}
          </>
        )}
      </nav>

      {/* Editorial "tear-out" upgrade card — only for non-Pro, non-owner */}
      {showText && !hasAdminAccess && (
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
              Apply at the speed of the market.
            </div>
            <div
              className="text-[11px] text-rp-ink/55 mt-1.5 leading-snug"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Unlimited tailored resumes and Greenhouse auto-apply.
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

      <div className="border-t border-rp-rule h-[40px] flex items-center px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 text-[11.5px] text-rp-ink/55 hover:text-rp-ink transition-colors",
                !showText && "mx-auto",
              )}
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              <Settings className="w-3.5 h-3.5" strokeWidth={1.6} />
              {showText && <span>Account</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56 rounded-md p-1.5">
            <div className="px-3 py-2.5">
              <p className="text-[13px] font-semibold text-foreground leading-tight">{displayName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer rounded-md gap-2">
              <UserIcon className="w-4 h-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/career-ops/preferences")} className="cursor-pointer rounded-md gap-2">
              <Settings className="w-4 h-4" /> Preferences
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
        <header className="h-[56px] flex items-center gap-3 px-5 border-b border-rp-rule bg-rp-canvas shrink-0">
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
              href="/feedback"
              onClick={(e) => handleLinkClick(e, "/feedback")}
              className="hidden sm:inline-flex items-center h-7 px-2.5 text-[11.5px] text-rp-ink/55 hover:text-rp-ink transition-colors no-underline"
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              Feedback
            </a>
            <a
              href="/docs"
              onClick={(e) => handleLinkClick(e, "/docs")}
              className="hidden sm:inline-flex items-center h-7 px-2.5 text-[11.5px] text-rp-ink/55 hover:text-rp-ink transition-colors no-underline"
              style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              Docs
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center w-7 h-7 text-rp-ink/55 hover:text-rp-ink transition-colors">
                  <Bell className="w-[14px] h-[14px]" strokeWidth={1.6} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-md p-1.5">
                <div className="px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-foreground">Notifications</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">You're all caught up.</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/matches")} className="cursor-pointer rounded-md gap-2 text-[12.5px]">
                  Check today's matches
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/job-tracker")} className="cursor-pointer rounded-md gap-2 text-[12.5px]">
                  Open pipeline
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

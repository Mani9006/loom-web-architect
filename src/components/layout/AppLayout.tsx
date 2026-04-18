import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Home, FileText, Search, Target, Mic, Mail, Wand2,
  MessageCircle, Folder, Zap, Columns3, Sparkles, TrendingUp, Map,
  ShieldCheck, Crown, ChevronDown, ChevronRight, LogOut, Settings,
  User as UserIcon, Menu, X, PanelLeftClose, PanelLeft,
  Bell, HelpCircle, MoreHorizontal,
} from "lucide-react";
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
  { label: "Job Search", icon: Search, path: "/job-search", badge: "AI" },
  { label: "Matches", icon: Sparkles, path: "/matches", badge: "NEW" },
  { label: "Resume Builder", icon: FileText, path: "/resume-builder" },
  { label: "ATS Checker", icon: Target, path: "/ats-checker" },
  { label: "Applications", icon: Columns3, path: "/job-tracker" },
  { label: "Cover Letters", icon: Mail, path: "/cover-letters" },
  { label: "Interviews", icon: Mic, path: "/interview-prep" },
  { label: "AI Chat", icon: MessageCircle, path: "/chat" },
];

const pinnedNav: NavItem[] = [
  { label: "AI Toolbox", icon: Wand2, path: "/ai-toolbox", badge: "6" },
  { label: "Documents", icon: Folder, path: "/documents" },
  { label: "Auto Apply", icon: Zap, path: "/auto-apply", badge: "PRO" },
  { label: "Analytics", icon: TrendingUp, path: "/analytics" },
];

const toolsNav: NavItem[] = [
  { label: "Market Map", icon: Map, path: "/market-domination-map" },
  { label: "Control Center", icon: ShieldCheck, path: "/control-center" },
];

const ownerExtra: NavItem = { label: "Admin Portal", icon: Crown, path: "/admin" };

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut, isAdmin } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
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
  const allTools = hasAdminAccess ? [...toolsNav, ownerExtra] : toolsNav;

  const allNav = [...mainNav, ...pinnedNav, ...allTools];
  const current = allNav.find((n) => isActive(n.path));
  const crumb = current?.label ?? "";

  const NavButton = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <a
        href={item.path}
        onClick={(e) => handleLinkClick(e, item.path)}
        title={!showText ? item.label : undefined}
        className={cn(
          "group relative w-full flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] transition-colors no-underline",
          active
            ? "bg-white text-foreground shadow-[0_1px_0_0_hsl(0_0%_0%/0.04),0_1px_2px_0_hsl(0_0%_0%/0.04)] ring-1 ring-black/[0.04]"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
        )}
      >
        <Icon className={cn("w-[18px] h-[18px] shrink-0", active ? "text-foreground" : "text-sidebar-foreground")} strokeWidth={active ? 2 : 1.75} />
        {showText && (
          <>
            <span className="flex-1 text-left truncate font-medium">{item.label}</span>
            {item.badge && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 bg-foreground/[0.06] text-foreground/65">
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
        "bg-sidebar flex flex-col shrink-0 transition-all duration-200 h-full border-r border-sidebar-border",
        isMobile ? "w-[264px]" : sidebarOpen ? "w-[232px]" : "w-[68px]"
      )}
    >
      {/* Brand row */}
      <div className="h-[56px] flex items-center justify-between pl-4 pr-3">
        <a href="/home" onClick={(e) => handleLinkClick(e, "/home")} className="flex items-center gap-2 no-underline">
          <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[12px] font-bold">R</div>
          {showText && <span className="text-[15px] font-semibold text-foreground tracking-tight">ResumePreps</span>}
        </a>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-accent">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showText && (
        <div className="px-3 pt-2 pb-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2.5 h-10 px-2.5 rounded-lg bg-white border border-black/[0.06] hover:border-black/[0.1] transition-colors">
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shrink-0" />
                <span className="flex-1 text-left text-[13px] font-medium text-foreground truncate">My Workspace</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 rounded-xl p-1.5">
              <div className="px-3 py-2.5">
                <p className="text-[12px] text-muted-foreground">Signed in as</p>
                <p className="text-[13px] font-semibold text-foreground leading-tight mt-0.5 truncate">{displayName}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer rounded-md gap-2 text-[12.5px]">
                <UserIcon className="w-3.5 h-3.5" strokeWidth={1.75} /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/career-ops/preferences")} className="cursor-pointer rounded-md gap-2 text-[12.5px]">
                <Settings className="w-3.5 h-3.5" strokeWidth={1.75} /> Preferences
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/pricing")} className="cursor-pointer rounded-md gap-2 text-[12.5px]">
                <Zap className="w-3.5 h-3.5" strokeWidth={1.75} /> Billing
              </DropdownMenuItem>
              {hasAdminAccess && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer rounded-md gap-2 text-[12.5px]">
                    <Crown className="w-3.5 h-3.5" strokeWidth={1.75} /> Admin Portal
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer rounded-md gap-2 text-[12.5px] text-destructive focus:text-destructive">
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-3 space-y-0.5">
        {mainNav.map((i) => <NavButton key={i.path} item={i} />)}

        {showText && (
          <div className="flex items-center justify-between px-3 mt-5 mb-1.5">
            <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Pinned</span>
          </div>
        )}
        <div className="space-y-0.5">
          {pinnedNav.map((i) => <NavButton key={i.path} item={i} />)}
          <button
            onClick={() => setMoreToolsOpen((v) => !v)}
            title={!showText ? "More tools" : undefined}
            className="w-full flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
            {showText && (
              <>
                <span className="flex-1 text-left font-medium">More tools</span>
                <ChevronRight className={cn("w-3.5 h-3.5 opacity-50 transition-transform", moreToolsOpen && "rotate-90")} />
              </>
            )}
          </button>
          {moreToolsOpen && showText && (
            <div className="pl-8 pr-2 pt-1 pb-2 space-y-0.5">
              {allTools.map((t) => (
                <a
                  key={t.path}
                  href={t.path}
                  onClick={(e) => handleLinkClick(e, t.path)}
                  className={cn(
                    "flex items-center gap-2.5 h-8 px-2 rounded-md text-[12.5px] transition-colors no-underline",
                    isActive(t.path)
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{t.label}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Upgrade card — only for non-Pro, non-owner users */}
      {showText && !hasAdminAccess && (
        <div className="px-3 pb-3">
          <button
            onClick={() => navigate("/pricing")}
            className="w-full text-left rounded-xl bg-white border border-black/[0.05] p-3 shadow-[0_1px_2px_0_hsl(0_0%_0%/0.03)] hover:border-black/[0.1] transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-md bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <Zap className="w-3.5 h-3.5 text-foreground" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground leading-tight">Upgrade to Pro</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">Unlimited résumés, matches, and Greenhouse auto-apply.</p>
              </div>
            </div>
          </button>
        </div>
      )}

      <div className="border-t border-sidebar-border h-[44px] flex items-center px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn("flex items-center gap-2.5 h-8 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors", !showText && "mx-auto")}>
              <Settings className="w-4 h-4" strokeWidth={1.75} />
              {showText && <span>Account</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56 rounded-xl p-1.5">
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
    <div className="flex h-screen bg-background">
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 shadow-2xl">{sidebarContent}</div>
        </div>
      )}

      {!isMobile && sidebarContent}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[56px] flex items-center gap-3 px-5 border-b border-border bg-background shrink-0">
          {isMobile ? (
            <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted">
              <Menu className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted">
              {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <PanelLeft className="w-[18px] h-[18px]" strokeWidth={1.75} />}
            </button>
          )}
          {crumb && (
            <div className="flex items-center gap-2 text-[13px] min-w-0">
              <span className="text-muted-foreground truncate">{crumb}</span>
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <a
              href="/feedback"
              onClick={(e) => handleLinkClick(e, "/feedback")}
              className="hidden sm:inline-flex items-center h-8 px-3 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
            >
              Feedback
            </a>
            <a
              href="/docs"
              onClick={(e) => handleLinkClick(e, "/docs")}
              className="hidden sm:inline-flex items-center h-8 px-3 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
            >
              Docs
            </a>
            <button
              onClick={() => setAnuOpen((v) => !v)}
              aria-pressed={anuOpen}
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] transition-colors",
                anuOpen
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
              Ask
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative">
                  <Bell className="w-[15px] h-[15px]" strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-xl p-1.5">
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
                <button className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-foreground/[0.06] text-[11px] font-semibold text-foreground hover:bg-foreground/[0.1] transition-colors">
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
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

        <main className="flex-1 overflow-y-auto min-h-0 bg-background">
          <Outlet />
        </main>
      </div>

      {/* ANU help chat — mounted once at layout root */}
      <AnuChat open={anuOpen} onClose={() => setAnuOpen(false)} />
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import {
  Home,
  FolderOpen, ChevronDown, ChevronRight, LogOut,
  Settings, User as UserIcon, Menu, X, PanelLeftClose, PanelLeft, TrendingUp,
  Sun, Moon, ShieldCheck, Map, Crown,
} from "lucide-react";
import { RPIcon, type RPIconName } from "@/components/shared/RPIcon";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import Logo from "@/components/shared/Logo";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerEmail } from "@/lib/admin";

// Wrapper that adapts RPIcon to the same signature as a lucide component
// (so it can be used as `icon: React.ElementType` in nav items).
const rp = (name: RPIconName): React.FC<{ className?: string; strokeWidth?: number }> => {
  const C: React.FC<{ className?: string; strokeWidth?: number }> = ({ className, strokeWidth }) => (
    <RPIcon name={name} className={className} strokeWidth={strokeWidth} />
  );
  C.displayName = `RP_${name}`;
  return C;
};

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
  children?: { label: string; path: string }[];
}

const baseMainNav: NavItem[] = [
  { label: "Home", icon: rp("home"), path: "/home" },
  { label: "Job Search", icon: rp("search"), path: "/job-search", badge: "AI" },
  { label: "Resume Builder", icon: rp("resume"), path: "/resume-builder" },
  { label: "ATS Checker", icon: rp("score"), path: "/ats-checker" },
  {
    label: "Applications",
    icon: rp("pipeline"),
    path: "/job-tracker",
    children: [
      { label: "All Applications", path: "/job-tracker" },
      { label: "Saved Jobs", path: "/job-tracker?tab=saved" },
    ],
  },
  { label: "Cover Letters", icon: rp("letter"), path: "/cover-letters" },
  { label: "Interviews", icon: rp("interview"), path: "/interview-prep" },
  { label: "AI Chat", icon: rp("chat"), path: "/chat" },
];

const autoApplyNav: NavItem = { label: "Auto Apply", icon: rp("zap"), path: "/auto-apply", badge: "PRO" };

const secondaryNavBase: NavItem[] = [
  { label: "Analytics", icon: TrendingUp, path: "/analytics" },
  { label: "Control Center", icon: ShieldCheck, path: "/control-center", badge: "HQ" },
  { label: "Market Map", icon: Map, path: "/market-domination-map", badge: "NEW" },
  {
    label: "Documents",
    icon: FolderOpen,
    path: "/documents",
    children: [
      { label: "My Documents", path: "/documents" },
      { label: "Cover Letters", path: "/cover-letters" },
    ],
  },
  {
    label: "AI Toolbox",
    icon: rp("tailor"),
    path: "/ai-toolbox",
    badge: "6",
    children: [
      { label: "Brand Statement", path: "/ai-toolbox" },
      { label: "Email Writer", path: "/ai-toolbox" },
      { label: "Elevator Pitch", path: "/ai-toolbox" },
      { label: "LinkedIn Headline", path: "/ai-toolbox" },
      { label: "LinkedIn About", path: "/ai-toolbox" },
      { label: "LinkedIn Post", path: "/ai-toolbox" },
    ],
  },
];

const ownerNav: NavItem = { label: "Admin Portal", icon: Crown, path: "/admin", badge: "Owner" };

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (isMobile) setSidebarOpen(true); }, [isMobile]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setDisplayName(data?.full_name || user.email?.split("@")[0] || "User"); });
    // Check if Auto Apply is enabled for this user
    (supabase as any).from("user_access_controls").select("auto_apply_enabled").eq("user_id", user.id).maybeSingle()
      .then(({ data }: { data: any }) => { setAutoApplyEnabled(data?.auto_apply_enabled === true); });
  }, [user?.id]);

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };
  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
  };
  const handleNavigate = (path: string) => { navigate(path); if (isMobile) setMobileOpen(false); };
  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    // Allow Ctrl+Click / Cmd+Click / middle-click to open in new tab natively
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    e.preventDefault();
    handleNavigate(path);
  };
  const isActive = (path: string) => {
    const [pathname, search] = path.split("?");
    if (search) {
      return location.pathname === pathname && location.search === `?${search}`;
    }
    return location.pathname === pathname;
  };
  const isParentActive = (item: NavItem) =>
    item.children?.some((c) => isActive(c.path)) || isActive(item.path);

  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (!user) return null;

  const showText = isMobile || sidebarOpen;
  const mainNav = autoApplyEnabled
    ? [baseMainNav[0], baseMainNav[1], autoApplyNav, ...baseMainNav.slice(2)]
    : baseMainNav;
  const hasAdminAccess = isOwnerEmail(user.email) || isAdmin;
  const secondaryNav = hasAdminAccess ? [...secondaryNavBase, ownerNav] : secondaryNavBase;

  const renderNavItem = (item: NavItem, index: number) => {
    const hasChildren = !!item.children;
    const expanded = expandedMenus.includes(item.label);
    const active = hasChildren ? isParentActive(item) : isActive(item.path);
    const num = String(index + 1).padStart(2, "0");

    const sharedClassName = cn(
      "relative w-full flex items-center gap-4 pl-4 pr-3 py-2.5 rounded-full text-[13px] transition-all duration-300 group no-underline",
      active
        ? "bg-background/70 ring-1 ring-foreground/10 text-foreground shadow-[0_1px_0_0_hsl(30_12%_9%/0.04),0_8px_20px_-12px_hsl(30_12%_9%/0.12)]"
        : "text-sidebar-foreground hover:bg-background/50 hover:text-foreground"
    );

    const innerContent = (
      <>
        <span className={cn(
          "font-mono text-[10px] tabular-nums tracking-wider shrink-0 transition-opacity",
          active ? "text-foreground/50" : "text-sidebar-foreground/50 group-hover:text-foreground/40"
        )}>{num}</span>
        {showText && (
          <>
            <span className={cn("flex-1 text-left truncate", active ? "font-medium" : "font-normal")}>
              {item.label}
            </span>
            {item.badge && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-foreground/5 text-foreground/60 shrink-0">
                {item.badge}
              </span>
            )}
            {hasChildren ? (
              expanded
                ? <ChevronDown className="w-3 h-3 opacity-40 shrink-0" />
                : <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />
            ) : active ? (
              <span aria-hidden className="text-foreground/60 text-base leading-none shrink-0 -mt-0.5">→</span>
            ) : null}
          </>
        )}
      </>
    );

    return (
      <div key={item.label}>
        {hasChildren ? (
          <button
            onClick={() => toggleMenu(item.label)}
            title={!showText ? item.label : undefined}
            className={sharedClassName}
          >
            {innerContent}
          </button>
        ) : (
          <a
            href={item.path}
            onClick={(e) => handleLinkClick(e, item.path)}
            title={!showText ? item.label : undefined}
            className={sharedClassName}
          >
            {innerContent}
          </a>
        )}
        {hasChildren && expanded && showText && (
          <div className="ml-8 mt-0.5 mb-1 space-y-0.5">
            {item.children!.map((child) => (
              <a
                key={child.label + child.path}
                href={child.path}
                onClick={(e) => handleLinkClick(e, child.path)}
                className={cn(
                  "block text-left px-4 py-1.5 rounded-full text-[12px] transition-colors no-underline",
                  isActive(child.path)
                    ? "text-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:text-foreground"
                )}
              >
                {child.label}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <aside
      className={cn(
        "border-r border-sidebar-border bg-sidebar flex flex-col shrink-0 transition-all duration-300 h-full",
        isMobile ? "w-[260px]" : sidebarOpen ? "w-[260px]" : "w-[72px]"
      )}
    >
      <div className="h-[72px] flex items-center justify-between px-5">
        <Logo size="md" markOnly={!showText} />
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-full text-sidebar-foreground hover:text-foreground hover:bg-background/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <div>
          {showText && (
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-sidebar-foreground/50 px-4 mb-3">Studio</p>
          )}
          <div className="space-y-0.5">{mainNav.map((item, i) => renderNavItem(item, i))}</div>
        </div>

        <div>
          {showText && (
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-sidebar-foreground/50 px-4 mb-3">Files</p>
          )}
          <div className="space-y-0.5">{secondaryNav.map((item, i) => renderNavItem(item, i))}</div>
        </div>
      </nav>

      {/* Footer: compact user chip + theme toggle */}
      <div className="border-t border-sidebar-border/60 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-[11px] font-medium text-foreground shrink-0 ring-1 ring-foreground/10">
            {initials || "·"}
          </div>
          {showText && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground leading-none truncate">{displayName || "Guest"}</p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/60 mt-1">Studio plan</p>
            </div>
          )}
          {showText && (
            <button
              onClick={toggleTheme}
              title={theme === "light" ? "Dark mode" : "Light mode"}
              className="p-1.5 rounded-full text-sidebar-foreground/70 hover:text-foreground hover:bg-background/60 transition-colors"
            >
              {theme === "light" ? <Moon className="w-3.5 h-3.5" strokeWidth={1.6} /> : <Sun className="w-3.5 h-3.5" strokeWidth={1.6} />}
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-background">
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 animate-slide-up shadow-2xl">{sidebarContent}</div>
        </div>
      )}

      {!isMobile && sidebarContent}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[72px] flex items-center gap-4 px-6 liquid-nav shrink-0 relative z-20">
          {isMobile ? (
            <button onClick={() => setMobileOpen(true)} className="p-2 rounded-full hover:bg-foreground/5 transition-colors text-muted-foreground">
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-full hover:bg-foreground/5 transition-colors text-muted-foreground">
              {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeft className="w-[18px] h-[18px]" strokeWidth={1.5} />}
            </button>
          )}

          {/* Breadcrumb */}
          <div className="hidden sm:flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="hover:text-foreground transition-colors cursor-pointer">Studio</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-medium">Overview</span>
          </div>

          <div className="flex-1" />

          {/* ⌘K search */}
          <button
            className="hidden md:flex items-center gap-3 h-10 w-[360px] max-w-[40vw] px-4 rounded-full text-[13px] text-muted-foreground/80 bg-background/50 border border-foreground/5 hover:bg-background/70 hover:border-foreground/10 transition-all"
            onClick={() => {}}
          >
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
            <span className="flex-1 text-left">Search everything</span>
            <span className="font-mono text-[10px] tracking-wider opacity-70 px-1.5 py-0.5 rounded border border-foreground/10">⌘ K</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-10 px-4 rounded-full text-[13px] font-medium text-foreground border border-foreground/10 hover:bg-foreground/5 transition-colors">
                Exit
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
              <div className="px-3 py-2.5">
                <p className="font-medium text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2.5 rounded-xl">
                <UserIcon className="w-4 h-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2.5 rounded-xl">
                <Home className="w-4 h-4" /> Dashboard
              </DropdownMenuItem>
              {hasAdminAccess && (
                <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer gap-2.5 rounded-xl">
                  <Crown className="w-4 h-4" /> Admin Portal
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive gap-2.5 rounded-xl">
                <LogOut className="w-4 h-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => navigate("/job-search")}
            className="h-10 px-5 rounded-full text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center gap-2 shadow-[0_10px_24px_-12px_hsl(30_12%_9%/0.4)]"
          >
            Apply <span aria-hidden>→</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 relative">
          {/* Ambient aurora — very quiet warm wash */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="aurora" style={{ opacity: 0.55 }} />
            <div className="orb w-[520px] h-[520px] -top-24 -right-24"
              style={{ background: "hsl(12 70% 70% / 0.18)" }} />
            <div className="orb w-[420px] h-[420px] top-1/2 -left-24"
              style={{ background: "hsl(42 60% 80% / 0.3)", animationDelay: "4s" }} />
          </div>
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

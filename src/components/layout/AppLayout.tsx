import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  Home, Search, FileText, Columns3, Mic, MessageCircle,
  FolderOpen, ChevronDown, ChevronRight, LogOut,
  Settings, User as UserIcon, Wand2, Users, Menu, X, PanelLeftClose, PanelLeft, TrendingUp
} from "lucide-react";
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
import logoImg from "@/assets/logo-new.png";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
  children?: { label: string; path: string }[];
}

const mainNav: NavItem[] = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Job Search", icon: Search, path: "/jobs", badge: "AI" },
  { label: "Resume Builder", icon: FileText, path: "/resume-builder" },
  { label: "Job Tracker", icon: Columns3, path: "/job-tracker" },
  { label: "Interviews", icon: Mic, path: "/mock-interviews" },
  { label: "AI Chat", icon: MessageCircle, path: "/chat" },
];

const secondaryNav: NavItem[] = [
  { label: "Analytics", icon: TrendingUp, path: "/analytics" },
  {
    label: "Documents",
    icon: FolderOpen,
    path: "/documents",
    children: [
      { label: "My Documents", path: "/documents" },
      { label: "Cover Letters", path: "/cover-letters" },
    ],
  },
  { label: "Contacts", icon: Users, path: "/contacts" },
  {
    label: "AI Toolbox",
    icon: Wand2,
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

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (isMobile) setSidebarOpen(true); }, [isMobile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") navigate("/auth");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/auth");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { setDisplayName(data?.full_name || user.email?.split("@")[0] || "User"); });
  }, [user]);

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate("/auth"); };
  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
  };
  const handleNavigate = (path: string) => { navigate(path); if (isMobile) setMobileOpen(false); };
  const isActive = (path: string) => location.pathname === path;
  const isParentActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname === c.path) || location.pathname === item.path;

  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (!user) return null;

  const showText = isMobile || sidebarOpen;

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const hasChildren = !!item.children;
    const expanded = expandedMenus.includes(item.label);
    const active = hasChildren ? isParentActive(item) : isActive(item.path);

    return (
      <div key={item.label}>
        <button
          onClick={() => hasChildren ? toggleMenu(item.label) : handleNavigate(item.path)}
          title={!showText ? item.label : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-all duration-200 group",
            active
              ? "bg-gradient-to-r from-sidebar-primary/20 to-sidebar-primary/10 text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0",
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg"
              : "bg-sidebar-accent/50 text-sidebar-foreground group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground"
          )}>
            <Icon className="w-4 h-4" strokeWidth={active ? 2.2 : 1.8} />
          </div>
          {showText && (
            <>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sidebar-primary/20 text-sidebar-primary font-bold">
                  {item.badge}
                </span>
              )}
              {hasChildren && (
                expanded ? <ChevronDown className="w-3.5 h-3.5 opacity-40" /> : <ChevronRight className="w-3.5 h-3.5 opacity-40" />
              )}
            </>
          )}
        </button>
        {hasChildren && expanded && showText && (
          <div className="ml-[44px] mt-1.5 space-y-0.5 border-l-2 border-sidebar-border/50 pl-3">
            {item.children!.map((child) => (
              <button
                key={child.label + child.path}
                onClick={() => handleNavigate(child.path)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-xl text-[12px] transition-colors",
                  isActive(child.path)
                    ? "text-sidebar-primary font-semibold"
                    : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
                )}
              >
                {child.label}
              </button>
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
        isMobile ? "w-[260px]" : sidebarOpen ? "w-[240px]" : "w-[68px]"
      )}
    >
      {/* Logo */}
      <div className="h-[68px] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-sidebar-accent flex items-center justify-center">
            <img src={logoImg} alt="ResumePrep" className="w-9 h-9 object-contain" />
          </div>
          {showText && (
            <span className="font-bold text-[16px] text-sidebar-accent-foreground tracking-tight">
              ResumePrep
            </span>
          )}
        </div>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-xl text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {showText && (
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40 px-3 mb-2">
            Main
          </p>
        )}
        <div className="space-y-1">
          {mainNav.map(renderNavItem)}
        </div>

        <div className="my-5 mx-3 h-px bg-sidebar-border/50" />

        {showText && (
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40 px-3 mb-2">
            Tools
          </p>
        )}
        <div className="space-y-1">
          {secondaryNav.map(renderNavItem)}
        </div>
      </nav>

      {/* Bottom User Section */}
      <div className="border-t border-sidebar-border/50 p-3">
        <button
          onClick={() => handleNavigate("/profile")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-colors",
            "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          )}
        >
          <div className="w-8 h-8 rounded-xl bg-sidebar-accent/50 flex items-center justify-center">
            <Settings className="w-4 h-4" strokeWidth={1.8} />
          </div>
          {showText && "Settings"}
        </button>
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
        <header className="h-[68px] flex items-center justify-between px-6 border-b border-border/50 bg-background/80 backdrop-blur-xl shrink-0">
          {isMobile ? (
            <button onClick={() => setMobileOpen(true)} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
              {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px]" /> : <PanelLeft className="w-[18px] h-[18px]" />}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 focus:outline-none hover:opacity-80 transition-opacity">
                <Avatar className="w-9 h-9 ring-2 ring-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-semibold text-foreground leading-none">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Free plan</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
              <div className="px-3 py-2.5">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2.5 rounded-xl">
                <UserIcon className="w-4 h-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2.5 rounded-xl">
                <Home className="w-4 h-4" /> Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive gap-2.5 rounded-xl">
                <LogOut className="w-4 h-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto mesh-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

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
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-200",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          )}
        >
          <Icon className={cn("w-[18px] h-[18px] shrink-0", active && "text-sidebar-primary")} strokeWidth={active ? 2.2 : 1.8} />
          {showText && (
            <>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-sidebar-primary/20 text-sidebar-primary font-bold">
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
          <div className="ml-[30px] mt-1 space-y-0.5 border-l-2 border-sidebar-border pl-3">
            {item.children!.map((child) => (
              <button
                key={child.label + child.path}
                onClick={() => handleNavigate(child.path)}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-colors",
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
        "border-r border-sidebar-border bg-sidebar flex flex-col shrink-0 transition-all duration-200 h-full",
        isMobile ? "w-[260px]" : sidebarOpen ? "w-[230px]" : "w-[60px]"
      )}
    >
      {/* Logo */}
      <div className="h-[60px] flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <img src={logoImg} alt="ResumePrep" className="w-8 h-8 rounded-lg object-contain" />
          {showText && (
            <span className="font-bold text-[15px] text-sidebar-accent-foreground tracking-tight">
              ResumePrep
            </span>
          )}
        </div>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1">
        <div className="space-y-0.5">
          {mainNav.map(renderNavItem)}
        </div>

        {showText && (
          <div className="my-4 mx-3 h-px bg-sidebar-border" />
        )}

        <div className="space-y-0.5">
          {secondaryNav.map(renderNavItem)}
        </div>
      </nav>

      {/* Bottom User Section */}
      <div className="border-t border-sidebar-border p-2.5">
        <button
          onClick={() => handleNavigate("/profile")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors",
            "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          )}
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.8} />
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
        <header className="h-[60px] flex items-center justify-between px-5 border-b border-border bg-background shrink-0">
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
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline text-foreground">{displayName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <div className="px-3 py-2.5">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2.5 rounded-lg">
                <UserIcon className="w-4 h-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2.5 rounded-lg">
                <Home className="w-4 h-4" /> Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive gap-2.5 rounded-lg">
                <LogOut className="w-4 h-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

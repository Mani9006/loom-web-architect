import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  Home, Briefcase, FileText, Target, Mic2, MessageSquare,
  FolderOpen, ChevronDown, ChevronRight, LogOut,
  Settings, User as UserIcon, Wrench, Users, Menu, X, PanelLeftClose, PanelLeft
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
import logoImg from "@/assets/logo.png";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
  children?: { label: string; path: string }[];
}

const navItems: NavItem[] = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Jobs", icon: Briefcase, path: "/jobs", badge: "AI" },
  { label: "Resume Builder", icon: FileText, path: "/resume-builder" },
  { label: "Job Tracker", icon: Target, path: "/job-tracker" },
  { label: "Mock Interviews", icon: Mic2, path: "/mock-interviews", badge: "Voice" },
  { label: "AI Chat", icon: MessageSquare, path: "/chat" },
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
    label: "Networking",
    icon: Users,
    path: "/contacts",
    children: [
      { label: "Contacts", path: "/contacts" },
    ],
  },
  {
    label: "AI Toolbox",
    icon: Wrench,
    path: "/ai-toolbox",
    badge: "6 Tools",
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

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // On mobile, sidebar is always overlay
  useEffect(() => {
    if (isMobile) setSidebarOpen(true); // Reset desktop state
  }, [isMobile]);

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
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.full_name || user.email?.split("@")[0] || "User");
      });
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;
  const isParentActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname === c.path) || location.pathname === item.path;

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (!user) return null;

  const showSidebar = isMobile ? mobileOpen : sidebarOpen;

  const sidebarContent = (
    <aside
      className={cn(
        "border-r border-sidebar-border bg-sidebar flex flex-col shrink-0 transition-all duration-300 h-full",
        isMobile ? "w-[260px]" : sidebarOpen ? "w-[220px]" : "w-[60px]"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <img src={logoImg} alt="ResumePrep" className="w-8 h-8 rounded-lg object-contain" />
          {(isMobile || sidebarOpen) && (
            <span className="font-bold text-sm text-sidebar-foreground tracking-tight">
              Resume<span className="text-accent">Prep</span>
            </span>
          )}
        </div>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children;
          const expanded = expandedMenus.includes(item.label);
          const active = hasChildren ? isParentActive(item) : isActive(item.path);
          const showText = isMobile || sidebarOpen;

          return (
            <div key={item.label}>
              <button
                onClick={() => {
                  if (hasChildren) {
                    toggleMenu(item.label);
                  } else {
                    handleNavigate(item.path);
                  }
                }}
                title={!showText ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active && "text-primary")} />
                {showText && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                        {item.badge}
                      </span>
                    )}
                    {hasChildren && (
                      expanded ? <ChevronDown className="w-3.5 h-3.5 opacity-50" /> : <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                    )}
                  </>
                )}
              </button>
              {hasChildren && expanded && showText && (
                <div className="ml-7 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2.5">
                  {item.children!.map((child) => (
                    <button
                      key={child.label + child.path}
                      onClick={() => handleNavigate(child.path)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                        isActive(child.path)
                          ? "text-primary"
                          : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                      )}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => handleNavigate("/profile")}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          <Settings className="w-4 h-4" />
          {(isMobile || sidebarOpen) && "Settings"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 animate-slide-up">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isMobile && sidebarContent}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background shrink-0">
          {isMobile ? (
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 focus:outline-none hover:opacity-80 transition-opacity">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline">{displayName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2">
                <UserIcon className="w-4 h-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2">
                <Home className="w-4 h-4" /> Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive gap-2">
                <LogOut className="w-4 h-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

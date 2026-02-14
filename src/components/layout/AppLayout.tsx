import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  Home, Briefcase, FileText, Target, Mic2, MessageSquare,
  FolderOpen, ChevronDown, ChevronRight, Sparkles, LogOut,
  Settings, User as UserIcon, Wrench
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

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
  children?: { label: string; path: string }[];
}

const navItems: NavItem[] = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Jobs", icon: Briefcase, path: "/jobs", badge: "Beta" },
  { label: "Resume Builder", icon: FileText, path: "/resume-builder" },
  { label: "Job Tracker", icon: Target, path: "/job-tracker" },
  { label: "Mock Interviews", icon: Mic2, path: "/mock-interviews" },
  { label: "AI Chat", icon: MessageSquare, path: "/chat" },
  {
    label: "Application Materials",
    icon: FolderOpen,
    path: "/documents",
    children: [
      { label: "My Documents", path: "/documents" },
      { label: "Cover Letters", path: "/cover-letters" },
    ],
  },
  { label: "AI Toolbox", icon: Wrench, path: "/ai-toolbox" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

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

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-[200px] border-r border-border bg-sidebar flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">
            CareerPrep<span className="text-primary">.ai</span>
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = !!item.children;
            const expanded = expandedMenus.includes(item.label);
            const active = hasChildren ? isParentActive(item) : isActive(item.path);

            return (
              <div key={item.label}>
                <button
                  onClick={() => {
                    if (hasChildren) {
                      toggleMenu(item.label);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                      {item.badge}
                    </span>
                  )}
                  {hasChildren && (
                    expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {hasChildren && expanded && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.children!.map((child) => (
                      <button
                        key={child.path}
                        onClick={() => navigate(child.path)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                          isActive(child.path)
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
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
        <div className="border-t border-border p-2 space-y-0.5">
          <button
            onClick={() => navigate("/profile")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 flex items-center justify-end px-4 border-b border-border bg-background shrink-0">
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

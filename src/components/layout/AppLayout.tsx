/**
 * App shell.
 *
 * A quiet frame around the work: five destinations in a hairline sidebar
 * (a bottom tab bar on phones), a solid header that names where you are,
 * and a ⌘K menu that reaches everything else. The page below owns the
 * typography; the shell stays out of its way.
 *
 * Route definitions and matching live in ./navigation.ts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  LogOut,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Search,
  Sun,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerEmail } from "@/lib/admin";
import AnuChat from "@/components/AnuChat";
import { LogoIcon } from "@/components/shared/Logo";
import { useTheme } from "@/hooks/use-theme";
import { useSubscription } from "@/components/SubscriptionGate";
import { isMacPlatform, useShellShortcuts } from "@/hooks/use-shell-shortcuts";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Kbd } from "@/components/layout/Kbd";
import {
  accountPages,
  adminPages,
  destinationByShortcut,
  destinationPages,
  destinations,
  resolveRoute,
  type Destination,
  type NavPage,
} from "@/components/layout/navigation";

const SIDEBAR_KEY = "sidebar";

function readSidebarPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { plan, loading: subscriptionLoading } = useSubscription();
  const [displayName, setDisplayName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPreference);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [anuOpen, setAnuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.full_name || user.email?.split("@")[0] || "You");
      });
  }, [user]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "expanded" : "collapsed");
    } catch {
      /* storage unavailable: keep the in-memory preference */
    }
  }, [sidebarOpen]);

  const hasAdminAccess = Boolean(user && (isOwnerEmail(user.email) || isAdmin));
  const route = useMemo(
    () => resolveRoute(location.pathname, { includeAdmin: hasAdminAccess }),
    [location.pathname, hasAdminAccess],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate("/auth");
  }, [signOut, navigate]);

  useShellShortcuts({
    onTogglePalette: () => setPaletteOpen((open) => !open),
    onGoTo: (key) => {
      const destination = destinationByShortcut(key);
      if (!destination) return false;
      navigate(destination.path);
      return true;
    },
    sequencesEnabled: !paletteOpen,
  });

  // Keep the document title in step with the header.
  useEffect(() => {
    document.title = route.title ? `${route.title} | ResumePreps` : "ResumePreps";
  }, [route.title]);

  if (!user) return null;

  const expanded = isMobile || sidebarOpen;
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";
  const planLabel = plan === "autopilot" ? "Autopilot" : plan === "pro" ? "Pro" : "Free";
  const showUpgrade = !hasAdminAccess && !subscriptionLoading && plan === "free";
  const shortcutHint = isMacPlatform() ? "⌘K" : "Ctrl K";

  const isCurrent = (page: NavPage) => route.page?.path === page.path;

  // ── Sidebar ─────────────────────────────────────────────────────────────
  const destinationLink = (d: Destination) => {
    const inSection = route.destination?.id === d.id;
    const current = inSection && isCurrent(d);
    const Icon = d.icon;
    const link = (
      <Link
        to={d.path}
        aria-current={current ? "page" : undefined}
        aria-label={expanded ? undefined : d.label}
        className={cn(
          "group flex h-8 items-center gap-2.5 rounded-md text-meta no-underline transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          expanded ? "px-2" : "w-8 justify-center",
          current
            ? "bg-muted font-medium text-foreground"
            : inSection
              ? "font-medium text-foreground hover:bg-muted"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon
          aria-hidden
          className={cn("h-4 w-4 shrink-0", inSection ? "text-primary" : "text-current")}
          strokeWidth={1.75}
        />
        {expanded && <span className="truncate">{d.label}</span>}
      </Link>
    );
    if (expanded) return link;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {d.label}
          <span className="flex gap-0.5">
            <Kbd>G</Kbd>
            <Kbd>{d.shortcut.toUpperCase()}</Kbd>
          </span>
        </TooltipContent>
      </Tooltip>
    );
  };

  const subLink = (page: NavPage) => {
    const current = isCurrent(page);
    return (
      <Link
        to={page.path}
        aria-current={current ? "page" : undefined}
        className={cn(
          "-ml-px flex h-7 items-center border-l pl-3 text-meta no-underline transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md",
          current
            ? "border-primary font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
        )}
      >
        <span className="truncate">{page.label}</span>
      </Link>
    );
  };

  const plainLink = (page: NavPage) => {
    const current = isCurrent(page);
    const Icon = page.icon;
    const link = (
      <Link
        to={page.path}
        aria-current={current ? "page" : undefined}
        aria-label={expanded ? undefined : page.label}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md text-meta no-underline transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          expanded ? "px-2" : "w-8 justify-center",
          current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {expanded && <span className="truncate">{page.label}</span>}
      </Link>
    );
    if (expanded) return link;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{page.label}</TooltipContent>
      </Tooltip>
    );
  };

  const sidebar = (
    <aside
      aria-label="Primary"
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-out",
        sidebarOpen ? "w-[232px]" : "w-[56px]",
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center", expanded ? "px-4" : "justify-center")}>
        <Link
          to="/home"
          className="flex items-center gap-2.5 rounded-md no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="ResumePreps, go to Today"
        >
          <LogoIcon className="h-6 w-6 text-xs" />
          {expanded && <span className="text-sm font-semibold text-foreground">ResumePreps</span>}
        </Link>
      </div>

      <nav className={cn("flex-1 overflow-y-auto pb-4 pt-2", expanded ? "px-3" : "flex flex-col items-center px-2")}>
        <ul className={cn("space-y-0.5", !expanded && "flex flex-col items-center")}>
          {destinations.map((d) => (
            <li key={d.id}>
              {destinationLink(d)}
              {expanded && d.secondary.length > 0 && (
                <ul className="mb-1.5 ml-[17px] mt-0.5 border-l border-border" aria-label={`${d.label} pages`}>
                  {d.secondary.map((page) => (
                    <li key={page.path}>
                      {subLink(page)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {hasAdminAccess && (
          <div className={cn("mt-6 border-t border-border pt-4", !expanded && "w-8")}>
            {expanded && <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Admin</p>}
            <ul className={cn("space-y-0.5", !expanded && "flex flex-col items-center")}>
              {adminPages.map((page) => (
                <li key={page.path}>
                  {plainLink(page)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {expanded && (
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-border px-4 text-xs">
          <span className="text-muted-foreground">{planLabel} plan</span>
          {showUpgrade && (
            <Link
              to="/pricing"
              className="rounded-sm font-medium text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Upgrade
            </Link>
          )}
        </div>
      )}
    </aside>
  );

  // ── Header ──────────────────────────────────────────────────────────────
  const sectionPages = route.destination ? destinationPages(route.destination) : [];
  const onSecondaryPage = Boolean(route.destination && route.page && route.page.path !== route.destination.path);

  const titleNode = route.title ? (
    sectionPages.length > 1 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-8 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${route.title}. Switch page in ${route.destination?.label}`}
          >
            <span className="truncate">{route.title}</span>
            <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {route.destination?.label}
          </DropdownMenuLabel>
          {sectionPages.map((page) => {
            const Icon = page.icon;
            const current = isCurrent(page);
            return (
              <DropdownMenuItem
                key={page.path}
                onSelect={() => navigate(page.path)}
                aria-current={current ? "page" : undefined}
                className={cn("gap-2", current && "font-medium")}
              >
                <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
                {page.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <h1 className="truncate px-1.5 text-sm font-semibold text-foreground">{route.title}</h1>
    )
  ) : null;

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-foreground transition-colors hover:border-rp-rule-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-2">
          <p className="truncate text-meta font-medium text-foreground">{displayName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        {accountPages.map((page) => {
          const Icon = page.icon;
          return (
            <DropdownMenuItem key={page.path} onSelect={() => navigate(page.path)} className="gap-2">
              <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
              {page.label}
              {page.path === "/pricing" && (
                <span className="ml-auto text-xs text-muted-foreground">{planLabel}</span>
              )}
            </DropdownMenuItem>
          );
        })}
        {isMobile && hasAdminAccess && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Admin</DropdownMenuLabel>
            {adminPages.map((page) => {
              const Icon = page.icon;
              return (
                <DropdownMenuItem key={page.path} onSelect={() => navigate(page.path)} className="gap-2">
                  <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
                  {page.label}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2 text-destructive focus:text-destructive">
          <LogOut aria-hidden className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const header = (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
      {isMobile ? (
        <Link
          to="/home"
          aria-label="ResumePreps, go to Today"
          className="mr-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogoIcon className="h-6 w-6 text-xs" />
        </Link>
      ) : (
        <button
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={sidebarOpen}
          className={cn(iconButton, "-ml-1")}
        >
          {sidebarOpen ? (
            <PanelLeftClose aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeft aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      )}

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
        {onSecondaryPage && route.destination && !isMobile && (
          <>
            <Link
              to={route.destination.path}
              className="rounded-md px-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {route.destination.label}
            </Link>
            <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        {titleNode}
      </nav>

      <div className="flex-1" />

      <button
        onClick={() => setPaletteOpen(true)}
        aria-label="Search pages and actions"
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          isMobile
            ? iconButton
            : "inline-flex h-8 w-56 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-meta text-muted-foreground transition-colors hover:border-rp-rule-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-64",
        )}
      >
        <Search aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {!isMobile && (
          <>
            <span className="flex-1 text-left">Search or jump to</span>
            <Kbd>{shortcutHint}</Kbd>
          </>
        )}
      </button>

      <button
        onClick={() => setAnuOpen((open) => !open)}
        aria-pressed={anuOpen}
        aria-label="Ask for help"
        className={cn(
          iconButton,
          "sm:w-auto sm:gap-1.5 sm:px-2 sm:text-meta",
          anuOpen && "bg-muted text-foreground",
        )}
      >
        <HelpCircle aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        <span className="hidden sm:inline">Ask</span>
      </button>

      <button
        onClick={toggleTheme}
        className={iconButton}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? (
          <Sun aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <Moon aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        )}
      </button>

      {accountMenu}
    </header>
  );

  // ── Mobile tab bar ──────────────────────────────────────────────────────
  const tabBar = (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid h-14 grid-cols-5">
        {destinations.map((d) => {
          const active = route.destination?.id === d.id;
          const Icon = d.icon;
          return (
            <li key={d.id} className="min-w-0">
              <Link
                to={d.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className={cn("h-5 w-5", active && "text-primary")} strokeWidth={1.75} />
                <span className="truncate">{d.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="flex h-[calc(100dvh-var(--env-banner-h,0px))] bg-background">
      {!isMobile && sidebar}

      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main
          id="main"
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background",
            isMobile && "pb-[calc(3.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <Outlet />
        </main>
      </div>

      {isMobile && tabBar}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        showAdmin={hasAdminAccess}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={handleSignOut}
      />
      <AnuChat open={anuOpen} onClose={() => setAnuOpen(false)} />
    </div>
  );
}

/**
 * Information architecture for the signed-in app.
 *
 * Five primary destinations, each owning a set of path prefixes. Secondary
 * pages stay reachable from their destination (sidebar, header switcher and
 * the command palette) instead of competing for a top-level slot.
 *
 * Keep this file free of React so the route matching stays unit-testable.
 */
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  Briefcase,
  Columns3,
  FileText,
  Activity,
  Search,
  ListChecks,
  Bookmark,
  Inbox,
  BarChart3,
  Gauge,
  Mail,
  FolderOpen,
  User,
  Settings,
  CreditCard,
  MessageSquare,
  BookOpen,
  Crown,
  Flag,
  ShieldCheck,
  Map,
  MessagesSquare,
  SlidersHorizontal,
} from "lucide-react";

export type DestinationId = "today" | "jobs" | "pipeline" | "resume" | "activity";

export interface NavPage {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Extra words the command palette should match on. */
  keywords?: string[];
  /** Further path prefixes that belong to this page (e.g. editor variants). */
  also?: string[];
}

export interface Destination extends NavPage {
  id: DestinationId;
  /** Second key of the "g then x" shortcut. */
  shortcut: string;
  /** Label for the destination's own page inside its switcher. */
  homeLabel: string;
  secondary: NavPage[];
}

export const destinations: Destination[] = [
  {
    id: "today",
    label: "Today",
    homeLabel: "Today",
    path: "/home",
    icon: CalendarCheck,
    shortcut: "t",
    keywords: ["home", "overview", "dashboard"],
    secondary: [],
  },
  {
    id: "jobs",
    label: "Jobs",
    homeLabel: "Matches",
    path: "/matches",
    icon: Briefcase,
    shortcut: "j",
    keywords: ["matches", "recommended", "feed"],
    secondary: [
      { label: "Job search", path: "/job-search", icon: Search, keywords: ["find", "search"] },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    homeLabel: "Board",
    path: "/applications",
    icon: Columns3,
    shortcut: "p",
    keywords: ["applications", "board", "kanban"],
    secondary: [
      { label: "Job tracker", path: "/job-tracker", icon: ListChecks, keywords: ["tracked"] },
      { label: "Saved jobs", path: "/my-collection", icon: Bookmark, keywords: ["collection", "saved"] },
      { label: "Inbox", path: "/inbox", icon: Inbox, keywords: ["email", "gmail", "replies"] },
      { label: "Analytics", path: "/analytics", icon: BarChart3, keywords: ["stats", "funnel"] },
    ],
  },
  {
    id: "resume",
    label: "Resume",
    homeLabel: "Resumes",
    path: "/resume-builder",
    icon: FileText,
    shortcut: "r",
    keywords: ["cv", "builder", "editor"],
    secondary: [
      { label: "ATS checker", path: "/ats-checker", icon: Gauge, keywords: ["score", "parse"] },
      { label: "Cover letters", path: "/cover-letters", icon: Mail, keywords: ["letter"] },
      { label: "Documents", path: "/documents", icon: FolderOpen, keywords: ["uploads", "files"] },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    homeLabel: "Activity",
    path: "/agent",
    icon: Activity,
    shortcut: "a",
    keywords: ["agent", "auto-apply", "log", "runs"],
    secondary: [],
  },
];

export const accountPages: NavPage[] = [
  { label: "Profile", path: "/profile", icon: User, also: ["/profile-setup"] },
  { label: "Job targets", path: "/career-ops/preferences", icon: SlidersHorizontal, keywords: ["preferences", "roles"] },
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "Plan and billing", path: "/pricing", icon: CreditCard, keywords: ["pricing", "upgrade", "subscription"] },
  { label: "Send feedback", path: "/feedback", icon: MessageSquare },
  { label: "Help and docs", path: "/docs", icon: BookOpen, keywords: ["help", "documentation"] },
];

export const adminPages: NavPage[] = [
  { label: "Admin", path: "/admin", icon: Crown },
  { label: "Feature flags", path: "/admin/flags", icon: Flag },
  { label: "Control center", path: "/control-center", icon: ShieldCheck },
  { label: "Market map", path: "/market-domination-map", icon: Map },
];

/** Pages that are reachable but belong to no destination. */
export const otherPages: NavPage[] = [
  { label: "Chat", path: "/chat", icon: MessagesSquare, also: ["/c"] },
];

export interface RouteMatch {
  destination: Destination | null;
  /** The specific page the path resolved to (may be the destination itself). */
  page: NavPage | null;
  /** Short title for the header. */
  title: string;
  /** "account" and "admin" pages sit outside the five destinations. */
  area: "destination" | "account" | "admin" | "other" | null;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function longestPrefix(pathname: string, page: NavPage): number {
  let best = -1;
  for (const prefix of [page.path, ...(page.also ?? [])]) {
    if (matchesPrefix(pathname, prefix) && prefix.length > best) best = prefix.length;
  }
  return best;
}

/**
 * Resolve a pathname to its destination and page by the most specific path
 * prefix, so `/applications/123` lights up Pipeline and
 * `/resume-builder/v2/abc` lights up Resume.
 */
export function resolveRoute(pathname: string, { includeAdmin = true } = {}): RouteMatch {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: { score: number; match: RouteMatch } = {
    score: -1,
    match: { destination: null, page: null, title: "", area: null },
  };

  const consider = (page: NavPage, match: Omit<RouteMatch, "page">) => {
    const score = longestPrefix(normalized, page);
    if (score > best.score) best = { score, match: { ...match, page } };
  };

  for (const destination of destinations) {
    consider(destination, { destination, title: destination.label, area: "destination" });
    for (const page of destination.secondary) {
      consider(page, { destination, title: page.label, area: "destination" });
    }
  }
  for (const page of accountPages) consider(page, { destination: null, title: page.label, area: "account" });
  if (includeAdmin) {
    for (const page of adminPages) consider(page, { destination: null, title: page.label, area: "admin" });
  }
  for (const page of otherPages) consider(page, { destination: null, title: page.label, area: "other" });

  return best.match;
}

/** Pages listed in a destination's switcher: its own page first. */
export function destinationPages(destination: Destination): NavPage[] {
  return [{ ...destination, label: destination.homeLabel }, ...destination.secondary];
}

export function destinationByShortcut(key: string): Destination | undefined {
  const lower = key.toLowerCase();
  return destinations.find((d) => d.shortcut === lower);
}

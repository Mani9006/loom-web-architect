import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Search, FileText, Columns3, BarChart3, Settings, Trash2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import DiscoverTab from "@/components/my-collection/DiscoverTab";
import ResumesTab from "@/components/my-collection/ResumesTab";
import BoardTab from "@/components/my-collection/BoardTab";
import StatsTab from "@/components/my-collection/StatsTab";
import WorkerStatusBadge from "@/components/my-collection/WorkerStatusBadge";
import SessionSettingsDialog from "@/components/my-collection/SessionSettingsDialog";
import TrashDialog from "@/components/my-collection/TrashDialog";
import ApplicationInboxTab from "@/components/my-collection/ApplicationInboxTab";
import { toUserFacingError } from "@/lib/user-facing-error";

interface MCSession {
  id: string;
  name: string;
  status: string;
  master_resume_id: string | null;
  target_profile: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const VALID_TABS = ["discover", "resumes", "board", "inbox", "stats"];

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [session, setSession] = useState<MCSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>(() => {
    // A ?tab= query param (e.g. from BoardTab's "View tailored resume" link)
    // takes priority so deep links land on the right tab.
    const fromQuery = searchParams.get("tab");
    if (fromQuery && VALID_TABS.includes(fromQuery)) return fromQuery;
    // Otherwise restore the active tab on remount (tab switches, browser
    // back/forward) so a tab-app switch doesn't reset the user to "discover".
    if (typeof window === "undefined") return "discover";
    try {
      const stored = sessionStorage.getItem(`mc:active-tab:${window.location.pathname}`);
      return stored && VALID_TABS.includes(stored) ? stored : "discover";
    } catch {
      return "discover";
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  // Bumped to force the Board to refresh after a Trash restore.
  const [boardReloadKey, setBoardReloadKey] = useState(0);
  const focusResumeId = searchParams.get("resume");

  useEffect(() => {
    try {
      sessionStorage.setItem(`mc:active-tab:${window.location.pathname}`, tab);
    } catch {
      // sessionStorage can throw in private mode, non-fatal
    }
  }, [tab]);

  // A link elsewhere in the app (e.g. BoardTab's "View tailored resume")
  // navigates to this same route with a new ?tab=, since the route doesn't
  // remount, pick up the change here instead of only reading it once at
  // mount via useState's initializer.
  useEffect(() => {
    const fromQuery = searchParams.get("tab");
    if (fromQuery && fromQuery !== tab && VALID_TABS.includes(fromQuery)) setTab(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let hadInitialLoad = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("mc_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;

      // Don't bounce the user back to /my-collection on transient failures
      // (e.g. Supabase token refresh on tab focus, network blip). Only
      // navigate away if we KNOW the session doesn't exist on the very
      // first load, otherwise just keep showing what we already have.
      if (error) {
        console.error("[SessionPage] reload failed:", error.message);
        if (!hadInitialLoad) {
          const safeError = toUserFacingError(error, {
            operation: "load_application_workspace",
            defaultMessage: "This application workspace could not be loaded.",
          });
          toast({ title: "Couldn't load workspace", description: safeError.message, variant: "destructive" });
        }
        setLoading(false);
        return;
      }
      if (!data) {
        if (!hadInitialLoad) {
          toast({ title: "Session not found" });
          navigate("/my-collection");
        }
        setLoading(false);
        return;
      }
      hadInitialLoad = true;
      setSession(data as unknown as MCSession);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when sessionId changes. navigate/toast are
    // unstable references that, if included, would cause this effect to
    // re-fire on every render, which on tab focus produces a flash and
    // can navigate the user away on a transient RLS hiccup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading || !session) {
    return (
      <div className="container max-w-7xl mx-auto py-8 px-4 md:px-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 md:px-8">
      <div className="flex items-center gap-2 mb-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/my-collection">
            <ArrowLeft className="w-4 h-4 mr-1" />
            My Collection
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{session.name}</h1>
          <p className="text-xs text-muted-foreground mt-1">Job discovery, tailored resumes, applications, and replies in one workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkerStatusBadge />
          <Button variant="outline" size="sm" onClick={() => setTrashOpen(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Trash
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-3.5 h-3.5 mr-1" /> Settings
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          // Clear any deep-link query params once the user manually
          // switches tabs, so navigating back to Resumes later doesn't
          // keep re-opening the same tailored resume.
          if (searchParams.toString()) setSearchParams({}, { replace: true });
        }}
      >
        <TabsList className="grid h-auto w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="discover" className="gap-2" aria-label="Discover">
            <Search className="w-4 h-4" /> <span className="hidden sm:inline">Discover</span>
          </TabsTrigger>
          <TabsTrigger value="resumes" className="gap-2" aria-label="Resumes">
            <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Resumes</span>
          </TabsTrigger>
          <TabsTrigger value="board" className="gap-2" aria-label="Board">
            <Columns3 className="w-4 h-4" /> <span className="hidden sm:inline">Board</span>
          </TabsTrigger>
          <TabsTrigger value="inbox" className="gap-2" aria-label="Inbox">
            <Inbox className="w-4 h-4" /> <span className="hidden sm:inline">Inbox</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2" aria-label="Stats">
            <BarChart3 className="w-4 h-4" /> <span className="hidden sm:inline">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-6">
          <DiscoverTab sessionId={session.id} session={session} />
        </TabsContent>
        <TabsContent value="resumes" className="mt-6">
          <ResumesTab sessionId={session.id} focusResumeId={focusResumeId} />
        </TabsContent>
        <TabsContent value="board" className="mt-6">
          <BoardTab sessionId={session.id} key={boardReloadKey} />
        </TabsContent>
        <TabsContent value="inbox" className="mt-6">
          <ApplicationInboxTab sessionId={session.id} />
        </TabsContent>
        <TabsContent value="stats" className="mt-6">
          <StatsTab sessionId={session.id} />
        </TabsContent>
      </Tabs>

      <SessionSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        session={session}
        onSaved={(updated) => {
          setSession((cur) => (cur ? { ...cur, ...updated } : cur));
          setSettingsOpen(false);
        }}
        onArchived={() => {
          setSettingsOpen(false);
          navigate("/my-collection");
        }}
      />

      <TrashDialog
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        sessionId={session.id}
        onRestored={() => setBoardReloadKey((k) => k + 1)}
      />
    </div>
  );
}

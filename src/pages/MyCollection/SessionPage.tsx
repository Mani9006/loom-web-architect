import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Search, FileText, Columns3, BarChart3, Settings, Trash2, AlertCircle, RefreshCw } from "lucide-react";
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

interface MCSession {
  id: string;
  name: string;
  status: string;
  master_resume_id: string | null;
  target_profile: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [session, setSession] = useState<MCSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tab can be set via URL (?tab=board) for deep-linking from other features,
  // or persisted in sessionStorage. URL param wins over stored state.
  const [tab, setTab] = useState<string>(() => {
    const urlTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    const validTabs = ["discover", "resumes", "board", "stats"];
    if (urlTab && validTabs.includes(urlTab)) return urlTab;
    if (typeof window === "undefined") return "discover";
    try {
      const stored = sessionStorage.getItem(`mc:active-tab:${sessionId}`);
      return stored || "discover";
    } catch {
      return "discover";
    }
  });
  // Resume to highlight when navigating from Board's "View tailored resume" link.
  const highlightResumeId = searchParams.get("resume");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  // Bumped to force the Board to refresh after a Trash restore.
  const [boardReloadKey, setBoardReloadKey] = useState(0);
  // Tracks whether we've ever successfully loaded this session so transient
  // re-load errors don't bounce the user away from a page they're working on.
  const everLoadedRef = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(`mc:active-tab:${sessionId}`, tab);
    } catch {
      // sessionStorage can throw in private mode — non-fatal
    }
  }, [tab, sessionId]);

  const loadSession = async (id: string, silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    const { data, error } = await (supabase as any)
      .from("mc_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[SessionPage] load failed:", error.message);
      if (!everLoadedRef.current) {
        // First-ever load failed — show the error state so user can retry.
        setLoadError(error.message);
      } else {
        // Transient failure on a session we already loaded — show a toast
        // but keep the existing session visible rather than blanking the UI.
        toast({
          title: "Couldn't refresh session",
          description: error.message,
          variant: "destructive",
        });
      }
      setLoading(false);
      return;
    }
    if (!data) {
      // Session genuinely doesn't exist (or was deleted).
      toast({ title: "Session not found" });
      navigate("/my-collection");
      return;
    }
    everLoadedRef.current = true;
    setSession(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await (supabase as any)
        .from("mc_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[SessionPage] load failed:", error.message);
        if (!everLoadedRef.current) {
          setLoadError(error.message);
        } else {
          toast({ title: "Couldn't refresh session", description: error.message, variant: "destructive" });
        }
        setLoading(false);
        return;
      }
      if (!data) {
        toast({ title: "Session not found" });
        navigate("/my-collection");
        return;
      }
      everLoadedRef.current = true;
      setSession(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loadError) {
    return (
      <div className="container max-w-7xl mx-auto py-20 px-4 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-destructive/60" />
        <h2 className="font-medium">Couldn't load session</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{loadError}</p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" onClick={() => sessionId && void loadSession(sessionId)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
          </Button>
          <Button variant="ghost" onClick={() => navigate("/my-collection")}>
            Back to My Collection
          </Button>
        </div>
      </div>
    );
  }

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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{session.name}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Session ID: <code className="text-[10px]">{session.id.slice(0, 8)}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WorkerStatusBadge />
          <Button variant="outline" size="sm" onClick={() => setTrashOpen(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Trash
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-3.5 h-3.5 mr-1" /> Settings
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="discover" className="gap-2">
            <Search className="w-4 h-4" /> Discover
          </TabsTrigger>
          <TabsTrigger value="resumes" className="gap-2">
            <FileText className="w-4 h-4" /> Resumes
          </TabsTrigger>
          <TabsTrigger value="board" className="gap-2">
            <Columns3 className="w-4 h-4" /> Board
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="w-4 h-4" /> Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-6">
          <DiscoverTab sessionId={session.id} session={session} />
        </TabsContent>
        <TabsContent value="resumes" className="mt-6">
          <ResumesTab sessionId={session.id} highlightResumeId={highlightResumeId} />
        </TabsContent>
        <TabsContent value="board" className="mt-6">
          <BoardTab sessionId={session.id} key={boardReloadKey} />
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

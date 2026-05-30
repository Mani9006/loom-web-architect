import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, FileText, Columns3, BarChart3, Settings, Trash2, AlertCircle } from "lucide-react";
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
  const VALID_TABS = ["discover", "resumes", "board", "stats"] as const;
  const [tab, setTab] = useState<string>(() => {
    // Priority: URL ?tab= param > sessionStorage > default "discover"
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam && (VALID_TABS as readonly string[]).includes(tabParam)) return tabParam;
    }
    if (typeof window === "undefined") return "discover";
    try {
      const stored = sessionStorage.getItem(`mc:active-tab:${window.location.pathname}`);
      return stored || "discover";
    } catch {
      return "discover";
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  // Bumped to force the Board to refresh after a Trash restore.
  const [boardReloadKey, setBoardReloadKey] = useState(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(`mc:active-tab:${window.location.pathname}`, tab);
    } catch {
      // sessionStorage can throw in private mode — non-fatal
    }
  }, [tab]);

  // Sync tab from URL ?tab= param whenever it changes (e.g. user follows a
  // "view tailored resume" link that includes ?tab=resumes).
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && (VALID_TABS as readonly string[]).includes(tabParam)) {
      setTab(tabParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
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
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        toast({ title: "Session not found" });
        navigate("/my-collection");
        return;
      }
      setSession(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when sessionId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto py-8 px-4 md:px-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="container max-w-7xl mx-auto py-8 px-4 md:px-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-6">
          <Link to="/my-collection">
            <ArrowLeft className="w-4 h-4 mr-1" /> My Collection
          </Link>
        </Button>
        <div className="flex flex-col items-center py-16 text-center gap-3">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
          <h3 className="font-medium">Couldn't load session</h3>
          {loadError && (
            <p className="text-sm text-muted-foreground max-w-sm">{loadError}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              setSession(null);
            }}
          >
            Try again
          </Button>
        </div>
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
          <ResumesTab sessionId={session.id} />
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

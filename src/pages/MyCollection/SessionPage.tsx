import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, FileText, Columns3, BarChart3, Settings, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState<MCSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>(() => {
    // URL param takes priority (e.g. ?tab=resumes from BoardTab "View tailored resume" link).
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab) return urlTab;
    // Fall back to sessionStorage so tab survives app-switches and page refreshes.
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
  // Quick stats for the session header (non-blocking, best effort).
  const [headerStats, setHeaderStats] = useState<{ total: number; applied: number; interviews: number } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(`mc:active-tab:${window.location.pathname}`, tab);
    } catch {
      // sessionStorage can throw in private mode — non-fatal
    }
    // Sync URL param so the browser URL reflects the active tab (enables direct linking).
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let hadInitialLoad = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("mc_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;

      // Don't bounce the user back to /my-collection on transient failures
      // (e.g. Supabase token refresh on tab focus, network blip). Only
      // navigate away if we KNOW the session doesn't exist on the very
      // first load — otherwise just keep showing what we already have.
      if (error) {
        console.error("[SessionPage] reload failed:", error.message);
        if (!hadInitialLoad) {
          toast({
            title: "Couldn't load session",
            description: error.message,
            variant: "destructive",
          });
        }
        setLoading(false);
        return;
      }
      if (!data) {
        if (!hadInitialLoad) {
          toast({ title: "Session not found" });
          navigate("/my-collection");
        }
        return;
      }
      hadInitialLoad = true;
      setSession(data);
      setLoading(false);
      // Load quick header stats non-blocking (failure is silent — UI degrades gracefully).
      void (async () => {
        try {
          const { data: jobs } = await (supabase as any)
            .from("mc_tracked_jobs")
            .select("status")
            .eq("session_id", sessionId)
            .is("deleted_at", null);
          const rows: { status: string }[] = jobs ?? [];
          if (!cancelled) {
            setHeaderStats({
              total: rows.length,
              applied: rows.filter((r) => r.status === "applied").length,
              interviews:
                rows.filter((r) => r.status === "interview").length +
                rows.filter((r) => r.status === "take_home").length,
            });
          }
        } catch {
          // Non-critical — header just shows session name without stats.
        }
      })();
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when sessionId changes. navigate/toast are
    // unstable references that, if included, would cause this effect to
    // re-fire on every render — which on tab focus produces a flash and
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{session.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-muted-foreground">
              ID: <code className="text-[10px]">{session.id.slice(0, 8)}</code>
            </p>
            {headerStats !== null && headerStats.total > 0 && (
              <>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <Badge variant="outline" className="text-[10px] font-normal h-5">
                  {headerStats.total} tracked
                </Badge>
                {headerStats.applied > 0 && (
                  <Badge variant="outline" className="text-[10px] font-normal h-5">
                    {headerStats.applied} applied
                  </Badge>
                )}
                {headerStats.interviews > 0 && (
                  <Badge className="text-[10px] font-normal h-5 bg-amber-100 text-amber-800 border-amber-300">
                    {headerStats.interviews} interview{headerStats.interviews === 1 ? "" : "s"}
                  </Badge>
                )}
              </>
            )}
          </div>
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
          <ResumesTab sessionId={session.id} highlightResumeId={searchParams.get("resume") ?? undefined} />
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

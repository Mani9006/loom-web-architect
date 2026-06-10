import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Search, FileText, Columns3, BarChart3, Settings, Trash2, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  const [session, setSession] = useState<MCSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>(() => {
    // Restore the active tab on remount (tab switches, browser back/forward)
    // so a tab-app switch doesn't reset the user to "discover".
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
        // eslint-disable-next-line no-console
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{session.name}</h1>
            {session.status === "archived" && (
              <Badge variant="outline" className="text-[10px] py-0 gap-1">
                <Archive className="w-3 h-3" /> Archived
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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

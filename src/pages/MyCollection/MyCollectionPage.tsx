import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Archive, Sparkles, MoreVertical, Briefcase, Search, AlertCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import NewSessionWizard from "@/components/my-collection/NewSessionWizard";
import { computeStatsBySession, type CollectionStats } from "@/lib/my-collection";

interface MCSession {
  id: string;
  name: string;
  status: "active" | "archived" | "deleted";
  master_resume_id: string | null;
  target_profile: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}


const ACTIVE_LIMIT = 5;

export default function MyCollectionPage() {
  const [sessions, setSessions] = useState<MCSession[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, CollectionStats>>({});
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  async function loadSessions() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await (supabase as any)
      .from("mc_sessions")
      .select("*")
      .neq("status", "deleted")
      .order("updated_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      toast({ title: "Couldn't load sessions", description: error.message, variant: "destructive" });
    } else {
      const rows: MCSession[] = data ?? [];
      setSessions(rows);
      // Load per-session job counts in parallel, non-blocking.
      void loadStats(rows.map((s) => s.id));
    }
    setLoading(false);
  }

  async function loadStats(sessionIds: string[]) {
    if (sessionIds.length === 0) return;
    try {
      const { data } = await (supabase as any)
        .from("mc_tracked_jobs")
        .select("session_id,status,applied_at")
        .in("session_id", sessionIds)
        .is("deleted_at", null);
      // Applied counts every card that reached "applied" or a later stage,
      // not only cards currently sitting in the Applied column.
      setStatsMap(computeStatsBySession(sessionIds, data ?? []));
    } catch {
      // Non-critical, cards just show "–" if this fails.
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const allActive = useMemo(() => sessions.filter((s) => s.status === "active"), [sessions]);
  const allArchived = useMemo(() => sessions.filter((s) => s.status === "archived"), [sessions]);
  const activeSessions = useMemo(
    () => allActive.filter((s) => sessionMatches(s, normalizedQuery)),
    [allActive, normalizedQuery],
  );
  const archivedSessions = useMemo(
    () => allArchived.filter((s) => sessionMatches(s, normalizedQuery)),
    [allArchived, normalizedQuery],
  );
  const totals = useMemo(() => {
    const values = allActive.map((s) => statsMap[s.id]).filter(Boolean) as CollectionStats[];
    return {
      onBoard: values.reduce((a, v) => a + v.total, 0),
      applied: values.reduce((a, v) => a + v.applied, 0),
      interviews: values.reduce((a, v) => a + v.interviews, 0),
      offers: values.reduce((a, v) => a + v.offers, 0),
    };
  }, [statsMap, allActive]);
  const atCap = allActive.length >= ACTIVE_LIMIT;

  async function archiveSession(id: string) {
    const { error } = await (supabase as any)
      .from("mc_sessions")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) {
      toast({ title: "Archive failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session archived", description: "Use \"Show archived\" to find it again." });
      await loadSessions();
    }
  }

  async function reactivateSession(id: string) {
    if (atCap) {
      toast({
        title: "Reached active session limit",
        description: `You can have at most ${ACTIVE_LIMIT} active sessions. Archive one first.`,
        variant: "destructive",
      });
      return;
    }
    const { error } = await (supabase as any)
      .from("mc_sessions")
      .update({ status: "active" })
      .eq("id", id);
    if (error) {
      toast({ title: "Reactivate failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session reactivated" });
      await loadSessions();
    }
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this session? This removes all jobs, resumes, and history inside it. Cannot be undone.")) return;
    const { error } = await (supabase as any).from("mc_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session deleted" });
      await loadSessions();
    }
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 md:px-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-primary" />
            My Collection
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Each session is a self-contained job search, its own resume, target profile, board, and tailored
            applications. Run multiple at once for different roles or industries.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
          <Button onClick={() => setWizardOpen(true)} disabled={atCap || loading}>
            <Plus className="w-4 h-4 mr-1" /> New Session
          </Button>
          {atCap && (
            <span className="text-[11px] text-muted-foreground">
              {ACTIVE_LIMIT}-session limit reached. Archive one to start another.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4 mb-6 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          {allActive.length}/{ACTIVE_LIMIT} active
        </Badge>
        {allArchived.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
          >
            {showArchived ? "Hide" : "Show"} {allArchived.length} archived
          </button>
        )}
        {allActive.length > 0 && (
          <span className="hidden md:inline">
            · {totals.onBoard} on board · {totals.applied} applied · {totals.interviews} interviewing
            {totals.offers > 0 ? ` · ${totals.offers} ${totals.offers === 1 ? "offer" : "offers"}` : ""}
          </span>
        )}
        {sessions.length > 3 && (
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions or roles"
              aria-label="Search sessions"
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : loadError && sessions.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive/60 mb-3" />
          <h3 className="font-medium mb-1">Couldn't load your sessions</h3>
          <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
          <Button variant="outline" onClick={() => loadSessions()}>
            <RotateCcw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </Card>
      ) : normalizedQuery && activeSessions.length === 0 && archivedSessions.length === 0 ? (
        <Card className="p-10 text-center border-dashed text-sm text-muted-foreground">
          No sessions match "{query.trim()}".{" "}
          <button type="button" className="underline" onClick={() => setQuery("")}>
            Clear search
          </button>
        </Card>
      ) : allActive.length === 0 && allArchived.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Briefcase className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-medium mb-1">No sessions yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            A session bundles your resume, target roles, and a job board. Create one to start a focused search.
          </p>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Create your first session
          </Button>
        </Card>
      ) : (
        <>
          {activeSessions.length === 0 && !normalizedQuery && (
            <Card className="p-8 text-center border-dashed text-sm text-muted-foreground">
              No active sessions.{" "}
              {!atCap && (
                <button type="button" className="underline" onClick={() => setWizardOpen(true)}>
                  Start a new one
                </button>
              )}
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                stats={statsMap[s.id]}
                onOpen={() => navigate(`/my-collection/${s.id}`)}
                onArchive={() => archiveSession(s.id)}
                onDelete={() => deleteSession(s.id)}
              />
            ))}
          </div>

          {(showArchived || (normalizedQuery && activeSessions.length === 0)) && archivedSessions.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-muted-foreground mt-10 mb-3 flex items-center gap-2">
                <Archive className="w-4 h-4" /> Archived
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                {archivedSessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    stats={statsMap[s.id]}
                    archived
                    onOpen={() => navigate(`/my-collection/${s.id}`)}
                    onReactivate={() => reactivateSession(s.id)}
                    onDelete={() => deleteSession(s.id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <NewSessionWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => {
          setWizardOpen(false);
          navigate(`/my-collection/${id}`);
        }}
      />
    </div>
  );
}

function SessionCard({
  session,
  stats,
  archived = false,
  onOpen,
  onArchive,
  onReactivate,
  onDelete,
}: {
  session: MCSession;
  stats?: CollectionStats;
  archived?: boolean;
  onOpen: () => void;
  onArchive?: () => void;
  onReactivate?: () => void;
  onDelete: () => void;
}) {
  const tp = (session.target_profile ?? {}) as Record<string, unknown>;
  const targetRoles = Array.isArray(tp.target_roles) ? (tp.target_roles as string[]) : [];

  return (
    <Card
      className="p-5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer relative group"
      onClick={onOpen}
      role="link"
      tabIndex={0}
      aria-label={`Open session ${session.name}`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-[15px] leading-tight pr-8 line-clamp-2">{session.name}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            onClick={(e) => e.stopPropagation()}
            className="absolute top-3 right-3"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Session actions"
              className="h-7 w-7 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {!archived && onArchive && (
              <DropdownMenuItem onClick={onArchive}>Archive</DropdownMenuItem>
            )}
            {archived && onReactivate && (
              <DropdownMenuItem onClick={onReactivate}>Reactivate</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {targetRoles.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {targetRoles.slice(0, 3).map((role) => (
            <Badge key={role} variant="secondary" className="text-[10px] font-normal">
              {role}
            </Badge>
          ))}
          {targetRoles.length > 3 && (
            <Badge variant="outline" className="text-[10px] font-normal">
              +{targetRoles.length - 3}
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center mt-4 pt-3 border-t">
        <SessionStat label="On board" value={stats?.total ?? "–"} />
        <SessionStat label="Applied" value={stats?.applied ?? "–"} />
        <SessionStat label="Interviews" value={stats?.interviews ?? "–"} />
      </div>

      <div className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Updated {new Date(session.updated_at).toLocaleDateString()}
      </div>
    </Card>
  );
}

function SessionStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function sessionMatches(session: MCSession, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const tp = (session.target_profile ?? {}) as Record<string, unknown>;
  const roles = Array.isArray(tp.target_roles) ? (tp.target_roles as unknown[]) : [];
  return [session.name, ...roles].some((v) => String(v ?? "").toLowerCase().includes(normalizedQuery));
}

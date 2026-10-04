import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Archive, Sparkles, MoreVertical, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import NewSessionWizard from "@/components/my-collection/NewSessionWizard";

interface MCSession {
  id: string;
  name: string;
  status: "active" | "archived" | "deleted";
  master_resume_id: string | null;
  target_profile: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SessionStats {
  discovered: number;
  applied: number;
  interviews: number;
  offers: number;
}

// A job that has moved past "applied" was still applied to, so count it.
const APPLIED_STATUSES = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_STATUSES = new Set(["interview", "take_home"]);

const ACTIVE_LIMIT = 5;

export default function MyCollectionPage() {
  const [sessions, setSessions] = useState<MCSession[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, SessionStats>>({});
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  async function loadSessions(initial = false) {
    if (initial) setLoading(true);
    const { data, error } = await (supabase as any)
      .from("mc_sessions")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
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
        .select("session_id,status")
        .in("session_id", sessionIds)
        .is("deleted_at", null);
      const rows: { session_id: string; status: string }[] = data ?? [];
      const map: Record<string, SessionStats> = {};
      for (const sid of sessionIds) {
        const jobRows = rows.filter((r) => r.session_id === sid);
        map[sid] = {
          discovered: jobRows.length,
          applied: jobRows.filter((r) => APPLIED_STATUSES.has(r.status)).length,
          interviews: jobRows.filter((r) => INTERVIEW_STATUSES.has(r.status)).length,
          offers: jobRows.filter((r) => r.status === "offer").length,
        };
      }
      setStatsMap(map);
    } catch {
      // Non-critical, cards just show a dash if this fails.
    }
  }

  useEffect(() => {
    void loadSessions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSessions = sessions.filter((s) => s.status === "active");
  const archivedSessions = sessions.filter((s) => s.status === "archived");
  const atCap = activeSessions.length >= ACTIVE_LIMIT;

  async function archiveSession(id: string) {
    const { error } = await (supabase as any)
      .from("mc_sessions")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) {
      toast({ title: "Archive failed", description: error.message, variant: "destructive" });
    } else {
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
      await loadSessions();
    }
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this session? This removes all jobs, resumes, and history inside it. Cannot be undone.")) return;
    const { error } = await (supabase as any).from("mc_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      await loadSessions();
    }
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
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
        <Button onClick={() => setWizardOpen(true)} disabled={atCap} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" /> New Session
        </Button>
      </div>

      <div className="flex items-center gap-2 mt-4 mb-6 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          {activeSessions.length}/{ACTIVE_LIMIT} active
        </Badge>
        {archivedSessions.length > 0 && (
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="hover:text-foreground transition-colors"
          >
            {showArchived ? "Hide" : "Show"} {archivedSessions.length} archived
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : activeSessions.length === 0 && archivedSessions.length === 0 ? (
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
          {activeSessions.length === 0 && (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground mb-3">
                No active sessions. Start a new one or reactivate an archived session.
              </p>
              <Button size="sm" onClick={() => setWizardOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Session
              </Button>
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

          {showArchived && archivedSessions.length > 0 && (
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
  stats?: SessionStats;
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
      className="p-5 hover:border-primary/40 transition-colors cursor-pointer relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
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
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label="Session actions">
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

      <div className="grid grid-cols-4 gap-2 text-center mt-4 pt-3 border-t">
        <SessionStat label="On board" value={stats?.discovered ?? "—"} />
        <SessionStat label="Applied" value={stats?.applied ?? "—"} />
        <SessionStat label="Interviews" value={stats?.interviews ?? "—"} />
        <SessionStat label="Offers" value={stats?.offers ?? "—"} />
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

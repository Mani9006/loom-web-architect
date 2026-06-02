import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, TrendingUp, Target, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface JobRow {
  status: string;
  applied_at: string | null;
  updated_at: string;
  created_at: string;
}

interface Counts {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  take_home: number;
  offer: number;
  rejected: number;
  hold: number;
  resumes: number;
}

const EMPTY: Counts = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  take_home: 0,
  offer: 0,
  rejected: 0,
  hold: 0,
  resumes: 0,
};

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("status,applied_at,updated_at,created_at")
            .eq("session_id", sessionId)
            .is("deleted_at", null),
          (supabase as any)
            .from("mc_tailored_resumes")
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId),
        ]);

        if (cancelled) return;
        if (jobsResult.error) throw new Error(jobsResult.error.message);
        if (resumesResult.error) throw new Error(resumesResult.error.message);

        const jobRows: JobRow[] = jobsResult.data ?? [];
        const tally = (s: string) => jobRows.filter((r) => r.status === s).length;

        setCounts({
          total: jobRows.length,
          saved: tally("saved"),
          applied: tally("applied"),
          interview: tally("interview"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          rejected: tally("rejected"),
          hold: tally("hold"),
          resumes: resumesResult.count ?? 0,
        });
        setRows(jobRows);
      } catch (e) {
        if (cancelled) return;
        toast({
          title: "Couldn't load stats",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const activeInterviews = counts.interview + counts.take_home;
  const responseRate =
    counts.applied > 0
      ? Math.round(((activeInterviews + counts.offer) / counts.applied) * 100)
      : null;

  const avgDaysToInterview = computeAvgDays(rows);

  return (
    <div className="space-y-6">
      {/* Top-line metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={loading ? "…" : counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={loading ? "…" : counts.applied}
          icon={<Target className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          value={loading ? "…" : activeInterviews}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Secondary metrics (only when there's real data) */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Offers"
            value={counts.offer}
            icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
          />
          <StatCard
            label="Rejected"
            value={counts.rejected}
            icon={<BarChart3 className="w-4 h-4 text-red-500" />}
          />
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
              highlight={responseRate >= 15}
            />
          )}
        </div>
      )}

      {/* Pipeline funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Pipeline funnel
          </h3>
          <div className="space-y-2">
            <FunnelRow label="Saved" count={counts.saved} total={counts.total} color="bg-blue-400" />
            <FunnelRow label="Applied" count={counts.applied} total={counts.total} color="bg-indigo-500" />
            <FunnelRow label="Interviewing" count={activeInterviews} total={counts.total} color="bg-amber-500" />
            <FunnelRow label="Offers" count={counts.offer} total={counts.total} color="bg-emerald-500" />
            <FunnelRow label="Rejected" count={counts.rejected} total={counts.total} color="bg-red-400" />
            {counts.hold > 0 && (
              <FunnelRow label="On hold" count={counts.hold} total={counts.total} color="bg-slate-400" />
            )}
          </div>
        </Card>
      )}

      {/* Time-to-interview (when available) */}
      {!loading && avgDaysToInterview !== null && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5" /> Avg. days applied → interview
              </div>
              <div className="text-3xl font-semibold">{avgDaysToInterview}</div>
              <div className="text-xs text-muted-foreground mt-1">days</div>
            </div>
            <div className="text-xs text-muted-foreground text-right max-w-[200px]">
              Based on {counts.interview + counts.take_home} interview{activeInterviews !== 1 ? "s" : ""} where applied_at is known.
            </div>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!loading && counts.total === 0 && (
        <Card className="p-8 text-center border-dashed">
          <Briefcase className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            No jobs on the board yet. Add some from the Discover or Board tabs to start tracking your pipeline.
          </p>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-5 ${highlight ? "border-emerald-300 bg-emerald-50/50" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className={`text-2xl font-semibold ${highlight ? "text-emerald-700" : ""}`}>{value}</div>
    </Card>
  );
}

function FunnelRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-24 text-xs text-muted-foreground shrink-0 text-right">{label}</div>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
        />
      </div>
      <div className="w-14 text-xs text-right shrink-0">
        <span className="font-medium">{count}</span>
        <span className="text-muted-foreground ml-1">({pct}%)</span>
      </div>
    </div>
  );
}

function computeAvgDays(rows: JobRow[]): number | null {
  const interviewRows = rows.filter(
    (r) => (r.status === "interview" || r.status === "take_home") && r.applied_at
  );
  if (interviewRows.length === 0) return null;

  const diffs = interviewRows
    .map((r) => {
      const applied = new Date(r.applied_at!).getTime();
      const updated = new Date(r.updated_at).getTime();
      return (updated - applied) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d >= 0 && d < 365);

  if (diffs.length === 0) return null;
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

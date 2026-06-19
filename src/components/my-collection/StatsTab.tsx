import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Briefcase,
  FileText,
  TrendingUp,
  Trophy,
  XCircle,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface JobRow {
  status: string;
  created_at: string;
  applied_at: string | null;
}

interface Counts {
  total: number;
  saved: number;
  applied: number;
  viewed: number;
  interview: number;
  take_home: number;
  offer: number;
  hold: number;
  rejected: number;
  withdrawn: number;
  resumes: number;
}

const EMPTY: Counts = {
  total: 0,
  saved: 0,
  applied: 0,
  viewed: 0,
  interview: 0,
  take_home: 0,
  offer: 0,
  hold: 0,
  rejected: 0,
  withdrawn: 0,
  resumes: 0,
};

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

function FunnelBar({
  label,
  count,
  max,
  color,
  sublabel,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
  sublabel?: string;
}) {
  const width = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-right text-xs text-muted-foreground shrink-0">{label}</div>
      <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
        <div
          className={`h-full ${color} rounded transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[11px] font-medium">
          {count}
          {sublabel && (
            <span className="ml-1.5 text-muted-foreground font-normal">{sublabel}</span>
          )}
        </span>
      </div>
    </div>
  );
}

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [avgDaysToApply, setAvgDaysToApply] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("status,created_at,applied_at")
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

        const rows: JobRow[] = jobsResult.data ?? [];
        const tally = (s: string) => rows.filter((r) => r.status === s).length;

        const appliedRows = rows.filter(
          (r) => r.applied_at && r.status !== "discovered" && r.status !== "saved"
        );
        if (appliedRows.length > 0) {
          const diffs = appliedRows
            .map((r) => {
              const created = new Date(r.created_at).getTime();
              const applied = new Date(r.applied_at!).getTime();
              return (applied - created) / (1000 * 60 * 60 * 24);
            })
            .filter((d) => d >= 0 && d < 365);
          if (diffs.length > 0) {
            setAvgDaysToApply(Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length));
          }
        }

        setCounts({
          total: rows.length,
          saved: tally("saved"),
          applied: tally("applied"),
          viewed: tally("viewed"),
          interview: tally("interview"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          hold: tally("hold"),
          rejected: tally("rejected"),
          withdrawn: tally("withdrawn"),
          resumes: resumesResult.count ?? 0,
        });
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
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const responseRate = pct(counts.interview + counts.take_home + counts.offer, counts.applied);
  const offerRate = pct(counts.offer, counts.applied);
  const interviewTotal = counts.interview + counts.take_home;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5 animate-pulse">
              <div className="h-3 w-16 bg-muted rounded mb-2" />
              <div className="h-7 w-10 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (counts.total === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Add jobs to the board to see analytics here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={counts.applied}
          icon={<TrendingUp className="w-4 h-4" />}
          subtext={counts.total > 0 ? `${pct(counts.applied, counts.total)}% of board` : undefined}
        />
        <StatCard
          label="Interviews"
          value={interviewTotal}
          icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
          subtext={responseRate !== null ? `${responseRate}% response rate` : undefined}
        />
        <StatCard
          label="Tailored resumes"
          value={counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Secondary stats */}
      {counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Offers"
            value={counts.offer}
            icon={<Trophy className="w-4 h-4 text-emerald-500" />}
            subtext={offerRate !== null ? `${offerRate}% offer rate` : undefined}
            highlight={counts.offer > 0}
          />
          <StatCard
            label="Rejected"
            value={counts.rejected}
            icon={<XCircle className="w-4 h-4 text-red-500" />}
          />
          <StatCard
            label="On hold"
            value={counts.hold}
            icon={<Clock className="w-4 h-4 text-slate-400" />}
          />
          {avgDaysToApply !== null && (
            <StatCard
              label="Avg days to apply"
              value={`${avgDaysToApply}d`}
              icon={<Clock className="w-4 h-4 text-blue-400" />}
            />
          )}
        </div>
      )}

      {/* Pipeline funnel */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Pipeline funnel</h3>
          {responseRate !== null && (
            <Badge variant="secondary" className="text-[11px]">
              {responseRate}% response rate
            </Badge>
          )}
        </div>
        <div className="space-y-2.5">
          <FunnelBar
            label="Saved"
            count={counts.saved}
            max={counts.total}
            color="bg-blue-400"
          />
          <FunnelBar
            label="Applied"
            count={counts.applied}
            max={counts.total}
            color="bg-indigo-400"
            sublabel={counts.total > 0 ? `(${pct(counts.applied, counts.total)}%)` : undefined}
          />
          <FunnelBar
            label="Viewed"
            count={counts.viewed}
            max={counts.total}
            color="bg-violet-400"
          />
          <FunnelBar
            label="Interview"
            count={interviewTotal}
            max={counts.total}
            color="bg-amber-400"
            sublabel={
              counts.applied > 0
                ? `(${pct(interviewTotal, counts.applied)}% of applied)`
                : undefined
            }
          />
          <FunnelBar
            label="Offer"
            count={counts.offer}
            max={counts.total}
            color="bg-emerald-500"
            sublabel={
              counts.applied > 0
                ? `(${pct(counts.offer, counts.applied)}% of applied)`
                : undefined
            }
          />
          {counts.rejected > 0 && (
            <FunnelBar
              label="Rejected"
              count={counts.rejected}
              max={counts.total}
              color="bg-red-400"
            />
          )}
          {counts.withdrawn > 0 && (
            <FunnelBar
              label="Withdrawn"
              count={counts.withdrawn}
              max={counts.total}
              color="bg-zinc-300"
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  subtext,
  highlight,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-5 ${highlight ? "border-emerald-200 bg-emerald-50/50" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtext && <div className="text-[11px] text-muted-foreground mt-1">{subtext}</div>}
    </Card>
  );
}

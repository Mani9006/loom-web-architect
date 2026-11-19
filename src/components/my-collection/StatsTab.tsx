import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  computeSessionStats,
  TRACKED_STATUSES,
  TRACKED_STATUS_LABELS,
  type SessionStats,
  type TrackedStatus,
} from "@/lib/mc-stats";

interface Counts {
  stats: SessionStats;
  resumes: number;
}

const EMPTY_COUNTS: Counts = { stats: computeSessionStats([]), resumes: 0 };

const BAR_TONE: Partial<Record<TrackedStatus, string>> = {
  applied: "bg-indigo-500",
  viewed: "bg-purple-500",
  interview: "bg-amber-500",
  take_home: "bg-orange-500",
  offer: "bg-emerald-500",
  rejected: "bg-red-400",
};

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("status,applied_at")
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

        setCounts({
          stats: computeSessionStats(jobsResult.data ?? []),
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

  const { stats, resumes } = counts;
  const maxBucket = Math.max(1, ...TRACKED_STATUSES.map((st) => stats.byStatus[st]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={loading ? "…" : stats.total} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard
          label="Applied"
          hint="Includes cards that moved on to later stages"
          value={loading ? "…" : stats.applied}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard label="Interviews" value={loading ? "…" : stats.interviews} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard label="Tailored resumes" value={loading ? "…" : resumes} icon={<FileText className="w-4 h-4" />} />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Offers" value={stats.offers} icon={<Star className="w-4 h-4 text-emerald-600" />} />
          <StatCard label="Rejected" value={stats.rejected} icon={<BarChart3 className="w-4 h-4 text-red-500" />} />
          {stats.responseRate !== null && (
            <StatCard
              label="Response rate"
              hint="Applications that reached interview or later"
              value={`${stats.responseRate}%`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {!loading && stats.total === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No cards yet. Save jobs from Discover or add one on the Board, and your pipeline will show up here.
          </p>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-medium">Pipeline by stage</h3>
            <span className="text-xs text-muted-foreground">{loading ? "…" : `${stats.open} still open`}</span>
          </div>
          <ul className="space-y-2">
            {TRACKED_STATUSES.map((st) => {
              const n = stats.byStatus[st];
              return (
                <li key={st} className="grid grid-cols-[90px_1fr_32px] items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{TRACKED_STATUS_LABELS[st]}</span>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${BAR_TONE[st] ?? "bg-slate-400"} transition-all`}
                      style={{ width: loading ? "0%" : `${(n / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums font-medium">{loading ? "…" : n}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  hint?: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground" title={hint}>
          {label}
        </div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

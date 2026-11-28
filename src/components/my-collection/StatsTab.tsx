import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Send, Trophy, XCircle, Percent, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  computePipelineStats,
  topCompanies,
  TRACKED_STATUSES,
  type PipelineRow,
  type PipelineStats,
  type TrackedStatus,
} from "@/lib/mc-pipeline";

const STATUS_LABELS: Record<TrackedStatus, string> = {
  discovered: "Discovered",
  saved: "Saved",
  applied: "Applied",
  viewed: "Viewed",
  interview: "Interview",
  take_home: "Take-home",
  offer: "Offer",
  hold: "Hold",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [resumeCount, setResumeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("status,applied_at,company,created_at")
            .eq("session_id", sessionId)
            .is("deleted_at", null),
          (supabase as any)
            .from("mc_tailored_resumes")
            .select("id", { count: "exact", head: true })
            .eq("session_id", sessionId),
        ]);

        if (cancelled) return;

        if (jobsResult.error) throw new Error(jobsResult.error.message);
        if (resumesResult.error) throw new Error(resumesResult.error.message);

        setRows(jobsResult.data ?? []);
        setResumeCount(resumesResult.count ?? 0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const stats: PipelineStats = computePipelineStats(rows);
  const companies = topCompanies(rows, 5);
  const v = (n: number | string) => (loading ? "…" : n);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={v(stats.total)} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard
          label="Applied"
          hint="Includes cards that moved on to interview or offer"
          value={v(stats.applied)}
          icon={<Send className="w-4 h-4" />}
        />
        <StatCard
          label="Reached interview"
          value={v(stats.reachedInterview)}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard label="Tailored resumes" value={v(resumeCount)} icon={<FileText className="w-4 h-4" />} />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Offers" value={stats.offers} icon={<Trophy className="w-4 h-4 text-emerald-600" />} />
          <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-4 h-4 text-red-500" />} />
          {stats.responseRate !== null && (
            <StatCard
              label="Response rate"
              hint="Applied cards that reached interview or offer"
              value={`${stats.responseRate}%`}
              icon={<Percent className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {!loading && stats.total === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Stats appear once you save jobs to the Board. Use Discover or "Add job manually" to get started.
          </p>
        </Card>
      ) : (
        !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-medium mb-3">Pipeline by stage</h3>
              <div className="space-y-2">
                {TRACKED_STATUSES.filter((s) => stats.byStatus[s] > 0).map((s) => {
                  const n = stats.byStatus[s];
                  const pct = Math.round((n / stats.total) * 100);
                  return (
                    <div key={s} className="text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span>{STATUS_LABELS[s]}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {n} · {pct}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full bg-muted overflow-hidden"
                        role="progressbar"
                        aria-label={`${STATUS_LABELS[s]}: ${n} of ${stats.total}`}
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-medium mb-3">Top companies</h3>
              {companies.length === 0 ? (
                <p className="text-xs text-muted-foreground">No companies yet.</p>
              ) : (
                <ul className="space-y-2">
                  {companies.map((c) => (
                    <li key={c.company} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{c.company}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {c.count} {c.count === 1 ? "card" : "cards"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )
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
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-5" title={hint}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

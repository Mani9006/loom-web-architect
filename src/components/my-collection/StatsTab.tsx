import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { summarizeTrackedJobs, TRACKED_STATUSES, type StatusRow } from "@/lib/mc-collection";

const STATUS_LABELS: Record<string, string> = {
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

interface StatusCounts {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  resumes: number;
  responseRate: number | null;
  byStatus: Record<string, number>;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  resumes: 0,
  responseRate: null,
  byStatus: {},
};

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
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

        const rows: StatusRow[] = jobsResult.data ?? [];
        const summary = summarizeTrackedJobs(rows);
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

        setCounts({
          total: summary.total,
          saved: summary.saved,
          applied: summary.applied,
          interview: summary.interviews,
          offer: summary.offers,
          rejected: summary.rejected,
          resumes: resumesResult.count ?? 0,
          responseRate: summary.responseRate,
          byStatus,
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

  const responseRate = counts.responseRate;
  const maxStatusCount = Math.max(1, ...Object.values(counts.byStatus));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={loading ? "…" : counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={loading ? "…" : counts.applied}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          value={loading ? "…" : counts.interview}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Offers"
            value={counts.offer}
            icon={<Star className="w-4 h-4 text-emerald-600" />}
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
            />
          )}
        </div>
      )}

      {!loading && counts.total > 0 ? (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">Pipeline</h3>
          <div className="space-y-2">
            {TRACKED_STATUSES.filter((s) => (counts.byStatus[s] ?? 0) > 0).map((s) => {
              const n = counts.byStatus[s] ?? 0;
              return (
                <div key={s} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 text-muted-foreground">{STATUS_LABELS[s] ?? s}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((n / maxStatusCount) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums font-medium">{n}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-4">
            Applied and Interviews are cumulative: a card that moved on to an interview or offer still counts as applied.
          </p>
        </Card>
      ) : !loading ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No cards on the board yet. Save jobs from Discover or add one manually to see your pipeline here.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

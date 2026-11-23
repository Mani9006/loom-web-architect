import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computeFunnel, type FunnelRow } from "@/lib/mc-funnel";

interface StatusCounts {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  resumes: number;
  responseRate: number | null;
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
};

const PIPELINE: { id: string; label: string }[] = [
  { id: "discovered", label: "Discovered" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "viewed", label: "Viewed" },
  { id: "interview", label: "Interview" },
  { id: "take_home", label: "Take-home" },
  { id: "offer", label: "Offer" },
  { id: "hold", label: "Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "withdrawn", label: "Withdrawn" },
];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});

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

        const rows: FunnelRow[] = jobsResult.data ?? [];
        const funnel = computeFunnel(rows);
        const tally: Record<string, number> = {};
        for (const r of rows) tally[r.status] = (tally[r.status] ?? 0) + 1;
        setByStatus(tally);

        setCounts({
          total: funnel.total,
          saved: funnel.saved,
          applied: funnel.applied,
          interview: funnel.interviews,
          offer: funnel.offers,
          rejected: funnel.rejected,
          resumes: resumesResult.count ?? 0,
          responseRate: funnel.responseRate,
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
    // toast is an unstable reference; re-running on it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const responseRate = counts.responseRate;

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
              label="Interview rate"
              value={`${responseRate}%`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {!loading && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">Pipeline</h3>
          {counts.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jobs on the board yet. Save jobs from Discover or add one manually on the Board to see your pipeline.
            </p>
          ) : (
            <ul className="space-y-2">
              {PIPELINE.filter((p) => (byStatus[p.id] ?? 0) > 0).map((p) => {
                const n = byStatus[p.id] ?? 0;
                const pct = Math.max(2, Math.round((n / counts.total) * 100));
                return (
                  <li key={p.id} className="grid grid-cols-[90px_1fr_32px] items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{p.label}</span>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right tabular-nums font-medium">{n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
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

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computePipelineStats, type PipelineStats } from "@/lib/mc-stats";

const STAGES: { id: string; label: string; bar: string }[] = [
  { id: "discovered", label: "Discovered", bar: "bg-slate-400" },
  { id: "saved", label: "Saved", bar: "bg-blue-500" },
  { id: "applied", label: "Applied", bar: "bg-indigo-500" },
  { id: "viewed", label: "Viewed", bar: "bg-purple-500" },
  { id: "interview", label: "Interview", bar: "bg-amber-500" },
  { id: "take_home", label: "Take-home", bar: "bg-orange-500" },
  { id: "offer", label: "Offer", bar: "bg-emerald-500" },
  { id: "hold", label: "Hold", bar: "bg-slate-300" },
  { id: "rejected", label: "Rejected", bar: "bg-red-500" },
  { id: "withdrawn", label: "Withdrawn", bar: "bg-slate-300" },
];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<PipelineStats>(() => computePipelineStats([]));
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

        const rows: { status: string; applied_at: string | null }[] = jobsResult.data ?? [];
        setStats(computePipelineStats(rows));
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

  const { responseRate } = stats;
  const maxStage = Math.max(1, ...STAGES.map((st) => stats.byStatus[st.id] ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={loading ? "…" : stats.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={loading ? "…" : stats.applied}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          value={loading ? "…" : stats.interviews}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : resumeCount}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Offers"
            value={stats.offers}
            icon={<Star className="w-4 h-4 text-emerald-600" />}
          />
          <StatCard
            label="Rejected"
            value={stats.rejected}
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

      {!loading && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1">Pipeline by stage</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Where every card on this session's board sits right now.
          </p>
          {stats.total === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No cards yet. Save jobs from Discover or add one on the Board to see your pipeline.
            </p>
          ) : (
            <ul className="space-y-2">
              {STAGES.map((st) => {
                const n = stats.byStatus[st.id] ?? 0;
                return (
                  <li key={st.id} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground">{st.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${st.bar}`}
                        style={{ width: `${(n / maxStage) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right tabular-nums font-medium">{n}</span>
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

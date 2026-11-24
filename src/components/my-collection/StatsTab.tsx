import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, Send, Trophy, XCircle, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computePipelineStats, type PipelineRow, type PipelineStats } from "@/lib/mc-pipeline-stats";

const FUNNEL_STAGES: { id: string; label: string; bar: string }[] = [
  { id: "discovered", label: "Discovered", bar: "bg-slate-400" },
  { id: "saved", label: "Saved", bar: "bg-blue-500" },
  { id: "applied", label: "Applied", bar: "bg-indigo-500" },
  { id: "viewed", label: "Viewed", bar: "bg-purple-500" },
  { id: "interview", label: "Interview", bar: "bg-amber-500" },
  { id: "take_home", label: "Take-home", bar: "bg-orange-500" },
  { id: "offer", label: "Offer", bar: "bg-emerald-500" },
  { id: "hold", label: "Hold", bar: "bg-stone-400" },
  { id: "rejected", label: "Rejected", bar: "bg-red-500" },
  { id: "withdrawn", label: "Withdrawn", bar: "bg-slate-300" },
];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<PipelineStats>(() => computePipelineStats([]));
  const [resumes, setResumes] = useState(0);
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
            .select("id", { count: "exact", head: true })
            .eq("session_id", sessionId),
        ]);

        if (cancelled) return;

        if (jobsResult.error) throw new Error(jobsResult.error.message);
        if (resumesResult.error) throw new Error(resumesResult.error.message);

        setStats(computePipelineStats((jobsResult.data ?? []) as PipelineRow[]));
        setResumes(resumesResult.count ?? 0);
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
    // toast is an unstable reference; only reload when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const v = (n: number | string) => (loading ? "…" : n);
  const maxStage = Math.max(1, ...FUNNEL_STAGES.map((s) => stats.byStatus[s.id] ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={v(stats.total)} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard
          label="Applied"
          value={v(stats.applied)}
          hint="Includes cards that moved past Applied"
          icon={<Send className="w-4 h-4" />}
        />
        <StatCard label="Interviews" value={v(stats.interviews)} icon={<Star className="w-4 h-4" />} />
        <StatCard label="Tailored resumes" value={v(resumes)} icon={<FileText className="w-4 h-4" />} />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Awaiting reply" value={stats.active} icon={<Activity className="w-4 h-4" />} />
          <StatCard label="Offers" value={stats.offers} icon={<Trophy className="w-4 h-4 text-emerald-600" />} />
          <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-4 h-4 text-red-500" />} />
          {stats.responseRate !== null && (
            <StatCard
              label="Interview rate"
              value={`${stats.responseRate}%`}
              hint="Interviews ÷ applications"
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Pipeline by stage</h3>
          <span className="text-xs text-muted-foreground">Current status of every card</span>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
        ) : stats.total === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No cards yet. Save jobs from Discover or add one manually on the Board.
          </div>
        ) : (
          <div className="space-y-2">
            {FUNNEL_STAGES.map((stage) => {
              const count = stats.byStatus[stage.id] ?? 0;
              const pct = Math.round((count / maxStage) * 100);
              return (
                <div key={stage.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{stage.label}</span>
                  <div
                    className="h-2.5 flex-1 rounded-full bg-muted overflow-hidden"
                    role="meter"
                    aria-label={`${stage.label}: ${count}`}
                    aria-valuenow={count}
                    aria-valuemin={0}
                    aria-valuemax={maxStage}
                  >
                    <div className={`h-full rounded-full ${stage.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
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
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

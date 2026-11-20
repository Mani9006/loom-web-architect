import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Send, Star } from "lucide-react";
import { computeSessionStats } from "@/lib/my-collection";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  { id: "withdrawn", label: "Withdrawn", bar: "bg-slate-500" },
];

interface StatsRow {
  status: string;
  applied_at: string | null;
}

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<StatsRow[]>([]);
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

        setRows((jobsResult.data as StatsRow[]) ?? []);
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

  const stats = useMemo(() => computeSessionStats(rows), [rows]);
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [rows]);
  const maxStage = Math.max(1, ...Object.values(stageCounts));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={loading ? "…" : stats.onBoard}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={loading ? "…" : stats.applied}
          icon={<Send className="w-4 h-4" />}
        />
        <StatCard
          label="Interviewing now"
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
          {stats.responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${stats.responseRate}%`}
              hint={`${stats.responses} of ${stats.applied} applications reached interview or offer`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {!loading && stats.onBoard > 0 ? (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">Pipeline by stage</h3>
          <div className="space-y-2">
            {STAGES.map((stage) => {
              const count = stageCounts[stage.id] ?? 0;
              return (
                <div key={stage.id} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{stage.label}</span>
                  <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <div
                      className={`h-full rounded-full ${stage.bar}`}
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : !loading ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Save jobs from Discover or add them on the Board to see your pipeline here.
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
  hint,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

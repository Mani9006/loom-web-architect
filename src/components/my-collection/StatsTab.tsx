import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StatusCounts {
  total: number;
  discovered: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  withdrawn: number;
  resumes: number;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  discovered: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
  resumes: 0,
};

interface StatusRow {
  status: string;
  applied_at: string | null;
  updated_at: string;
}

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
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
            .select("status,applied_at,updated_at")
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
        const tally = (s: string) => rows.filter((r) => r.status === s).length;

        const appliedRows = rows.filter((r) => r.status === "applied" && r.applied_at);
        if (appliedRows.length > 0) {
          const totalDays = appliedRows.reduce((sum, r) => {
            const discovered = new Date(r.updated_at).getTime();
            const applied = new Date(r.applied_at!).getTime();
            const days = Math.max(0, (applied - discovered) / (1000 * 60 * 60 * 24));
            return sum + days;
          }, 0);
          setAvgDaysToApply(Math.round(totalDays / appliedRows.length));
        }

        setCounts({
          total: rows.length,
          discovered: tally("discovered"),
          saved: tally("saved"),
          applied: tally("applied"),
          interview: tally("interview") + tally("take_home"),
          offer: tally("offer"),
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

  const responseRate =
    counts.applied > 0
      ? Math.round(((counts.interview + counts.offer) / counts.applied) * 100)
      : null;

  const offerRate =
    counts.applied > 0
      ? Math.round((counts.offer / counts.applied) * 100)
      : null;

  // Pipeline funnel stages
  const funnelStages = [
    { label: "On board", value: counts.total, color: "bg-slate-400" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-400" },
    { label: "Interviews", value: counts.interview, color: "bg-amber-400" },
    { label: "Offers", value: counts.offer, color: "bg-emerald-500" },
  ];

  const maxVal = funnelStages[0]?.value || 1;

  return (
    <div className="space-y-6">
      {/* Top-line stats */}
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

      {/* Pipeline funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">Application pipeline</h3>
          </div>
          <div className="space-y-2.5">
            {funnelStages.map((stage) => {
              const pct = maxVal > 0 ? Math.max((stage.value / maxVal) * 100, stage.value > 0 ? 4 : 0) : 0;
              return (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="w-20 text-[11px] text-muted-foreground text-right shrink-0">
                    {stage.label}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    >
                      {stage.value > 0 && (
                        <span className="text-white text-[10px] font-medium">{stage.value}</span>
                      )}
                    </div>
                  </div>
                  {stage.value === 0 && (
                    <span className="text-[11px] text-muted-foreground w-4">0</span>
                  )}
                </div>
              );
            })}
          </div>
          {responseRate !== null && (
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span>
                Response rate:{" "}
                <strong className="text-foreground">{responseRate}%</strong>
              </span>
              {offerRate !== null && offerRate > 0 && (
                <span>
                  Offer rate:{" "}
                  <strong className="text-emerald-600">{offerRate}%</strong>
                </span>
              )}
              {avgDaysToApply !== null && (
                <span>
                  Avg. days to apply:{" "}
                  <strong className="text-foreground">{avgDaysToApply}d</strong>
                </span>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Secondary stats — only when there's something to show */}
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
          {counts.withdrawn > 0 && (
            <StatCard
              label="Withdrawn"
              value={counts.withdrawn}
              icon={<BarChart3 className="w-4 h-4 text-zinc-400" />}
            />
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && counts.total === 0 && (
        <Card className="p-8 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Add jobs to the board and stats will appear here.
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

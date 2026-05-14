import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StatusCounts {
  total: number;
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
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
  resumes: 0,
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
            .select("status")
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

        const rows: { status: string }[] = jobsResult.data ?? [];
        const tally = (s: string) => rows.filter((r) => r.status === s).length;

        setCounts({
          total: rows.length,
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
  // toast is stable — only re-run when sessionId changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const responseRate =
    counts.applied > 0
      ? Math.round(((counts.interview + counts.offer) / counts.applied) * 100)
      : null;

  const offerRate =
    counts.interview > 0
      ? Math.round((counts.offer / counts.interview) * 100)
      : null;

  // Conversion funnel steps: [label, value, color]
  const funnelSteps: { label: string; value: number; color: string }[] = [
    { label: "On board", value: counts.total, color: "bg-slate-400" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-400" },
    { label: "Interviews", value: counts.interview, color: "bg-amber-400" },
    { label: "Offers", value: counts.offer, color: "bg-emerald-500" },
  ];
  const funnelMax = Math.max(funnelSteps[0].value, 1);

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
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          value={loading ? "…" : counts.interview}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Secondary metrics (only once there's activity) */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <StatCard
            label="Withdrawn"
            value={counts.withdrawn}
            icon={<BarChart3 className="w-4 h-4 text-zinc-400" />}
          />
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
              hint="Interviews + offers ÷ applications"
            />
          )}
        </div>
      )}

      {/* Conversion funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Conversion funnel
          </h3>
          <div className="space-y-3">
            {funnelSteps.map((step, i) => {
              const pct = Math.round((step.value / funnelMax) * 100);
              const conversionFromPrev =
                i > 0 && funnelSteps[i - 1].value > 0
                  ? Math.round((step.value / funnelSteps[i - 1].value) * 100)
                  : null;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{step.label}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {conversionFromPrev !== null && (
                        <span className="flex items-center gap-0.5 text-[10px]">
                          <ArrowRight className="w-3 h-3" />
                          {conversionFromPrev}%
                        </span>
                      )}
                      <span className="font-semibold text-foreground">{step.value}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {offerRate !== null && (
            <p className="text-[11px] text-muted-foreground mt-4">
              Interview → offer rate: <strong>{offerRate}%</strong>
            </p>
          )}
        </Card>
      )}

      {/* Placeholder for future charts */}
      <Card className="p-6 text-center border-dashed">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          More detailed charts (days-to-interview, top companies, AI tokens used) are coming in a
          future update.
        </p>
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
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

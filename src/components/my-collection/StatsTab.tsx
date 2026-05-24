import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp } from "lucide-react";
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

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

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
          saved: tally("saved") + tally("discovered"),
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

  const funnelSteps: FunnelStep[] = [
    { label: "Saved", value: counts.saved, color: "bg-blue-500" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-500" },
    { label: "Interviews", value: counts.interview, color: "bg-amber-500" },
    { label: "Offers", value: counts.offer, color: "bg-emerald-500" },
  ];

  const funnelMax = Math.max(...funnelSteps.map((s) => s.value), 1);

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
              icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {/* Application funnel */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Application funnel</h3>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" style={{ width: `${100 - i * 15}%` }} />
            ))}
          </div>
        ) : counts.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No jobs tracked yet. Add jobs to see your funnel.
          </p>
        ) : (
          <div className="space-y-2">
            {funnelSteps.map((step) => {
              const pct = Math.round((step.value / funnelMax) * 100);
              const convPct =
                step.label === "Applied" && counts.saved > 0
                  ? Math.round((step.value / counts.saved) * 100)
                  : step.label === "Interviews" && counts.applied > 0
                  ? Math.round((step.value / counts.applied) * 100)
                  : step.label === "Offers" && counts.interview > 0
                  ? Math.round((step.value / counts.interview) * 100)
                  : null;

              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {step.label}
                  </div>
                  <div className="flex-1 relative h-7 bg-muted/40 rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-500 ${step.color}`}
                      style={{ width: step.value === 0 ? "0%" : `${Math.max(pct, 4)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center pl-2 text-xs font-medium text-white mix-blend-luminosity">
                      {step.value}
                    </span>
                  </div>
                  {convPct !== null && (
                    <div className="w-12 shrink-0 text-right text-[11px] text-muted-foreground">
                      {convPct}%
                    </div>
                  )}
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

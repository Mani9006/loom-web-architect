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
  hold: number;
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
  hold: 0,
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
          saved: tally("saved"),
          applied: tally("applied"),
          interview: tally("interview") + tally("take_home"),
          offer: tally("offer"),
          rejected: tally("rejected"),
          withdrawn: tally("withdrawn"),
          hold: tally("hold"),
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
    counts.interview > 0
      ? Math.round((counts.offer / counts.interview) * 100)
      : null;

  const funnelSteps: FunnelStep[] = [
    { label: "On board", value: counts.total, color: "bg-slate-400" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-500" },
    { label: "Interviews", value: counts.interview, color: "bg-amber-500" },
    { label: "Offers", value: counts.offer, color: "bg-emerald-500" },
  ];

  const maxFunnelValue = funnelSteps[0].value || 1;

  return (
    <div className="space-y-6">
      {/* Primary KPIs */}
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

      {/* Secondary KPIs */}
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
          {counts.withdrawn > 0 && (
            <StatCard
              label="Withdrawn"
              value={counts.withdrawn}
              icon={<BarChart3 className="w-4 h-4 text-zinc-400" />}
            />
          )}
          {counts.hold > 0 && (
            <StatCard
              label="On hold"
              value={counts.hold}
              icon={<BarChart3 className="w-4 h-4 text-slate-400" />}
            />
          )}
        </div>
      )}

      {/* Conversion rates */}
      {!loading && (responseRate !== null || offerRate !== null) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
              hint="interviews ÷ applications"
            />
          )}
          {offerRate !== null && (
            <StatCard
              label="Offer rate"
              value={`${offerRate}%`}
              icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
              hint="offers ÷ interviews"
            />
          )}
        </div>
      )}

      {/* Funnel visualization */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pipeline funnel</span>
          </div>
          <div className="space-y-3">
            {funnelSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="w-20 text-[11px] text-muted-foreground text-right shrink-0">
                  {step.label}
                </div>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(2, (step.value / maxFunnelValue) * 100)}%` }}
                  />
                </div>
                <div className="w-8 text-[12px] font-medium text-right shrink-0">
                  {step.value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Placeholder for future charts when no data yet */}
      {!loading && counts.total === 0 && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Stats will appear once you start adding jobs to the board.
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
      {hint && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</div>}
    </Card>
  );
}

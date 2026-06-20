import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StatusCounts {
  total: number;
  discovered: number;
  saved: number;
  applied: number;
  viewed: number;
  interview: number;
  take_home: number;
  offer: number;
  rejected: number;
  hold: number;
  withdrawn: number;
  resumes: number;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  discovered: 0,
  saved: 0,
  applied: 0,
  viewed: 0,
  interview: 0,
  take_home: 0,
  offer: 0,
  rejected: 0,
  hold: 0,
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
          discovered: tally("discovered"),
          saved: tally("saved"),
          applied: tally("applied"),
          viewed: tally("viewed"),
          interview: tally("interview"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          rejected: tally("rejected"),
          hold: tally("hold"),
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

  const interviewTotal = counts.interview + counts.take_home;
  const responseRate =
    counts.applied > 0
      ? Math.round(((interviewTotal + counts.offer) / counts.applied) * 100)
      : null;
  const offerRate =
    interviewTotal > 0 ? Math.round((counts.offer / interviewTotal) * 100) : null;

  const funnelSteps = [
    { label: "On board", value: counts.total, color: "bg-slate-200 dark:bg-slate-700" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-200 dark:bg-indigo-800" },
    { label: "Interviews", value: interviewTotal, color: "bg-amber-200 dark:bg-amber-800" },
    { label: "Offers", value: counts.offer, color: "bg-emerald-200 dark:bg-emerald-800" },
  ];
  const funnelMax = funnelSteps[0]?.value || 1;

  return (
    <div className="space-y-6">
      {/* Top-level KPIs */}
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
          value={loading ? "…" : interviewTotal}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Conversion funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Application funnel</span>
          </div>
          <div className="space-y-2">
            {funnelSteps.map((step, i) => {
              const pct = funnelMax > 0 ? Math.round((step.value / funnelMax) * 100) : 0;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="w-20 text-right text-xs text-muted-foreground shrink-0">
                    {step.label}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                      style={{ width: `${Math.max(pct, step.value > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <div className="w-10 text-xs font-medium text-right shrink-0">
                    {step.value}
                  </div>
                  {i < funnelSteps.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {(responseRate !== null || offerRate !== null) && (
            <div className="flex gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground flex-wrap">
              {responseRate !== null && (
                <span>
                  <span className="font-semibold text-foreground">{responseRate}%</span> response rate
                  (applied → interview)
                </span>
              )}
              {offerRate !== null && (
                <span>
                  <span className="font-semibold text-foreground">{offerRate}%</span> offer rate
                  (interview → offer)
                </span>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Breakdown of all statuses */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="text-sm font-medium mb-4">Full status breakdown</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Discovered", value: counts.discovered, color: "text-slate-600" },
              { label: "Saved", value: counts.saved, color: "text-blue-600" },
              { label: "Applied", value: counts.applied, color: "text-indigo-600" },
              { label: "Viewed by recruiter", value: counts.viewed, color: "text-purple-600" },
              { label: "Interview", value: counts.interview, color: "text-amber-600" },
              { label: "Take-home", value: counts.take_home, color: "text-orange-600" },
              { label: "Offer", value: counts.offer, color: "text-emerald-600" },
              { label: "On hold", value: counts.hold, color: "text-zinc-500" },
              { label: "Rejected", value: counts.rejected, color: "text-red-600" },
              { label: "Withdrawn", value: counts.withdrawn, color: "text-zinc-400" },
            ]
              .filter((s) => s.value > 0)
              .map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground truncate">{s.label}</span>
                  <span className={`font-semibold shrink-0 ${s.color}`}>{s.value}</span>
                </div>
              ))}
          </div>
          {counts.total === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No active jobs yet.
            </p>
          )}
        </Card>
      )}

      <Card className="p-6 text-center border-dashed">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Detailed charts (days-to-interview, top companies, AI tokens used) coming in a future update.
        </p>
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

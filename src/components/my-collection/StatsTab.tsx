import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp, Clock, Award } from "lucide-react";
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
  hold: number;
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
  hold: 0,
  resumes: 0,
};

interface FunnelStage {
  label: string;
  count: number;
  color: string;
  bgColor: string;
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
          discovered: tally("discovered"),
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
  }, [sessionId, toast]);

  const responseRate =
    counts.applied > 0
      ? Math.round(((counts.interview + counts.offer) / counts.applied) * 100)
      : null;

  const offerRate =
    counts.applied > 0 ? Math.round((counts.offer / counts.applied) * 100) : null;

  const funnelStages: FunnelStage[] = [
    { label: "Saved", count: counts.saved, color: "text-blue-700", bgColor: "bg-blue-500" },
    { label: "Applied", count: counts.applied, color: "text-indigo-700", bgColor: "bg-indigo-500" },
    { label: "Interview", count: counts.interview, color: "text-amber-700", bgColor: "bg-amber-500" },
    { label: "Offer", count: counts.offer, color: "text-emerald-700", bgColor: "bg-emerald-500" },
  ];

  const funnelMax = Math.max(...funnelStages.map((s) => s.count), 1);

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
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Application funnel */}
      {!loading && counts.saved + counts.applied > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-primary" />
            Application funnel
          </h3>
          <div className="space-y-3">
            {funnelStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <div className="w-20 text-[11px] text-muted-foreground text-right shrink-0">
                  {stage.label}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stage.bgColor} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.round((stage.count / funnelMax) * 100)}%` }}
                    />
                  </div>
                  <div className={`text-sm font-semibold w-6 text-right ${stage.color}`}>
                    {stage.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Outcome stats */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Offers"
            value={counts.offer}
            icon={<Award className="w-4 h-4 text-emerald-600" />}
            highlight={counts.offer > 0 ? "emerald" : undefined}
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
              subtext="interviews + offers / applied"
            />
          )}
          {offerRate !== null && (
            <StatCard
              label="Offer rate"
              value={`${offerRate}%`}
              icon={<Star className="w-4 h-4 text-emerald-500" />}
            />
          )}
        </div>
      )}

      {/* Status breakdown */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            Status breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { label: "Discovered", count: counts.discovered, dot: "bg-slate-400" },
              { label: "Saved", count: counts.saved, dot: "bg-blue-500" },
              { label: "Applied", count: counts.applied, dot: "bg-indigo-500" },
              { label: "Interview", count: counts.interview, dot: "bg-amber-500" },
              { label: "Offer", count: counts.offer, dot: "bg-emerald-500" },
              { label: "On hold", count: counts.hold, dot: "bg-gray-400" },
              { label: "Rejected", count: counts.rejected, dot: "bg-red-500" },
              { label: "Withdrawn", count: counts.withdrawn, dot: "bg-zinc-400" },
            ]
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-sm">
                  <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                  <span className="text-muted-foreground flex-1">{s.label}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Placeholder for upcoming charts */}
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
  subtext,
  highlight,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtext?: string;
  highlight?: "emerald";
}) {
  return (
    <Card className={`p-5 ${highlight === "emerald" ? "border-emerald-200 bg-emerald-50/30" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtext && <div className="text-[10px] text-muted-foreground mt-0.5">{subtext}</div>}
    </Card>
  );
}

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
  resumes: number;
  viewed: number;
  take_home: number;
  hold: number;
  withdrawn: number;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  resumes: 0,
  viewed: 0,
  take_home: 0,
  hold: 0,
  withdrawn: 0,
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
          interview: tally("interview"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          rejected: tally("rejected"),
          viewed: tally("viewed"),
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

  const funnelStages = [
    { label: "Saved", value: counts.saved, color: "bg-blue-400" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-400" },
    { label: "Viewed", value: counts.viewed, color: "bg-purple-400" },
    { label: "Interview / Take-home", value: interviewTotal, color: "bg-amber-400" },
    { label: "Offer", value: counts.offer, color: "bg-emerald-400" },
  ];
  const funnelMax = Math.max(...funnelStages.map((s) => s.value), 1);

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
          value={loading ? "…" : interviewTotal}
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

      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Application funnel</span>
          </div>
          <div className="space-y-2.5">
            {funnelStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <div className="w-40 text-[11px] text-muted-foreground text-right shrink-0">
                  {stage.label}
                </div>
                <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${stage.color}`}
                    style={{ width: `${Math.round((stage.value / funnelMax) * 100)}%` }}
                  />
                </div>
                <div className="w-7 text-[11px] font-medium tabular-nums">{stage.value}</div>
              </div>
            ))}
          </div>
          {counts.hold > 0 || counts.rejected > 0 || counts.withdrawn > 0 ? (
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t text-[11px] text-muted-foreground">
              {counts.hold > 0 && <span>On hold: <strong>{counts.hold}</strong></span>}
              {counts.rejected > 0 && <span>Rejected: <strong className="text-red-600">{counts.rejected}</strong></span>}
              {counts.withdrawn > 0 && <span>Withdrawn: <strong>{counts.withdrawn}</strong></span>}
            </div>
          ) : null}
        </Card>
      )}

      {!loading && counts.total === 0 && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Stats will appear here once you add jobs to the board.
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

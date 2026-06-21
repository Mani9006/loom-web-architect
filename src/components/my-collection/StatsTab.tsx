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
  viewed: number;
  interview: number;
  take_home: number;
  offer: number;
  hold: number;
  rejected: number;
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
  hold: 0,
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
          discovered: tally("discovered"),
          saved: tally("saved"),
          applied: tally("applied"),
          viewed: tally("viewed"),
          interview: tally("interview"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          hold: tally("hold"),
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

  const interviewTotal = counts.interview + counts.take_home;
  const responseRate =
    counts.applied > 0
      ? Math.round(((interviewTotal + counts.offer) / counts.applied) * 100)
      : null;
  const offerRate =
    interviewTotal > 0 ? Math.round((counts.offer / interviewTotal) * 100) : null;

  // Pipeline funnel: show each stage with a count bar scaled to total.
  const pipelineStages = [
    { label: "Discovered", count: counts.discovered, color: "bg-slate-400" },
    { label: "Saved", count: counts.saved, color: "bg-blue-400" },
    { label: "Applied", count: counts.applied, color: "bg-indigo-400" },
    { label: "Viewed", count: counts.viewed, color: "bg-purple-400" },
    { label: "Interview", count: interviewTotal, color: "bg-amber-400" },
    { label: "Offer", count: counts.offer, color: "bg-emerald-400" },
  ];
  const maxCount = Math.max(...pipelineStages.map((s) => s.count), 1);

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
          {offerRate !== null && (
            <StatCard
              label="Offer rate"
              value={`${offerRate}%`}
              icon={<Star className="w-4 h-4 text-emerald-500" />}
            />
          )}
          {counts.hold > 0 && (
            <StatCard label="On hold" value={counts.hold} />
          )}
          {counts.withdrawn > 0 && (
            <StatCard label="Withdrawn" value={counts.withdrawn} />
          )}
        </div>
      )}

      {/* Pipeline funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="text-xs font-medium text-muted-foreground mb-4 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Pipeline funnel
          </div>
          <div className="space-y-2.5">
            {pipelineStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <div className="w-20 text-[11px] text-muted-foreground text-right shrink-0">
                  {stage.label}
                </div>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${stage.color}`}
                    style={{ width: `${Math.round((stage.count / maxCount) * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] font-medium w-6 text-right shrink-0">{stage.count}</div>
              </div>
            ))}
          </div>
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

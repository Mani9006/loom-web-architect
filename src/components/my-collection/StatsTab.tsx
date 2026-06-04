import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp, Trophy, XCircle } from "lucide-react";
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

const FUNNEL_STAGES = [
  { key: "saved" as const,      label: "Saved",      color: "bg-blue-500" },
  { key: "applied" as const,    label: "Applied",    color: "bg-indigo-500" },
  { key: "interview" as const,  label: "Interview",  color: "bg-amber-500" },
  { key: "offer" as const,      label: "Offer",      color: "bg-emerald-500" },
];

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
          applied: tally("applied") + tally("viewed"),
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

  // Funnel: largest value determines 100% bar width
  const funnelMax = Math.max(counts.saved, counts.applied, counts.interview, counts.offer, 1);

  return (
    <div className="space-y-4">
      {/* Top summary cards */}
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

      {/* Secondary stats (only when there's something to show) */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Offers"
            value={counts.offer}
            icon={<Trophy className="w-4 h-4 text-emerald-600" />}
          />
          <StatCard
            label="Rejected"
            value={counts.rejected}
            icon={<XCircle className="w-4 h-4 text-red-500" />}
          />
          <StatCard
            label="On hold"
            value={counts.hold}
            icon={<BarChart3 className="w-4 h-4 text-zinc-500" />}
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

      {/* Pipeline funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4">Application pipeline</h3>
          <div className="space-y-3">
            {FUNNEL_STAGES.map((stage) => {
              const val = counts[stage.key];
              const pct = Math.round((val / funnelMax) * 100);
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="w-20 text-[11px] text-muted-foreground text-right shrink-0">
                    {stage.label}
                  </div>
                  <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded transition-all duration-500`}
                      style={{ width: `${Math.max(pct, val > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <div className="w-8 text-[12px] font-medium text-right shrink-0">{val}</div>
                </div>
              );
            })}
          </div>
          {counts.applied > 0 && responseRate !== null && (
            <p className="text-[11px] text-muted-foreground mt-4 text-center">
              {responseRate}% response rate — {counts.interview + counts.offer} responses from {counts.applied} applications
            </p>
          )}
        </Card>
      )}

      {/* Empty state */}
      {!loading && counts.total === 0 && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No stats yet. Add jobs to the board — save from Discover or add manually — to start tracking
            your pipeline.
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

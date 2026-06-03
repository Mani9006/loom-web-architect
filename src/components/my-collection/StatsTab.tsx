import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
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
  discovered: number;
  viewed: number;
  take_home: number;
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
  discovered: 0,
  viewed: 0,
  take_home: 0,
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

  const responseRate =
    counts.applied > 0
      ? Math.round(((counts.interview + counts.take_home + counts.offer) / counts.applied) * 100)
      : null;

  const pipelineStages = [
    { label: "Discovered", count: counts.discovered, color: "bg-slate-400" },
    { label: "Saved", count: counts.saved, color: "bg-blue-400" },
    { label: "Applied", count: counts.applied, color: "bg-indigo-500" },
    { label: "Viewed", count: counts.viewed, color: "bg-purple-400" },
    { label: "Interview", count: counts.interview, color: "bg-amber-500" },
    { label: "Take-home", count: counts.take_home, color: "bg-orange-500" },
    { label: "Offer", count: counts.offer, color: "bg-emerald-500" },
    { label: "Hold", count: counts.hold, color: "bg-zinc-400" },
    { label: "Rejected", count: counts.rejected, color: "bg-red-400" },
    { label: "Withdrawn", count: counts.withdrawn, color: "bg-zinc-300" },
  ].filter((s) => s.count > 0);

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
          value={loading ? "…" : counts.interview + counts.take_home}
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
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {!loading && counts.total > 0 && pipelineStages.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4">Pipeline breakdown</h3>
          <div className="space-y-2.5">
            {pipelineStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-[11px] text-muted-foreground text-right">
                  {stage.label}
                </div>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stage.color} transition-all`}
                    style={{ width: `${Math.max(4, (stage.count / counts.total) * 100)}%` }}
                  />
                </div>
                <div className="w-8 text-[11px] text-muted-foreground tabular-nums">
                  {stage.count}
                </div>
              </div>
            ))}
          </div>

          {counts.total > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Total: {counts.total} cards</span>
              {responseRate !== null && (
                <span>Response rate: {responseRate}%</span>
              )}
            </div>
          )}
        </Card>
      )}

      {!loading && counts.total === 0 && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Stats will appear here once you start tracking jobs on the board.
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

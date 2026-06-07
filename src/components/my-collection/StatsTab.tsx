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
  resumes: number;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  resumes: 0,
};

interface PipelineStage {
  label: string;
  count: number;
  color: string;
  bg: string;
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
    counts.applied > 0 ? Math.round((counts.offer / counts.applied) * 100) : null;

  const pipeline: PipelineStage[] = [
    { label: "On board", count: counts.total, color: "text-slate-700", bg: "bg-slate-100" },
    { label: "Applied", count: counts.applied, color: "text-indigo-700", bg: "bg-indigo-100" },
    { label: "Interviews", count: counts.interview, color: "text-amber-700", bg: "bg-amber-100" },
    { label: "Offers", count: counts.offer, color: "text-emerald-700", bg: "bg-emerald-100" },
  ];

  const maxCount = Math.max(...pipeline.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Top stat cards */}
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

      {/* Pipeline funnel */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4">Application funnel</h3>
          <div className="space-y-3">
            {pipeline.map((stage) => {
              const pct = Math.round((stage.count / maxCount) * 100);
              return (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="w-24 text-[11px] text-muted-foreground shrink-0">{stage.label}</div>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all duration-500 ${stage.bg}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={`w-8 text-right text-sm font-semibold ${stage.color}`}>
                    {stage.count}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Outcome rates */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              sub={offerRate !== null ? `${offerRate}% offer rate` : undefined}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {/* Empty / no-data state */}
      {!loading && counts.total === 0 && (
        <Card className="p-8 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Add jobs to the board and start applying — your pipeline stats will appear here.
          </p>
        </Card>
      )}

      {/* Coming soon note */}
      {!loading && counts.total > 0 && (
        <Card className="p-5 text-center border-dashed">
          <p className="text-xs text-muted-foreground">
            Detailed charts (days-to-interview, top companies, AI tokens used) coming in a future update.
          </p>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  Briefcase,
  FileText,
  Star,
  Clock,
  XCircle,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
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

  const interviews = counts.interview + counts.take_home;
  const responseRate =
    counts.applied > 0
      ? Math.round(((interviews + counts.offer) / counts.applied) * 100)
      : null;
  const offerRate =
    counts.applied > 0 ? Math.round((counts.offer / counts.applied) * 100) : null;

  const pipeline = [
    {
      label: "Saved / Discovered",
      value: counts.discovered + counts.saved,
      color: "bg-slate-400",
    },
    { label: "Applied", value: counts.applied, color: "bg-indigo-500" },
    { label: "Interviews", value: interviews, color: "bg-amber-500" },
    { label: "Offers", value: counts.offer, color: "bg-emerald-500" },
  ];
  const pipelineMax = Math.max(...pipeline.map((p) => p.value), 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (counts.total === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No jobs on the board yet. Start discovering or add jobs manually from the Board tab.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top-level numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={counts.applied}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          value={interviews}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Pipeline funnel */}
      <Card className="p-5">
        <div className="flex items-center gap-1.5 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Application pipeline</h3>
        </div>
        <div className="space-y-3">
          {pipeline.map((stage, i) => (
            <div key={stage.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {i > 0 && <ChevronRight className="w-3 h-3 opacity-40" />}
                  {stage.label}
                </span>
                <span className="font-medium tabular-nums">{stage.value}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${stage.color} rounded-full transition-all duration-500`}
                  style={{ width: `${(stage.value / pipelineMax) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Secondary stats — only render when there are applied jobs */}
      {counts.applied > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Offers"
              value={counts.offer}
              icon={<Star className="w-4 h-4 text-emerald-600" />}
            />
            <StatCard
              label="Rejected"
              value={counts.rejected}
              icon={<XCircle className="w-4 h-4 text-red-500" />}
            />
            <StatCard
              label="On hold"
              value={counts.hold}
              icon={<Clock className="w-4 h-4 text-amber-500" />}
            />
          </div>

          {/* Conversion rates */}
          {responseRate !== null && (
            <Card className="p-5">
              <h3 className="text-sm font-medium mb-4">Conversion rates</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">
                      Response rate (interviews + offers ÷ applied)
                    </span>
                    <span className="font-medium tabular-nums">{responseRate}%</span>
                  </div>
                  <Progress value={responseRate} className="h-2" />
                </div>
                {offerRate !== null && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Offer rate (offers ÷ applied)</span>
                      <span className="font-medium tabular-nums">{offerRate}%</span>
                    </div>
                    <Progress value={offerRate} className="h-2" />
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Board breakdown */}
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-3">Board breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          {[
            { label: "Discovered", value: counts.discovered },
            { label: "Saved", value: counts.saved },
            { label: "Viewed", value: counts.viewed },
            { label: "Take-home", value: counts.take_home },
            { label: "Withdrawn", value: counts.withdrawn },
          ]
            .filter((r) => r.value > 0)
            .map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs py-1">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium tabular-nums">{row.value}</span>
              </div>
            ))}
        </div>
        {[counts.discovered, counts.saved, counts.viewed, counts.take_home, counts.withdrawn].every(
          (v) => v === 0,
        ) && (
          <p className="text-xs text-muted-foreground">
            All jobs have moved past the initial stages.
          </p>
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
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

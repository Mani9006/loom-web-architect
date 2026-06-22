import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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

const PIPELINE_STAGES = [
  { key: "discovered", label: "Discovered", color: "#94a3b8" },
  { key: "saved", label: "Saved", color: "#60a5fa" },
  { key: "applied", label: "Applied", color: "#818cf8" },
  { key: "viewed", label: "Viewed", color: "#a78bfa" },
  { key: "interview", label: "Interview", color: "#f59e0b" },
  { key: "take_home", label: "Take-home", color: "#f97316" },
  { key: "offer", label: "Offer", color: "#10b981" },
] as const;

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

  const activeApplications = counts.applied + counts.viewed + counts.interview + counts.take_home + counts.offer;
  const responseRate =
    counts.applied > 0
      ? Math.round(((counts.interview + counts.take_home + counts.offer) / counts.applied) * 100)
      : null;

  const pipelineData = PIPELINE_STAGES.map((s) => ({
    name: s.label,
    count: counts[s.key],
    color: s.color,
  }));

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total on board"
          value={loading ? "…" : counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Active pipeline"
          value={loading ? "…" : activeApplications}
          icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
        {responseRate !== null ? (
          <StatCard
            label="Response rate"
            value={`${responseRate}%`}
            icon={<Star className="w-4 h-4 text-amber-500" />}
          />
        ) : (
          <StatCard
            label="Offers"
            value={loading ? "…" : counts.offer}
            icon={<Star className="w-4 h-4 text-emerald-500" />}
          />
        )}
      </div>

      {/* Pipeline funnel chart */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Job pipeline</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={pipelineData}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 16, bottom: 0 }}
            >
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [value, "Jobs"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {pipelineData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Outcome breakdown */}
      {!loading && (counts.rejected > 0 || counts.withdrawn > 0 || counts.hold > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {counts.hold > 0 && (
            <StatCard
              label="On hold"
              value={counts.hold}
              icon={<Briefcase className="w-4 h-4 text-slate-500" />}
            />
          )}
          {counts.rejected > 0 && (
            <StatCard
              label="Rejected"
              value={counts.rejected}
              icon={<XCircle className="w-4 h-4 text-red-500" />}
            />
          )}
          {counts.withdrawn > 0 && (
            <StatCard
              label="Withdrawn"
              value={counts.withdrawn}
              icon={<XCircle className="w-4 h-4 text-slate-400" />}
            />
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && counts.total === 0 && (
        <Card className="p-8 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No jobs on the board yet. Use the Discover tab to find and add jobs.
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

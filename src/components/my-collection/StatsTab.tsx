import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

interface StatusCounts {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  resumes: number;
  discovered: number;
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
  discovered: 0,
  take_home: 0,
  hold: 0,
  withdrawn: 0,
};

const STATUS_COLORS: Record<string, string> = {
  discovered: "#94a3b8",
  saved: "#60a5fa",
  applied: "#818cf8",
  viewed: "#c084fc",
  interview: "#fbbf24",
  take_home: "#f97316",
  offer: "#22c55e",
  hold: "#a8a29e",
  rejected: "#f87171",
};

const STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered",
  saved: "Saved",
  applied: "Applied",
  viewed: "Viewed",
  interview: "Interview",
  take_home: "Take-home",
  offer: "Offer",
  hold: "Hold",
  rejected: "Rejected",
};

const PIPELINE_STAGES = ["discovered", "saved", "applied", "interview", "offer"];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [statusBreakdown, setStatusBreakdown] = useState<{ status: string; count: number }[]>([]);
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

        const newCounts: StatusCounts = {
          total: rows.length,
          discovered: tally("discovered"),
          saved: tally("saved"),
          applied: tally("applied"),
          interview: tally("interview") + tally("take_home"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          rejected: tally("rejected"),
          hold: tally("hold"),
          withdrawn: tally("withdrawn"),
          resumes: resumesResult.count ?? 0,
        };
        setCounts(newCounts);

        // Build bar chart data — only statuses that have at least 1 job.
        const breakdown = Object.entries(STATUS_LABELS)
          .map(([status, label]) => ({ status, label, count: tally(status) }))
          .filter((d) => d.count > 0);
        setStatusBreakdown(breakdown);
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

  // Pipeline funnel: percentage at each stage relative to the widest stage.
  const pipelineData = PIPELINE_STAGES.map((stage) => {
    const value =
      stage === "interview"
        ? counts.interview
        : stage === "discovered"
        ? counts.discovered
        : counts[stage as keyof StatusCounts] as number;
    return {
      stage: STATUS_LABELS[stage] ?? stage,
      value,
      color: STATUS_COLORS[stage] ?? "#94a3b8",
    };
  }).filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
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

      {/* Secondary stats */}
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

      {/* Status breakdown bar chart */}
      {!loading && statusBreakdown.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4">Jobs by status</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={statusBreakdown} margin={{ top: 16, right: 8, left: -16, bottom: 4 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  fontSize: "11px",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  background: "hsl(var(--card))",
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="count" position="top" style={{ fontSize: 11 }} />
                {statusBreakdown.map((d) => (
                  <Cell
                    key={d.status}
                    fill={STATUS_COLORS[d.status] ?? "#94a3b8"}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Pipeline funnel */}
      {!loading && pipelineData.length > 1 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4">Pipeline funnel</h3>
          <div className="space-y-2">
            {pipelineData.map((d, i) => {
              const maxVal = pipelineData[0]?.value || 1;
              const pct = Math.max(8, Math.round((d.value / maxVal) * 100));
              const conversionPct =
                i > 0 && pipelineData[i - 1].value > 0
                  ? Math.round((d.value / pipelineData[i - 1].value) * 100)
                  : null;
              return (
                <div key={d.stage} className="flex items-center gap-3">
                  <div className="w-20 text-right text-[11px] text-muted-foreground shrink-0">
                    {d.stage}
                  </div>
                  <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500 flex items-center px-2"
                      style={{ width: `${pct}%`, backgroundColor: d.color, opacity: 0.85 }}
                    >
                      <span className="text-[11px] font-medium text-white drop-shadow-sm">
                        {d.value}
                      </span>
                    </div>
                  </div>
                  {conversionPct !== null && (
                    <div className="w-14 text-[10px] text-muted-foreground shrink-0">
                      {conversionPct}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Percentages show conversion from the prior stage.
          </p>
        </Card>
      )}

      {/* Empty state */}
      {!loading && counts.total === 0 && (
        <Card className="p-8 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Stats will appear here as you save and track jobs on the Board.
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

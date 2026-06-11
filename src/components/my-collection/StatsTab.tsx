import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Briefcase, FileText, Star, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StatusCounts {
  total: number;
  discovered: number;
  saved: number;
  applied: number;
  interview: number;
  take_home: number;
  offer: number;
  rejected: number;
  withdrawn: number;
  resumes: number;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  discovered: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  take_home: 0,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
  resumes: 0,
};

// Pipeline stages shown in the funnel, in order of progression.
const FUNNEL_STAGES: { key: keyof StatusCounts; label: string; color: string; textColor: string }[] = [
  { key: "total", label: "On Board", color: "bg-slate-200", textColor: "text-slate-700" },
  { key: "saved", label: "Saved", color: "bg-blue-200", textColor: "text-blue-700" },
  { key: "applied", label: "Applied", color: "bg-indigo-300", textColor: "text-indigo-700" },
  { key: "interview", label: "Interviews", color: "bg-amber-300", textColor: "text-amber-700" },
  { key: "offer", label: "Offers", color: "bg-emerald-300", textColor: "text-emerald-700" },
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
          discovered: tally("discovered"),
          saved: tally("saved"),
          applied: tally("applied"),
          interview: tally("interview") + tally("take_home"),
          take_home: tally("take_home"),
          offer: tally("offer"),
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
      ? Math.round(((counts.interview + counts.offer) / counts.applied) * 100)
      : null;

  const offerRate =
    counts.applied > 0 ? Math.round((counts.offer / counts.applied) * 100) : null;

  const maxStage = counts.total || 1;

  return (
    <div className="space-y-6">
      {/* Top KPI row */}
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
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">Pipeline funnel</h3>
        {loading ? (
          <div className="space-y-2">
            {FUNNEL_STAGES.map((s) => (
              <div key={s.key} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : counts.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Add jobs to the board to see your pipeline.
          </p>
        ) : (
          <div className="space-y-2">
            {FUNNEL_STAGES.map((stage) => {
              const value = counts[stage.key] as number;
              const widthPct = Math.max(4, Math.round((value / maxStage) * 100));
              const prevStage = FUNNEL_STAGES[FUNNEL_STAGES.indexOf(stage) - 1];
              const prevValue = prevStage ? (counts[prevStage.key] as number) : null;
              const convRate =
                prevValue !== null && prevValue > 0
                  ? Math.round((value / prevValue) * 100)
                  : null;

              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="w-24 text-right shrink-0">
                    <span className={`text-xs font-medium ${stage.textColor}`}>{stage.label}</span>
                  </div>
                  <div className="flex-1 relative h-7 bg-muted/40 rounded">
                    <div
                      className={`absolute inset-y-0 left-0 rounded ${stage.color} transition-all duration-500`}
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2.5 text-xs font-semibold">
                      {value}
                    </span>
                  </div>
                  <div className="w-16 shrink-0 text-right">
                    {convRate !== null ? (
                      <span className="text-[11px] text-muted-foreground">{convRate}% conv.</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Conversion & outcome metrics */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
              subtitle="interviews ÷ applied"
            />
          )}
          {offerRate !== null && (
            <StatCard
              label="Offer rate"
              value={`${offerRate}%`}
              icon={<Star className="w-4 h-4 text-emerald-600" />}
              subtitle="offers ÷ applied"
            />
          )}
          <StatCard
            label="Rejected"
            value={counts.rejected}
            icon={<Briefcase className="w-4 h-4 text-red-400" />}
            subtitle={counts.applied > 0 ? `${Math.round((counts.rejected / counts.applied) * 100)}% of applied` : undefined}
          />
        </div>
      )}

      {/* Status breakdown table */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">Status breakdown</h3>
          <div className="divide-y text-sm">
            {[
              { label: "Discovered", value: counts.discovered },
              { label: "Saved", value: counts.saved },
              { label: "Applied", value: counts.applied },
              { label: "Interview / Take-home", value: counts.interview },
              { label: "Offer", value: counts.offer },
              { label: "On hold", value: counts.total - counts.discovered - counts.saved - counts.applied - counts.interview - counts.offer - counts.rejected - counts.withdrawn },
              { label: "Rejected", value: counts.rejected },
              { label: "Withdrawn", value: counts.withdrawn },
            ]
              .filter((row) => row.value > 0)
              .map((row) => (
                <div key={row.label} className="flex justify-between py-1.5">
                  <span className="text-muted-foreground text-xs">{row.label}</span>
                  <span className="font-medium text-xs tabular-nums">{row.value}</span>
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
  subtitle,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
    </Card>
  );
}

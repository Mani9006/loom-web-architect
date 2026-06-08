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

const PIPELINE_STAGES = [
  { key: "saved" as const, label: "Saved", color: "bg-blue-500" },
  { key: "applied" as const, label: "Applied", color: "bg-indigo-500" },
  { key: "interview" as const, label: "Interviewed", color: "bg-amber-500" },
  { key: "offer" as const, label: "Offer", color: "bg-emerald-500" },
  { key: "rejected" as const, label: "Rejected", color: "bg-red-400" },
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
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const responseRate =
    counts.applied > 0
      ? Math.round(((counts.interview + counts.offer) / counts.applied) * 100)
      : null;

  const maxStage = Math.max(
    counts.saved,
    counts.applied,
    counts.interview,
    counts.offer,
    counts.rejected,
    1,
  );

  const hasPipelineData = !loading && counts.total > 0;

  return (
    <div className="space-y-4">
      {/* Primary metrics */}
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

      {/* Secondary metrics — only show when there's applied activity */}
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

      {/* Pipeline bar chart — shown when there's data */}
      {hasPipelineData ? (
        <Card className="p-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Pipeline breakdown
          </h3>
          <div className="space-y-3">
            {PIPELINE_STAGES.map(({ key, label, color }) => {
              const value = counts[key];
              const pct = Math.round((value / maxStage) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-20 text-right text-[11px] text-muted-foreground shrink-0">
                    {label}
                  </div>
                  <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-sm transition-all duration-500`}
                      style={{ width: value === 0 ? "0%" : `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <div className="w-7 text-right text-[11px] font-medium tabular-nums">
                    {value}
                  </div>
                </div>
              );
            })}
          </div>
          {counts.applied > 0 && responseRate !== null && (
            <p className="text-[10px] text-muted-foreground mt-4 text-right">
              {responseRate}% response rate ({counts.interview + counts.offer} responses /{" "}
              {counts.applied} applied)
            </p>
          )}
        </Card>
      ) : (
        !loading && (
          <Card className="p-6 text-center border-dashed">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Pipeline charts will appear once you have jobs on the board. Use Discover to find
              roles, or add them manually.
            </p>
          </Card>
        )
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

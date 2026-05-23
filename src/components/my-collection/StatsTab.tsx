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
          value={loading ? "…" : counts.interview}
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

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Pipeline funnel</h3>
        </div>
        <PipelineFunnel counts={counts} loading={loading} />
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
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

const FUNNEL_STAGES: { key: keyof Pick<StatusCounts, "total" | "applied" | "interview" | "offer">; label: string; color: string }[] = [
  { key: "total", label: "On board", color: "bg-slate-400" },
  { key: "applied", label: "Applied", color: "bg-indigo-500" },
  { key: "interview", label: "Interview", color: "bg-amber-500" },
  { key: "offer", label: "Offer", color: "bg-emerald-500" },
];

function PipelineFunnel({ counts, loading }: { counts: StatusCounts; loading: boolean }) {
  const max = counts.total || 1;
  return (
    <div className="space-y-2.5">
      {FUNNEL_STAGES.map((stage) => {
        const value = counts[stage.key];
        const pct = Math.round((value / max) * 100);
        return (
          <div key={stage.key} className="flex items-center gap-3">
            <div className="w-20 text-[11px] text-muted-foreground text-right shrink-0">
              {stage.label}
            </div>
            <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all duration-500 ${stage.color}`}
                style={{ width: loading ? "0%" : `${pct}%` }}
              />
            </div>
            <div className="w-8 text-[11px] font-medium tabular-nums text-right shrink-0">
              {loading ? "…" : value}
            </div>
          </div>
        );
      })}
      {!loading && counts.total === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-2">
          No jobs on the board yet. Add some from the Discover or Board tabs.
        </p>
      )}
    </div>
  );
}

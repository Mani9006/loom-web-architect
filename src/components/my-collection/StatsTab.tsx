import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, Eye, PauseCircle, XCircle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StatusCounts {
  total: number;
  discovered: number;
  saved: number;
  applied: number;
  viewed: number;
  interview: number;
  offer: number;
  rejected: number;
  hold: number;
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
  offer: 0,
  rejected: 0,
  hold: 0,
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
          interview: tally("interview") + tally("take_home"),
          offer: tally("offer"),
          rejected: tally("rejected"),
          hold: tally("hold"),
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

  const conversionRate =
    counts.total > 0 ? Math.round((counts.applied / counts.total) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Top-line metrics */}
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

      {/* Outcome breakdown */}
      {!loading && counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
            />
          )}
          {conversionRate !== null && (
            <StatCard
              label="Apply rate"
              value={`${conversionRate}%`}
              icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
            />
          )}
        </div>
      )}

      {/* Pipeline breakdown */}
      {!loading && counts.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" /> Pipeline breakdown
          </h3>
          <div className="space-y-2">
            {[
              { label: "Discovered", value: counts.discovered, color: "bg-slate-300" },
              { label: "Saved", value: counts.saved, color: "bg-blue-400" },
              { label: "Applied", value: counts.applied, color: "bg-indigo-500" },
              { label: "Viewed by recruiter", value: counts.viewed, color: "bg-purple-400" },
              { label: "Interview / Take-home", value: counts.interview, color: "bg-amber-400" },
              { label: "Offers", value: counts.offer, color: "bg-emerald-500" },
              { label: "On hold", value: counts.hold, color: "bg-gray-300" },
              { label: "Rejected", value: counts.rejected, color: "bg-red-400" },
              { label: "Withdrawn", value: counts.withdrawn, color: "bg-gray-200" },
            ]
              .filter((row) => row.value > 0)
              .map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-xs">
                  <div className="w-36 shrink-0 text-muted-foreground">{row.label}</div>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{ width: `${Math.max(4, Math.round((row.value / counts.total) * 100))}%` }}
                    />
                  </div>
                  <div className="w-6 text-right font-medium">{row.value}</div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Supplementary counts */}
      {!loading && (counts.hold > 0 || counts.withdrawn > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {counts.hold > 0 && (
            <StatCard
              label="On hold"
              value={counts.hold}
              icon={<PauseCircle className="w-4 h-4 text-gray-400" />}
            />
          )}
          {counts.withdrawn > 0 && (
            <StatCard
              label="Withdrawn"
              value={counts.withdrawn}
              icon={<XCircle className="w-4 h-4 text-gray-400" />}
            />
          )}
        </div>
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

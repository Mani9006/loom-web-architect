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
  take_home: number;
  offer: number;
  rejected: number;
  withdrawn: number;
  resumes: number;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  take_home: 0,
  offer: 0,
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
          saved: tally("saved"),
          applied: tally("applied"),
          interview: tally("interview"),
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

  const interviewTotal = counts.interview + counts.take_home;
  const responseRate =
    counts.applied > 0
      ? Math.round(((interviewTotal + counts.offer) / counts.applied) * 100)
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
          value={loading ? "…" : interviewTotal}
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
        <h3 className="text-sm font-medium mb-4">Application pipeline</h3>
        {loading || counts.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {loading ? "Loading…" : "No jobs on the board yet. Add some via Discover or the Board tab."}
          </p>
        ) : (
          <>
            <div className="space-y-2.5">
              {[
                { label: "On board", count: counts.total, color: "bg-slate-400" },
                { label: "Applied", count: counts.applied, color: "bg-indigo-500" },
                { label: "Interviews", count: interviewTotal, color: "bg-amber-500" },
                { label: "Offers", count: counts.offer, color: "bg-emerald-500" },
                { label: "Rejected", count: counts.rejected, color: "bg-red-400" },
                ...(counts.withdrawn > 0
                  ? [{ label: "Withdrawn", count: counts.withdrawn, color: "bg-slate-300" }]
                  : []),
              ].map(({ label, count, color }) => {
                const pct = counts.total > 0 ? (count / counts.total) * 100 : 0;
                return (
                  <div
                    key={label}
                    className="grid items-center gap-3"
                    style={{ gridTemplateColumns: "88px 1fr 44px" }}
                  >
                    <span className="text-[11px] text-muted-foreground text-right">{label}</span>
                    <div className="h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color} transition-[width] duration-700 ease-out`}
                        style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-medium tabular-nums text-right">{count}</span>
                  </div>
                );
              })}
            </div>
            {counts.applied > 0 && (
              <div className="mt-4 pt-4 border-t flex flex-wrap gap-x-8 gap-y-3">
                <ConversionStat
                  label="Applied → Interview"
                  rate={Math.round((interviewTotal / counts.applied) * 100)}
                />
                {interviewTotal > 0 && (
                  <ConversionStat
                    label="Interview → Offer"
                    rate={Math.round((counts.offer / interviewTotal) * 100)}
                  />
                )}
                {counts.rejected > 0 && (
                  <ConversionStat
                    label="Reject rate"
                    rate={Math.round((counts.rejected / counts.applied) * 100)}
                  />
                )}
              </div>
            )}
          </>
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
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function ConversionStat({ label, rate }: { label: string; rate: number }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold">{rate}%</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

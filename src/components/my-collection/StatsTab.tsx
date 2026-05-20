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

  const offerRate =
    counts.interview > 0
      ? Math.round((counts.offer / counts.interview) * 100)
      : null;

  const funnelStages = [
    { label: "Saved", value: counts.saved, color: "bg-blue-400", textColor: "text-blue-700" },
    { label: "Applied", value: counts.applied, color: "bg-indigo-500", textColor: "text-indigo-700" },
    { label: "Interview", value: counts.interview, color: "bg-amber-500", textColor: "text-amber-700" },
    { label: "Offer", value: counts.offer, color: "bg-emerald-500", textColor: "text-emerald-700" },
  ];

  const maxFunnelValue = Math.max(...funnelStages.map((s) => s.value), 1);

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
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Pipeline funnel */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Application pipeline</h3>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>
        ) : counts.total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No jobs on the board yet. Add some from the Discover or Board tabs.
          </p>
        ) : (
          <div className="space-y-2">
            {funnelStages.map((stage) => {
              const pct = Math.round((stage.value / maxFunnelValue) * 100);
              return (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="w-20 text-right text-[11px] text-muted-foreground shrink-0">
                    {stage.label}
                  </div>
                  <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-sm transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={`w-8 text-right text-sm font-semibold ${stage.textColor} shrink-0`}>
                    {stage.value}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Conversion rates */}
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
            icon={<BarChart3 className="w-4 h-4 text-red-500" />}
          />
          {responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${responseRate}%`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
              note="interview + offer / applied"
            />
          )}
          {offerRate !== null && (
            <StatCard
              label="Offer rate"
              value={`${offerRate}%`}
              icon={<Star className="w-4 h-4 text-emerald-500" />}
              note="offer / interview"
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
  note,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  note?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {note && <div className="text-[9px] text-muted-foreground mt-1">{note}</div>}
    </Card>
  );
}

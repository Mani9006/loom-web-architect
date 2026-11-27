import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, Building2, FileText, Star, Send, XCircle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  computeCollectionStats,
  topCompanies,
  type CollectionStats,
  type TrackedJobLike,
} from "@/lib/my-collection";

const EMPTY_STATS: CollectionStats = computeCollectionStats([]);

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CollectionStats>(EMPTY_STATS);
  const [companies, setCompanies] = useState<{ company: string; count: number }[]>([]);
  const [resumeCount, setResumeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("status,applied_at,company")
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

        const rows: TrackedJobLike[] = jobsResult.data ?? [];
        setStats(computeCollectionStats(rows));
        setCompanies(topCompanies(rows, 5));
        setResumeCount(resumesResult.count ?? 0);
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
    // toast is an unstable reference; only refetch when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const v = (n: number | string) => (loading ? "…" : n);

  const funnel = [
    { label: "On the board", value: stats.total, tone: "bg-slate-400" },
    { label: "Applied", value: stats.applied, tone: "bg-indigo-500" },
    { label: "Interviewing", value: stats.interviews, tone: "bg-amber-500" },
    { label: "Offers", value: stats.offers, tone: "bg-emerald-500" },
  ];
  const funnelMax = Math.max(1, stats.total);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={v(stats.total)} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard label="Applied" value={v(stats.applied)} icon={<Send className="w-4 h-4" />} />
        <StatCard label="Interviews" value={v(stats.interviews)} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard label="Tailored resumes" value={v(resumeCount)} icon={<FileText className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Ready to apply" value={v(stats.pipeline)} icon={<Star className="w-4 h-4" />} />
        <StatCard
          label="Offers"
          value={v(stats.offers)}
          icon={<Star className="w-4 h-4 text-emerald-600" />}
        />
        <StatCard
          label="Rejected"
          value={v(stats.rejected)}
          icon={<XCircle className="w-4 h-4 text-red-500" />}
        />
        <StatCard
          label="Response rate"
          value={v(stats.responseRate === null ? "—" : `${stats.responseRate}%`)}
          hint="Applications that reached interview, take-home, or offer"
          icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
        />
      </div>

      {!loading && stats.total === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Save jobs from Discover or add them to the Board to start tracking your pipeline here.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-medium mb-4">Pipeline</h3>
            <div className="space-y-3">
              {funnel.map((step) => (
                <div key={step.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{step.label}</span>
                    <span className="font-medium tabular-nums">{v(step.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${step.tone} transition-all`}
                      style={{ width: loading ? "0%" : `${(step.value / funnelMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-medium mb-4">Top companies</h3>
            {companies.length === 0 ? (
              <p className="text-xs text-muted-foreground">{loading ? "Loading…" : "No companies yet."}</p>
            ) : (
              <ul className="space-y-2">
                {companies.map((c) => (
                  <li key={c.company} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{c.company}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {c.count} {c.count === 1 ? "card" : "cards"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-5" title={hint}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

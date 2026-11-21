import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, Building2, CalendarCheck, FileText, Send, Star, Trophy, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computePipelineStats, type PipelineStats } from "@/lib/mc-pipeline";

const EMPTY_STATS: PipelineStats = computePipelineStats([]);

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<PipelineStats>(EMPTY_STATS);
  const [resumes, setResumes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("status,company,applied_at")
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

        setStats(computePipelineStats(jobsResult.data ?? []));
        setResumes(resumesResult.count ?? 0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const v = (n: number | string) => (loading ? "…" : n);

  const funnel = [
    { label: "On the board", value: stats.total, cls: "bg-slate-400" },
    { label: "Applied", value: stats.applied, cls: "bg-indigo-500" },
    { label: "Interviewed", value: stats.interviews, cls: "bg-amber-500" },
    { label: "Offers", value: stats.offers, cls: "bg-emerald-500" },
  ];
  const funnelMax = Math.max(1, stats.total);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={v(stats.total)} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard
          label="Applied"
          value={v(stats.applied)}
          hint={!loading && stats.appliedThisWeek > 0 ? `${stats.appliedThisWeek} this week` : undefined}
          icon={<Send className="w-4 h-4" />}
        />
        <StatCard label="Interviews" value={v(stats.interviews)} icon={<CalendarCheck className="w-4 h-4" />} />
        <StatCard label="Tailored resumes" value={v(resumes)} icon={<FileText className="w-4 h-4" />} />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Awaiting reply" value={stats.awaiting} icon={<Star className="w-4 h-4" />} />
          <StatCard label="Offers" value={stats.offers} icon={<Trophy className="w-4 h-4 text-emerald-600" />} />
          <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-4 h-4 text-red-500" />} />
          <StatCard
            label="Interview rate"
            value={stats.responseRate === null ? "—" : `${stats.responseRate}%`}
            hint="Interviews ÷ applications"
            icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
          />
        </div>
      )}

      {!loading && stats.total === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Save jobs from Discover or add them to the Board to see your pipeline here.
          </p>
        </Card>
      ) : (
        !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-medium mb-4">Pipeline</h3>
              <div className="space-y-3">
                {funnel.map((step) => (
                  <div key={step.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{step.label}</span>
                      <span className="font-medium tabular-nums">{step.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${step.cls}`}
                        style={{ width: `${(step.value / funnelMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {stats.saved > 0 && stats.applied === 0 && (
                <p className="text-xs text-muted-foreground mt-4">
                  You have {stats.saved} saved {stats.saved === 1 ? "job" : "jobs"}. Move a card to Applied on the
                  Board once you submit.
                </p>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-medium mb-4">Top companies</h3>
              {stats.topCompanies.length === 0 ? (
                <p className="text-xs text-muted-foreground">No companies yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.topCompanies.map((c) => (
                    <li key={c.company} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{c.company}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {c.count} {c.count === 1 ? "role" : "roles"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

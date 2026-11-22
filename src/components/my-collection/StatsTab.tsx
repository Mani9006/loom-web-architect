import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, Send, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computeFunnel, type FunnelCounts } from "@/lib/mc-funnel";

const STAGES: { id: string; label: string }[] = [
  { id: "discovered", label: "Discovered" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "viewed", label: "Viewed" },
  { id: "interview", label: "Interview" },
  { id: "take_home", label: "Take-home" },
  { id: "offer", label: "Offer" },
  { id: "hold", label: "Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "withdrawn", label: "Withdrawn" },
];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [funnel, setFunnel] = useState<FunnelCounts>(() => computeFunnel([]));
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
            .select("status,applied_at")
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

        // Cumulative funnel: cards that moved past "Applied" still count as
        // applied, which keeps the interview rate between 0 and 100%.
        setFunnel(computeFunnel(jobsResult.data ?? []));
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
  const maxStage = Math.max(1, ...STAGES.map((s) => funnel.byStatus[s.id] ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={v(funnel.total)} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard
          label="Applied"
          value={v(funnel.applied)}
          hint="Includes cards that moved on to later stages"
          icon={<Send className="w-4 h-4" />}
        />
        <StatCard label="Interviews" value={v(funnel.interviews)} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard label="Tailored resumes" value={v(resumes)} icon={<FileText className="w-4 h-4" />} />
      </div>

      {!loading && funnel.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Interview rate"
            value={funnel.interviewRate !== null ? `${funnel.interviewRate}%` : "—"}
            hint="Interviews ÷ applied"
            icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
          />
          <StatCard
            label="Offers"
            value={funnel.offers}
            hint={funnel.offerRate !== null ? `${funnel.offerRate}% of applications` : undefined}
            icon={<Trophy className="w-4 h-4 text-emerald-600" />}
          />
          <StatCard
            label="Still in play"
            value={funnel.active}
            hint="Applied, awaiting a decision"
            icon={<Star className="w-4 h-4" />}
          />
          <StatCard
            label="Rejected"
            value={funnel.rejected}
            icon={<BarChart3 className="w-4 h-4 text-red-500" />}
          />
        </div>
      )}

      {!loading && funnel.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">Cards by stage</h3>
          <div className="space-y-1.5">
            {STAGES.map((s) => {
              const count = funnel.byStatus[s.id] ?? 0;
              return (
                <div key={s.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{s.label}</span>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden" aria-hidden>
                    <div
                      className="h-full rounded bg-primary/70"
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loading && funnel.total === 0 && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Save jobs from Discover or add them manually on the Board, and your funnel will show up here.
          </p>
        </Card>
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
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Briefcase, FileText, Star, Trophy, XCircle, TrendingUp, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computeCollectionStats, type CollectionStats, type TrackedStatus } from "@/lib/my-collection";

const PIPELINE: { id: TrackedStatus; label: string; bar: string }[] = [
  { id: "discovered", label: "Discovered", bar: "bg-slate-400" },
  { id: "saved", label: "Saved", bar: "bg-blue-500" },
  { id: "applied", label: "Applied", bar: "bg-indigo-500" },
  { id: "viewed", label: "Viewed", bar: "bg-purple-500" },
  { id: "interview", label: "Interview", bar: "bg-amber-500" },
  { id: "take_home", label: "Take-home", bar: "bg-orange-500" },
  { id: "offer", label: "Offer", bar: "bg-emerald-500" },
  { id: "hold", label: "Hold", bar: "bg-slate-300" },
  { id: "rejected", label: "Rejected", bar: "bg-red-500" },
  { id: "withdrawn", label: "Withdrawn", bar: "bg-slate-300" },
];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CollectionStats>(() => computeCollectionStats([]));
  const [resumeCount, setResumeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
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

        setStats(computeCollectionStats(jobsResult.data ?? []));
        setResumeCount(resumesResult.count ?? 0);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        toast({ title: "Couldn't load stats", description: message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reloadToken]);

  if (error && !loading) {
    return (
      <Card className="p-8 text-center border-dashed">
        <p className="text-sm text-muted-foreground mb-4">Stats couldn't be loaded right now.</p>
        <Button variant="outline" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
        </Button>
      </Card>
    );
  }

  const v = (n: number | string) => (loading ? "…" : n);
  const maxStage = Math.max(1, ...PIPELINE.map((p) => stats.byStatus[p.id]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="On the board" value={v(stats.total)} icon={<Briefcase className="w-4 h-4" />} />
        <StatCard
          label="Applied"
          hint="Includes cards that moved on to later stages"
          value={v(stats.applied)}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          hint="Interview, take-home, or offer"
          value={v(stats.interviews)}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard label="Tailored resumes" value={v(resumeCount)} icon={<FileText className="w-4 h-4" />} />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Offers" value={stats.offers} icon={<Trophy className="w-4 h-4 text-emerald-600" />} />
          <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-4 h-4 text-red-500" />} />
          <StatCard
            label="Interview rate"
            hint="Applications that reached interview or later"
            value={`${stats.responseRate ?? 0}%`}
            icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
          />
        </div>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">Pipeline</h3>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : stats.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on the board yet. Save jobs from Discover or add one manually on the Board tab, and your
            pipeline will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {PIPELINE.map((stage) => {
              const count = stats.byStatus[stage.id];
              return (
                <li key={stage.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{stage.label}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <div
                      className={`h-full rounded-full ${stage.bar}`}
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums font-medium">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!loading && stats.total > 0 && <NextStepHint stats={stats} resumeCount={resumeCount} />}
    </div>
  );
}

function NextStepHint({ stats, resumeCount }: { stats: CollectionStats; resumeCount: number }) {
  let message: string;
  if (stats.applied === 0) {
    message =
      stats.saved > 0
        ? `You have ${stats.saved} saved ${stats.saved === 1 ? "job" : "jobs"}. Tailor a resume and apply, then move the card to Applied.`
        : "Save the jobs you like from Discover, then tailor a resume for each.";
  } else if (resumeCount < stats.applied) {
    message = "Some applications went out without a tailored resume. Tailoring to the job description usually improves response rates.";
  } else if (stats.interviews === 0 && stats.applied >= 10) {
    message = "No interviews yet after 10+ applications. Review your target roles in Settings or broaden your search.";
  } else {
    message = "Keep your board current. Moving cards as things change keeps these numbers accurate.";
  }
  return (
    <Card className="p-4 border-dashed text-sm text-muted-foreground flex items-start gap-2">
      <TrendingUp className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
      <span>{message}</span>
    </Card>
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
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

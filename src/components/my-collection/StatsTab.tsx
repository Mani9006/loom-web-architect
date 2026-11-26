import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computeCollectionStats, type CollectionStats } from "@/lib/mc-collection";

const PIPELINE: { id: string; label: string; bar: string }[] = [
  { id: "discovered", label: "Discovered", bar: "bg-slate-400" },
  { id: "saved", label: "Saved", bar: "bg-blue-500" },
  { id: "applied", label: "Applied", bar: "bg-indigo-500" },
  { id: "viewed", label: "Viewed", bar: "bg-purple-500" },
  { id: "interview", label: "Interview", bar: "bg-amber-500" },
  { id: "take_home", label: "Take-home", bar: "bg-orange-500" },
  { id: "offer", label: "Offer", bar: "bg-emerald-500" },
  { id: "hold", label: "Hold", bar: "bg-slate-300" },
  { id: "rejected", label: "Rejected", bar: "bg-red-500" },
  { id: "withdrawn", label: "Withdrawn", bar: "bg-slate-500" },
];

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CollectionStats>(() => computeCollectionStats([]));
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
            .select("status,applied_at")
            .eq("session_id", sessionId)
            .is("deleted_at", null)
            .limit(10000),
          (supabase as any)
            .from("mc_tailored_resumes")
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId),
        ]);

        if (cancelled) return;

        if (jobsResult.error) throw new Error(jobsResult.error.message);
        if (resumesResult.error) throw new Error(resumesResult.error.message);

        // Applications that progressed to Interview/Offer/Rejected still
        // count as applied, so the response rate can't exceed 100%.
        setStats(computeCollectionStats(jobsResult.data ?? []));
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

  const maxBucket = Math.max(1, ...PIPELINE.map((p) => stats.byStatus[p.id] ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={loading ? "…" : stats.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={loading ? "…" : stats.applied}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Interviews"
          value={loading ? "…" : stats.interviews}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <StatCard
          label="Tailored resumes"
          value={loading ? "…" : resumeCount}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {!loading && stats.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Offers"
            value={stats.offers}
            icon={<Star className="w-4 h-4 text-emerald-600" />}
          />
          <StatCard
            label="Rejected"
            value={stats.rejected}
            icon={<BarChart3 className="w-4 h-4 text-red-500" />}
          />
          {stats.responseRate !== null && (
            <StatCard
              label="Response rate"
              value={`${stats.responseRate}%`}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            />
          )}
        </div>
      )}

      {!loading && stats.total === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No cards yet. Save jobs from Discover or add one manually on the Board, and your pipeline
            will show up here.
          </p>
        </Card>
      ) : (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1">Pipeline</h3>
          <p className="text-xs text-muted-foreground mb-4">Where every card on the board sits right now.</p>
          <div className="space-y-2">
            {PIPELINE.map((p) => {
              const n = stats.byStatus[p.id] ?? 0;
              return (
                <div key={p.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{p.label}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p.bar} transition-[width]`}
                      style={{ width: loading ? "0%" : `${(n / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums font-medium">{loading ? "…" : n}</span>
                </div>
              );
            })}
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

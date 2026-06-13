import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Briefcase, FileText, Star, TrendingUp, XCircle, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface JobRow {
  status: string;
  applied_at: string | null;
}

interface Counts {
  total: number;
  discovered: number;
  saved: number;
  applied: number;
  viewed: number;
  interview: number;
  take_home: number;
  offer: number;
  hold: number;
  rejected: number;
  withdrawn: number;
  resumes: number;
}

const EMPTY: Counts = {
  total: 0,
  discovered: 0,
  saved: 0,
  applied: 0,
  viewed: 0,
  interview: 0,
  take_home: 0,
  offer: 0,
  hold: 0,
  rejected: 0,
  withdrawn: 0,
  resumes: 0,
};

const PIPELINE_STAGES = [
  { key: "discovered" as const, label: "Discovered", color: "bg-slate-400 dark:bg-slate-500" },
  { key: "saved" as const, label: "Saved", color: "bg-blue-400 dark:bg-blue-500" },
  { key: "applied" as const, label: "Applied", color: "bg-indigo-500" },
  { key: "interview" as const, label: "Interview", color: "bg-amber-500" },
  { key: "take_home" as const, label: "Take-home", color: "bg-orange-500" },
  { key: "offer" as const, label: "Offer", color: "bg-emerald-500" },
];

function pct(num: number, den: number): string | null {
  if (!den) return null;
  return `${Math.round((num / den) * 100)}%`;
}

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Counts>(EMPTY);
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

        const rows: JobRow[] = jobsResult.data ?? [];
        const tally = (s: string) => rows.filter((r) => r.status === s).length;

        setCounts({
          total: rows.length,
          discovered: tally("discovered"),
          saved: tally("saved"),
          applied: tally("applied"),
          viewed: tally("viewed"),
          interview: tally("interview"),
          take_home: tally("take_home"),
          offer: tally("offer"),
          hold: tally("hold"),
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
    return () => { cancelled = true; };
  }, [sessionId]);

  const responseRate = pct(counts.interview + counts.take_home + counts.offer, counts.applied);
  const offerRate = pct(counts.offer, counts.applied);
  const maxStageCount = Math.max(
    counts.discovered,
    counts.saved,
    counts.applied,
    counts.interview,
    counts.take_home,
    counts.offer,
    1,
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (counts.total === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No jobs on the board yet. Stats will appear here once you start tracking applications.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied"
          value={counts.applied}
          icon={<Star className="w-4 h-4" />}
          note={counts.total ? pct(counts.applied, counts.total) ?? undefined : undefined}
          noteLabel="of tracked"
        />
        <StatCard
          label="In interviews"
          value={counts.interview + counts.take_home}
          icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
          note={responseRate ?? undefined}
          noteLabel="response rate"
          highlight={!!responseRate}
        />
        <StatCard
          label="Tailored resumes"
          value={counts.resumes}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      {/* Secondary metrics when there's applied data */}
      {counts.applied > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Offers"
            value={counts.offer}
            icon={<Award className="w-4 h-4 text-emerald-500" />}
            note={offerRate ?? undefined}
            noteLabel="offer rate"
            highlight={counts.offer > 0}
          />
          <StatCard
            label="Rejected"
            value={counts.rejected}
            icon={<XCircle className="w-4 h-4 text-red-500" />}
            note={pct(counts.rejected, counts.applied) ?? undefined}
            noteLabel="of applied"
          />
          <StatCard
            label="On hold"
            value={counts.hold}
            icon={<BarChart3 className="w-4 h-4 text-muted-foreground" />}
          />
        </div>
      )}

      {/* Pipeline funnel */}
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          Pipeline funnel
        </h3>
        <div className="space-y-3">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = counts[stage.key];
            const prevKey = idx > 0 ? PIPELINE_STAGES[idx - 1].key : null;
            const prevCount = prevKey ? counts[prevKey] : null;
            const conversion = prevCount != null ? pct(count, prevCount) : null;
            const barWidth = maxStageCount > 0 ? Math.round((count / maxStageCount) * 100) : 0;

            return (
              <div key={stage.key} className="flex items-center gap-3">
                <div className="w-24 text-[11px] text-muted-foreground text-right shrink-0">
                  {stage.label}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${stage.color}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-6 text-right shrink-0">{count}</span>
                  {conversion !== null && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-normal w-14 justify-center shrink-0 ${
                        count === 0 ? "opacity-30" : ""
                      }`}
                    >
                      {conversion} →
                    </Badge>
                  )}
                  {conversion === null && <div className="w-14 shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Exits */}
        {(counts.rejected > 0 || counts.withdrawn > 0) && (
          <div className="mt-4 pt-4 border-t flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {counts.rejected > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-red-400" />
                {counts.rejected} rejected
              </span>
            )}
            {counts.withdrawn > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-zinc-400" />
                {counts.withdrawn} withdrawn
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Status breakdown badge cloud */}
      {counts.viewed > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Also:</span>
          {counts.viewed > 0 && (
            <Badge variant="secondary" className="font-normal">
              {counts.viewed} viewed
            </Badge>
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
  noteLabel,
  highlight,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  note?: string;
  noteLabel?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-5 ${highlight ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {note && (
        <div className={`text-[11px] mt-1 ${highlight ? "text-primary" : "text-muted-foreground"}`}>
          {note} {noteLabel}
        </div>
      )}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computeFunnel, type FunnelRow } from "@/lib/my-collection";

interface StatusCounts {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  resumes: number;
  responseRate: number | null;
}

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  resumes: 0,
  responseRate: null,
};

const PAGE = 1000;

/** Loads every non-deleted card for the session, paging past PostgREST's 1000-row cap. */
async function loadAllStatusRows(sessionId: string): Promise<FunnelRow[]> {
  const rows: FunnelRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .select("status,applied_at")
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch: FunnelRow[] = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, resumesResult] = await Promise.all([
          loadAllStatusRows(sessionId),
          (supabase as any)
            .from("mc_tailored_resumes")
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId),
        ]);

        if (cancelled) return;

        if (resumesResult.error) throw new Error(resumesResult.error.message);

        // "Applied" is cumulative (cards that later moved to Interview/Offer
        // still count), so the response rate stays within 0-100%.
        const funnel = computeFunnel(rows);
        setCounts({
          total: funnel.total,
          saved: funnel.saved,
          applied: funnel.applied,
          interview: funnel.interviews,
          offer: funnel.offers,
          rejected: funnel.rejected,
          resumes: resumesResult.count ?? 0,
          responseRate: funnel.responseRate,
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

  const responseRate = counts.responseRate;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="On the board"
          value={loading ? "…" : counts.total}
          icon={<Briefcase className="w-4 h-4" />}
        />
        <StatCard
          label="Applied (all time)"
          value={loading ? "…" : counts.applied}
          icon={<Star className="w-4 h-4" />}
        />
        <StatCard
          label="Reached interview"
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

      {!loading && counts.total > 0 && counts.applied === 0 && (
        <Card className="p-5 border-dashed">
          <p className="text-sm text-muted-foreground">
            {counts.saved > 0
              ? `You have ${counts.saved} saved ${counts.saved === 1 ? "job" : "jobs"} waiting. Tailor a resume and apply, then move the card to Applied on the Board to start tracking your response rate.`
              : "Move a card to Applied on the Board once you submit an application to start tracking your response rate."}
          </p>
        </Card>
      )}

      {!loading && counts.total === 0 && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No jobs on the board yet. Find or add jobs in Discover and your pipeline stats will appear here.
          </p>
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

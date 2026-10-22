import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, Briefcase, FileText, Star, Clock3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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

const INTERVIEW_STATUSES = new Set(["interview", "take_home", "offer"]);

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [topCompanies, setTopCompanies] = useState<{ name: string; value: number }[]>([]);
  const [avgDaysToInterview, setAvgDaysToInterview] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobsResult, resumesResult] = await Promise.all([
          (supabase as any)
            .from("mc_tracked_jobs")
            .select("id,status,company,created_at")
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

        const rows: { id: string; status: string; company: string; created_at: string }[] = jobsResult.data ?? [];
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

        const companyCounts = new Map<string, number>();
        for (const row of rows) {
          if (!row.company) continue;
          companyCounts.set(row.company, (companyCounts.get(row.company) || 0) + 1);
        }
        setTopCompanies(
          Array.from(companyCounts.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5),
        );

        const interviewedJobIds = rows.filter((r) => INTERVIEW_STATUSES.has(r.status)).map((r) => r.id);
        if (interviewedJobIds.length > 0) {
          const { data: history } = await (supabase as any)
            .from("mc_status_history")
            .select("tracked_job_id,status_to,created_at")
            .in("tracked_job_id", interviewedJobIds)
            .in("status_to", ["interview", "take_home", "offer"])
            .order("created_at", { ascending: true });
          if (!cancelled && history) {
            const firstInterviewAt = new Map<string, string>();
            for (const entry of history as { tracked_job_id: string; created_at: string }[]) {
              if (!firstInterviewAt.has(entry.tracked_job_id)) firstInterviewAt.set(entry.tracked_job_id, entry.created_at);
            }
            const deltas: number[] = [];
            for (const row of rows) {
              const reachedAt = firstInterviewAt.get(row.id);
              if (!reachedAt) continue;
              const days = (new Date(reachedAt).getTime() - new Date(row.created_at).getTime()) / 86_400_000;
              if (days >= 0) deltas.push(days);
            }
            if (deltas.length > 0) {
              setAvgDaysToInterview(Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10);
            }
          }
        }
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

      {!loading && (topCompanies.length > 0 || avgDaysToInterview !== null) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topCompanies.length > 0 && (
            <Card className="p-5">
              <div className="text-xs text-muted-foreground mb-3">Top companies on this board</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topCompanies} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(12,76%,58%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          {avgDaysToInterview !== null && (
            <StatCard
              label="Avg. days to interview"
              value={`${avgDaysToInterview}d`}
              icon={<Clock3 className="w-4 h-4" />}
            />
          )}
        </div>
      )}

      {!loading && topCompanies.length === 0 && avgDaysToInterview === null && (
        <Card className="p-6 text-center border-dashed">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Track a few jobs on the board to see company breakdowns and time-to-interview here.
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

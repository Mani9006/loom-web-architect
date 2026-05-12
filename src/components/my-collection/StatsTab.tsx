import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface StatusCounts {
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
}

interface StatsData {
  statusCounts: StatusCounts;
  totalTracked: number;
  totalResumes: number;
  avgAtsScore: number | null;
  responseRate: number | null;
  interviewRate: number | null;
}

const EMPTY_COUNTS: StatusCounts = {
  discovered: 0, saved: 0, applied: 0, viewed: 0, interview: 0,
  take_home: 0, offer: 0, hold: 0, rejected: 0, withdrawn: 0,
};

export default function StatsTab({ sessionId }: { sessionId: string }) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [jobsRes, resumesRes] = await Promise.all([
        (supabase as any)
          .from("mc_tracked_jobs")
          .select("status")
          .eq("session_id", sessionId)
          .is("deleted_at", null),
        (supabase as any)
          .from("mc_tailored_resumes")
          .select("ats_score")
          .eq("session_id", sessionId),
      ]);

      const jobs = (jobsRes.data ?? []) as { status: keyof StatusCounts }[];
      const resumes = (resumesRes.data ?? []) as { ats_score: number | null }[];

      const statusCounts: StatusCounts = { ...EMPTY_COUNTS };
      for (const j of jobs) {
        if (j.status in statusCounts) statusCounts[j.status]++;
      }

      const totalTracked = jobs.length;
      const totalResumes = resumes.length;

      const scoresWithValues = resumes.map((r) => r.ats_score).filter((s): s is number => s !== null);
      const avgAtsScore = scoresWithValues.length
        ? Math.round(scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length)
        : null;

      const applied = statusCounts.applied + statusCounts.viewed + statusCounts.interview +
        statusCounts.take_home + statusCounts.offer + statusCounts.rejected + statusCounts.hold;
      const responseRate = applied > 0
        ? Math.round(((statusCounts.viewed + statusCounts.interview + statusCounts.take_home + statusCounts.offer) / applied) * 100)
        : null;
      const interviewRate = applied > 0
        ? Math.round(((statusCounts.interview + statusCounts.take_home + statusCounts.offer) / applied) * 100)
        : null;

      setStats({ statusCounts, totalTracked, totalResumes, avgAtsScore, responseRate, interviewRate });
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading stats…</div>;
  }

  if (!stats) return null;

  const { statusCounts, totalTracked, totalResumes, avgAtsScore, responseRate, interviewRate } = stats;

  const pipelineStages = [
    { key: "discovered" as const, label: "Discovered", color: "bg-slate-100 text-slate-700" },
    { key: "saved" as const, label: "Saved", color: "bg-blue-100 text-blue-700" },
    { key: "applied" as const, label: "Applied", color: "bg-indigo-100 text-indigo-700" },
    { key: "viewed" as const, label: "Viewed", color: "bg-purple-100 text-purple-700" },
    { key: "interview" as const, label: "Interview", color: "bg-amber-100 text-amber-700" },
    { key: "take_home" as const, label: "Take-home", color: "bg-orange-100 text-orange-700" },
    { key: "offer" as const, label: "Offer", color: "bg-emerald-100 text-emerald-700" },
    { key: "rejected" as const, label: "Rejected", color: "bg-red-100 text-red-700" },
    { key: "hold" as const, label: "On hold", color: "bg-zinc-100 text-zinc-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total on board" value={totalTracked} />
        <StatCard label="Tailored resumes" value={totalResumes} />
        <StatCard
          label="Response rate"
          value={responseRate !== null ? `${responseRate}%` : "—"}
          sublabel="applied → viewed/interview"
        />
        <StatCard
          label="Interview rate"
          value={interviewRate !== null ? `${interviewRate}%` : "—"}
          sublabel="applied → interview/offer"
        />
      </div>

      {avgAtsScore !== null && (
        <Card className="p-4 flex items-center gap-3">
          <div className="text-2xl font-semibold">{avgAtsScore}/100</div>
          <div>
            <div className="text-sm font-medium">Average ATS score</div>
            <div className="text-xs text-muted-foreground">across {totalResumes} tailored resume{totalResumes !== 1 ? "s" : ""}</div>
          </div>
          <Badge
            variant="outline"
            className={`ml-auto ${avgAtsScore >= 80 ? "text-emerald-700 border-emerald-300" : avgAtsScore >= 60 ? "text-amber-700 border-amber-300" : "text-red-700 border-red-300"}`}
          >
            {avgAtsScore >= 80 ? "Strong" : avgAtsScore >= 60 ? "Good" : "Needs work"}
          </Badge>
        </Card>
      )}

      {/* Pipeline breakdown */}
      <div>
        <h3 className="text-sm font-medium mb-3">Pipeline breakdown</h3>
        <div className="space-y-1.5">
          {pipelineStages.map(({ key, label, color }) => {
            const count = statusCounts[key];
            const pct = totalTracked > 0 ? Math.round((count / totalTracked) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <Badge variant="outline" className={`text-[10px] font-normal w-full justify-center ${color}`}>
                    {label}
                  </Badge>
                </div>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  {count > 0 && (
                    <div
                      className="h-2 rounded-full bg-primary/60 transition-all"
                      style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                    />
                  )}
                </div>
                <div className="w-8 text-right text-sm tabular-nums font-medium">{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {totalTracked === 0 && (
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            Add jobs to the board to start tracking your pipeline here.
          </p>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <Card className="p-5">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
      {sublabel && <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>}
    </Card>
  );
}

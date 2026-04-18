import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ScannedJob {
  id: string;
  title: string;
  location: string | null;
  department: string | null;
  remote_policy: string | null;
  compensation_text: string | null;
  apply_url: string;
  posted_at: string | null;
  last_seen_at: string;
  company: { id: string; name: string; slug: string; category: string | null };
}

interface Evaluation {
  id: string;
  scanned_job_id: string;
  score: number;
  tier: "A" | "B" | "C" | "D" | "F";
  archetype: string | null;
  summary: string | null;
  keyword_matches: string[] | null;
  gaps: string[] | null;
  report_md: string | null;
  evaluated_at: string;
}

interface UserPrefs {
  target_roles: string[];
  negative_keywords: string[];
  auto_apply_min_score: number;
  daily_apply_cap: number;
  auto_apply_enabled: boolean;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } }),
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(1, Math.round((now - then) / 60000));
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function tierColor(tier?: string) {
  if (tier === "A") return "text-foreground bg-foreground/10";
  if (tier === "B") return "text-foreground bg-foreground/5";
  if (tier === "C") return "text-muted-foreground bg-muted/40";
  return "text-muted-foreground bg-muted/40";
}

export default function MatchesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ScannedJob[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [filter, setFilter] = useState<"all" | "scored" | "unscored" | "top">("all");
  const [evaluating, setEvaluating] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [jobsRes, evalRes, prefRes] = await Promise.all([
        supabase
          .from("scanned_jobs")
          .select("id,title,location,department,remote_policy,compensation_text,apply_url,posted_at,last_seen_at,company:scan_companies(id,name,slug,category)")
          .eq("is_live", true)
          .order("last_seen_at", { ascending: false })
          .limit(200),
        supabase
          .from("job_evaluations")
          .select("id,scanned_job_id,score,tier,archetype,summary,keyword_matches,gaps,report_md,evaluated_at")
          .eq("user_id", user.id)
          .order("score", { ascending: false }),
        supabase
          .from("user_job_prefs")
          .select("target_roles,negative_keywords,auto_apply_min_score,daily_apply_cap,auto_apply_enabled")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      setJobs((jobsRes.data || []) as unknown as ScannedJob[]);
      const map: Record<string, Evaluation> = {};
      for (const e of (evalRes.data || []) as Evaluation[]) map[e.scanned_job_id] = e;
      setEvaluations(map);
      setPrefs((prefRes.data as UserPrefs | null) ?? {
        target_roles: [],
        negative_keywords: [],
        auto_apply_min_score: 4.5,
        daily_apply_cap: 5,
        auto_apply_enabled: false,
      });
      setLoading(false);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const pos = (prefs?.target_roles ?? []).map((s) => s.toLowerCase()).filter(Boolean);
    const neg = (prefs?.negative_keywords ?? []).map((s) => s.toLowerCase()).filter(Boolean);
    const matchPrefs = (j: ScannedJob) => {
      const t = j.title.toLowerCase();
      if (neg.some((n) => t.includes(n))) return false;
      if (pos.length === 0) return true;
      return pos.some((p) => t.includes(p));
    };
    const withEval = jobs.map((j) => ({ job: j, evaluation: evaluations[j.id] }));
    let rows = withEval.filter((r) => matchPrefs(r.job));
    if (filter === "scored") rows = rows.filter((r) => r.evaluation);
    if (filter === "unscored") rows = rows.filter((r) => !r.evaluation);
    if (filter === "top") rows = rows.filter((r) => r.evaluation && r.evaluation.score >= 4.0);
    rows.sort((a, b) => (b.evaluation?.score ?? -1) - (a.evaluation?.score ?? -1));
    return rows;
  }, [jobs, evaluations, filter, prefs]);

  const stats = useMemo(() => {
    const scored = Object.values(evaluations);
    const readyToApply = scored.filter((e) => e.score >= (prefs?.auto_apply_min_score ?? 4.5));
    return {
      total: jobs.length,
      scored: scored.length,
      top: readyToApply.length,
    };
  }, [jobs, evaluations, prefs]);

  const runEvaluation = async (scannedJobId: string) => {
    setEvaluating(scannedJobId);
    try {
      const { data, error } = await supabase.functions.invoke("career-ops-evaluate", {
        body: { scanned_job_id: scannedJobId },
      });
      if (error) throw error;
      const ev = (data as { evaluation: Evaluation }).evaluation;
      setEvaluations((prev) => ({ ...prev, [scannedJobId]: ev }));
      toast.success(`Scored ${ev.score.toFixed(2)} (${ev.tier})`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("412")
        ? "Add a resume first so we can score against it."
        : msg.includes("429")
        ? "Daily evaluation cap hit — upgrade for more."
        : `Evaluation failed: ${msg}`);
    } finally {
      setEvaluating(null);
    }
  };

  if (loading) {
    return (
      <div className="px-6 lg:px-12 py-12 max-w-[1280px] mx-auto">
        <div className="h-10 w-40 rounded-full bg-foreground/5 animate-pulse mb-8" />
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-foreground/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-12 py-10 lg:py-12 max-w-[1280px] mx-auto space-y-10">
      <motion.header initial="hidden" animate="visible" variants={fadeUp} custom={0} className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Matches</p>
        <h1 className="font-display text-[54px] sm:text-[68px] lg:text-[84px] leading-[0.98] -tracking-[0.02em] text-foreground font-semibold">
          The shortlist, <em className="italic font-medium text-foreground/90">scored.</em>
        </h1>
        <p className="max-w-[60ch] text-[15px] text-muted-foreground leading-relaxed">
          Every hour we pull fresh postings from Greenhouse, Ashby, and Lever across our tracked companies. Evaluate any role against your resume to see how you stack up.
        </p>
      </motion.header>

      {/* Stat strip */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="glass-card p-6 sm:p-8 flex flex-wrap gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Open roles</p>
          <div className="font-display text-[48px] leading-none font-medium tabular-nums -tracking-[0.03em] text-foreground mt-2">{stats.total}</div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Scored</p>
          <div className="font-display text-[48px] leading-none font-medium tabular-nums -tracking-[0.03em] text-foreground mt-2">{stats.scored}</div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Ready to apply</p>
          <div className="font-display text-[48px] leading-none font-medium tabular-nums -tracking-[0.03em] text-foreground mt-2">{stats.top}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(["all", "top", "scored", "unscored"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "h-9 px-4 rounded-full text-[12px] transition-colors",
                filter === k
                  ? "bg-foreground text-background"
                  : "text-muted-foreground border border-foreground/10 hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {k === "all" ? "All" : k === "top" ? "Top" : k === "scored" ? "Scored" : "Unscored"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="font-display italic text-[20px] text-foreground">No roles match right now.</p>
          <p className="text-[13px] text-muted-foreground mt-2">
            Adjust your target roles in preferences or wait for the next hourly scan.
          </p>
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="glass-card overflow-hidden">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-foreground/10">
                <th className="text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-6 py-4 w-16">Score</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-3 py-4">Role</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-3 py-4">Location</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-3 py-4 hidden lg:table-cell">Seen</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ job, evaluation }) => (
                <tr key={job.id} className="border-b border-foreground/8 last:border-0 hover:bg-foreground/[0.025] transition-colors">
                  <td className="px-6 py-4">
                    {evaluation ? (
                      <span className={cn("inline-flex items-center justify-center w-10 h-10 rounded-full font-display text-[15px] font-medium tabular-nums", tierColor(evaluation.tier))}>
                        {evaluation.score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-dashed border-foreground/20 text-muted-foreground text-[11px] font-mono">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-display text-[17px] text-foreground leading-tight">{job.title}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                      {job.company.name}
                      {job.department ? <span className="opacity-50"> · {job.department}</span> : null}
                    </div>
                    {evaluation?.summary ? (
                      <div className="text-[13px] text-muted-foreground mt-2 italic max-w-[60ch] truncate">{evaluation.summary}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 text-muted-foreground">
                    {job.location || "—"}
                    {job.remote_policy ? <div className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">{job.remote_policy}</div> : null}
                  </td>
                  <td className="px-3 py-4 font-mono text-[11px] text-muted-foreground hidden lg:table-cell">{relativeTime(job.last_seen_at)}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {evaluation ? (
                      <>
                        <a
                          href={job.apply_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex h-9 px-4 items-center rounded-full text-[12px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                        >
                          Apply →
                        </a>
                        <button
                          onClick={() => runEvaluation(job.id)}
                          disabled={evaluating === job.id}
                          className="ml-2 inline-flex h-9 px-3 items-center rounded-full text-[11px] text-muted-foreground border border-foreground/10 hover:bg-foreground/5 hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {evaluating === job.id ? "Rescoring…" : "Rescore"}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => runEvaluation(job.id)}
                        disabled={evaluating === job.id}
                        className="inline-flex h-9 px-4 items-center rounded-full text-[12px] font-medium border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                      >
                        {evaluating === job.id ? "Scoring…" : "Score"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <p className="font-mono uppercase tracking-[0.18em]">
          Rescans hourly · {Object.keys(evaluations).length}/{prefs?.daily_apply_cap ?? 20} evaluated today
        </p>
        <button
          onClick={() => navigate("/profile")}
          className="underline-offset-2 hover:underline hover:text-foreground transition-colors"
        >
          Tune target roles →
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/PageHeader";
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
  fit_score: number | null;
  fit_confidence: number | null;
  eligible: boolean;
  hard_filters: string[] | null;
  dimension_scores: unknown;
  score_version: string;
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
  auto_apply_min_fit_score: number;
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

function careerFitScore(evaluation: Evaluation): number {
  return evaluation.fit_score ?? Math.round(evaluation.score * 20);
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
  const [preparing, setPreparing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { id: string; status: string }>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [jobsRes, evalRes, prefRes, draftsRes] = await Promise.all([
        supabase
          .from("scanned_jobs")
          .select("id,title,location,department,remote_policy,compensation_text,apply_url,posted_at,last_seen_at,company:scan_companies(id,name,slug,category)")
          .eq("is_live", true)
          .order("last_seen_at", { ascending: false })
          .limit(200),
        supabase
          .from("job_evaluations")
          .select("id,scanned_job_id,score,fit_score,fit_confidence,eligible,hard_filters,dimension_scores,score_version,tier,archetype,summary,keyword_matches,gaps,report_md,evaluated_at")
          .eq("user_id", user.id)
          .order("score", { ascending: false }),
        supabase
          .from("user_job_prefs")
          .select("target_roles,negative_keywords,auto_apply_min_score,auto_apply_min_fit_score,daily_apply_cap,auto_apply_enabled")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("draft_applications")
          .select("id,evaluation_id,status")
          .eq("user_id", user.id),
      ]);
      setJobs((jobsRes.data || []) as unknown as ScannedJob[]);
      const map: Record<string, Evaluation> = {};
      for (const e of (evalRes.data || []) as Evaluation[]) map[e.scanned_job_id] = e;
      setEvaluations(map);
      const draftMap: Record<string, { id: string; status: string }> = {};
      for (const d of (draftsRes.data || []) as Array<{ id: string; evaluation_id: string; status: string }>) {
        draftMap[d.evaluation_id] = { id: d.id, status: d.status };
      }
      setDrafts(draftMap);
      setPrefs((prefRes.data as UserPrefs | null) ?? {
        target_roles: [],
        negative_keywords: [],
        auto_apply_min_score: 4.5,
        auto_apply_min_fit_score: 82,
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
    if (filter === "top") rows = rows.filter((r) => r.evaluation?.eligible && careerFitScore(r.evaluation) >= (prefs?.auto_apply_min_fit_score ?? 82));
    rows.sort((a, b) => (b.evaluation ? careerFitScore(b.evaluation) : -1) - (a.evaluation ? careerFitScore(a.evaluation) : -1));
    return rows;
  }, [jobs, evaluations, filter, prefs]);

  const stats = useMemo(() => {
    const scored = Object.values(evaluations);
    const readyToApply = scored.filter((e) => e.eligible && careerFitScore(e) >= (prefs?.auto_apply_min_fit_score ?? 82));
    return {
      total: jobs.length,
      scored: scored.length,
      top: readyToApply.length,
    };
  }, [jobs, evaluations, prefs]);

  const prepareApplication = async (evaluationId: string) => {
    setPreparing(evaluationId);
    try {
      const { data, error } = await supabase.functions.invoke("career-ops-tailor", {
        body: { evaluation_id: evaluationId },
      });
      if (error) throw error;
      const draft = (data as { draft: { id: string; status: string } }).draft;
      setDrafts((prev) => ({ ...prev, [evaluationId]: { id: draft.id, status: draft.status } }));
      toast.success("Application prepared — review before submitting");
      navigate(`/applications/${draft.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(
        msg.includes("412") ? "Add a resume first." :
        msg.includes("429") ? "Daily tailor cap hit — upgrade for more." :
        msg.includes("402") ? "Account not active." :
        `Prepare failed: ${msg}`
      );
    } finally {
      setPreparing(null);
    }
  };

  const runEvaluation = async (scannedJobId: string) => {
    setEvaluating(scannedJobId);
    try {
      const { data, error } = await supabase.functions.invoke("career-ops-evaluate", {
        body: { scanned_job_id: scannedJobId },
      });
      if (error) throw error;
      const ev = (data as { evaluation: Evaluation }).evaluation;
      setEvaluations((prev) => ({ ...prev, [scannedJobId]: ev }));
      toast.success(`${ev.eligible ? "Eligible" : "Blocked"} · ${careerFitScore(ev)}% fit (${ev.tier})`);
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
    <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-16 space-y-10">
      <PageHeader
        title="The shortlist, scored."
        status="matches · hourly scan"
        description="Every hour we pull fresh postings from Greenhouse, Ashby, and Lever across tracked companies. Evaluate any role against your résumé to see how you stack up."
      />

      {/* Stat strip */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="glass-card p-5 sm:p-6 flex flex-wrap gap-8">
        <div>
          <p className="text-[11.5px] font-medium text-muted-foreground">Open roles</p>
          <div className="text-[26px] font-bold tabular-nums text-foreground mt-1 tracking-tight">{stats.total}</div>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-muted-foreground">Scored</p>
          <div className="text-[26px] font-bold tabular-nums text-foreground mt-1 tracking-tight">{stats.scored}</div>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-muted-foreground">Ready to apply</p>
          <div className="text-[26px] font-bold tabular-nums text-foreground mt-1 tracking-tight">{stats.top}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(["all", "top", "scored", "unscored"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "h-8 px-3 rounded-md text-[12px] font-medium transition-colors",
                filter === k
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
          <p className="text-[16px] font-semibold text-foreground">No roles match right now.</p>
          <p className="text-[13px] text-muted-foreground mt-2">
            Adjust your target roles in preferences or wait for the next hourly scan.
          </p>
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="glass-card overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-5 py-3 w-20">Fit</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-3 py-3">Role</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-3 py-3">Location</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-3 py-3 hidden lg:table-cell">Seen</th>
                <th className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ job, evaluation }) => (
                <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-4">
                    {evaluation ? (
                      <span className={cn("inline-flex items-center justify-center w-10 h-10 rounded-full text-[13px] font-bold tabular-nums", tierColor(evaluation.tier))}>
                        {careerFitScore(evaluation)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-dashed border-border text-muted-foreground text-[11px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-[14px] font-semibold text-foreground leading-tight">{job.title}</div>
                    <div className="text-[11.5px] text-muted-foreground mt-1">
                      {job.company.name}
                      {job.department ? <span className="opacity-60"> · {job.department}</span> : null}
                    </div>
                    {evaluation?.summary ? (
                      <div className="text-[12.5px] text-muted-foreground mt-1.5 max-w-[60ch] truncate">{evaluation.summary}</div>
                    ) : null}
                    {evaluation && !evaluation.eligible ? (
                      <div className="text-[11.5px] text-rose-700 mt-1.5 max-w-[60ch] truncate">
                        Blocked · {evaluation.hard_filters?.[0] ?? "Does not meet your hard preferences"}
                      </div>
                    ) : evaluation?.fit_confidence != null ? (
                      <div className="text-[11px] text-muted-foreground/80 mt-1">
                        {Math.round(evaluation.fit_confidence * 100)}% scoring confidence · {evaluation.score_version}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 text-[13px] text-muted-foreground">
                    {job.location || "—"}
                    {job.remote_policy ? <div className="text-[11px] text-muted-foreground/80 mt-0.5">{job.remote_policy}</div> : null}
                  </td>
                  <td className="px-3 py-4 text-[12px] text-muted-foreground hidden lg:table-cell">{relativeTime(job.last_seen_at)}</td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    {evaluation ? (
                      <>
                        {drafts[evaluation.id] ? (
                          <button
                            onClick={() => navigate(`/applications/${drafts[evaluation.id].id}`)}
                            className="inline-flex h-8 px-3.5 items-center rounded-md text-[12px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            onClick={() => prepareApplication(evaluation.id)}
                            disabled={preparing === evaluation.id || !evaluation.eligible}
                            title={!evaluation.eligible ? evaluation.hard_filters?.join(" ") : undefined}
                            className="inline-flex h-8 px-3.5 items-center rounded-md text-[12px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                          >
                            {preparing === evaluation.id ? "Preparing…" : evaluation.eligible ? "Prepare" : "Blocked"}
                          </button>
                        )}
                        <button
                          onClick={() => runEvaluation(job.id)}
                          disabled={evaluating === job.id}
                          className="ml-1.5 inline-flex h-8 px-3 items-center rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {evaluating === job.id ? "…" : "Rescore"}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => runEvaluation(job.id)}
                        disabled={evaluating === job.id}
                        className="inline-flex h-8 px-3.5 items-center rounded-md text-[12px] font-medium border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
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

      <div className="flex items-center justify-between text-[12px] text-muted-foreground mt-6">
        <p>
          Rescans hourly · {Object.keys(evaluations).length}/{prefs?.daily_apply_cap ?? 20} evaluated today
        </p>
        <button
          onClick={() => navigate("/career-ops/preferences")}
          className="hover:text-foreground transition-colors"
        >
          Tune preferences →
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { captureIncident } from "@/lib/incidents";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";

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

function careerFitScore(evaluation: Evaluation): number {
  return evaluation.fit_score ?? Math.round(evaluation.score * 20);
}

function safeMatchSummary(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/blocked by a hard preference:?/gi, "Autopilot review needed:")
    .replace(/\bblocked\b/gi, "held for review");
}

export default function MatchesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ScannedJob[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [filter, setFilter] = useState<"recommended" | "strong" | "autopilot">("recommended");
  const [locationMode, setLocationMode] = useState<"all" | "remote" | "hybrid" | "onsite">("all");
  const [matchSearch, setMatchSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { id: string; status: string }>>({});

  const loadMatches = useCallback(async (announce = false) => {
    if (!user) return;
    if (announce) setRefreshing(true);
    else setLoading(true);
    try {
      const { error: reviewError } = await supabase.functions.invoke("career-profile-review", { body: {} });
      if (reviewError) {
        void captureIncident(reviewError, { source: "manual", operation: "career_profile_review" }, "warning");
      }
      const { error: bootstrapError } = await supabase.functions.invoke("career-ops-bootstrap", { body: {} });
      if (bootstrapError) throw bootstrapError;

      const [evalRes, prefRes, draftsRes] = await Promise.all([
        supabase
          .from("job_evaluations")
          .select("id,scanned_job_id,score,fit_score,fit_confidence,eligible,hard_filters,dimension_scores,score_version,tier,archetype,summary,keyword_matches,gaps,report_md,evaluated_at")
          .eq("user_id", user.id)
          .gte("fit_score", 50)
          .order("fit_score", { ascending: false })
          .limit(120),
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
      if (evalRes.error) throw evalRes.error;

      const personalized = (evalRes.data || []) as Evaluation[];
      const ids = personalized.map((evaluation) => evaluation.scanned_job_id);
      const jobsRes = ids.length > 0
        ? await supabase
          .from("scanned_jobs")
          .select("id,title,location,department,remote_policy,compensation_text,apply_url,posted_at,last_seen_at,company:scan_companies(id,name,slug,category)")
          .eq("is_live", true)
          .in("id", ids)
        : { data: [], error: null };
      if (jobsRes.error) throw jobsRes.error;

      const map: Record<string, Evaluation> = {};
      for (const evaluation of personalized) map[evaluation.scanned_job_id] = evaluation;
      const orderedJobs = ((jobsRes.data || []) as unknown as ScannedJob[])
        .sort((a, b) => careerFitScore(map[b.id]) - careerFitScore(map[a.id]));
      setJobs(orderedJobs);
      setEvaluations(map);

      const draftMap: Record<string, { id: string; status: string }> = {};
      for (const draft of (draftsRes.data || []) as Array<{ id: string; evaluation_id: string; status: string }>) {
        draftMap[draft.evaluation_id] = { id: draft.id, status: draft.status };
      }
      setDrafts(draftMap);
      setPrefs((prefRes.data as UserPrefs | null) ?? {
        target_roles: [],
        negative_keywords: [],
        auto_apply_min_score: 4.5,
        auto_apply_min_fit_score: 82,
        daily_apply_cap: 10,
        auto_apply_enabled: false,
      });
      if (announce) toast.success(`${orderedJobs.length} resume-aligned roles are ready to review.`);
    } catch (error) {
      void captureIncident(error, { source: "manual", operation: "personalized_matches_load" });
      const safeError = toUserFacingError(error, {
        operation: "personalized_matches_load",
        defaultMessage: "Your personalized match feed could not be refreshed. Try again in a moment.",
      });
      toast.error(withSupportReference(safeError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void loadMatches(false);
  }, [loadMatches]);

  const filtered = useMemo(() => {
    let rows = jobs
      .map((job) => ({ job, evaluation: evaluations[job.id] }))
      .filter((row): row is { job: ScannedJob; evaluation: Evaluation } => Boolean(row.evaluation) && careerFitScore(row.evaluation) >= 50);
    if (filter === "strong") rows = rows.filter((row) => careerFitScore(row.evaluation) >= 80);
    if (filter === "autopilot") rows = rows.filter((row) => row.evaluation.eligible && careerFitScore(row.evaluation) >= (prefs?.auto_apply_min_fit_score ?? 82));
    if (locationMode !== "all") {
      rows = rows.filter(({ job }) => {
        const location = `${job.location ?? ""} ${job.remote_policy ?? ""}`.toLowerCase();
        if (locationMode === "remote") return /\bremote\b/.test(location);
        if (locationMode === "hybrid") return /\bhybrid\b/.test(location);
        return /\bon[- ]?site\b|\bonsite\b/.test(location) || !/\bremote\b|\bhybrid\b/.test(location);
      });
    }
    const query = matchSearch.trim().toLowerCase();
    if (query) {
      rows = rows.filter(({ job }) => `${job.title} ${job.company.name} ${job.location ?? ""} ${job.department ?? ""}`.toLowerCase().includes(query));
    }
    rows.sort((a, b) => (b.evaluation ? careerFitScore(b.evaluation) : -1) - (a.evaluation ? careerFitScore(a.evaluation) : -1));
    return rows;
  }, [jobs, evaluations, filter, locationMode, matchSearch, prefs]);

  const stats = useMemo(() => {
    const scored = Object.values(evaluations);
    const readyToApply = scored.filter((evaluation) => evaluation.eligible && careerFitScore(evaluation) >= (prefs?.auto_apply_min_fit_score ?? 82));
    return {
      total: scored.filter((evaluation) => careerFitScore(evaluation) >= 50).length,
      scored: scored.filter((evaluation) => careerFitScore(evaluation) >= 70).length,
      top: readyToApply.length,
    };
  }, [evaluations, prefs]);

  const prepareApplication = async (evaluationId: string, scannedJobId: string) => {
    setPreparing(evaluationId);
    try {
      const { data, error } = await supabase.functions.invoke("career-ops-tailor", {
        body: { evaluation_id: evaluationId, allow_outside_preferences: true },
      });
      if (error) throw error;
      const draft = (data as { draft: { id: string; status: string; tailored_resume_id?: string | null } }).draft;
      setDrafts((prev) => ({ ...prev, [evaluationId]: { id: draft.id, status: draft.status } }));
      let atsScore: number | null = null;
      if (draft.tailored_resume_id) {
        const { data: atsData, error: atsError } = await supabase.functions.invoke("career-ops-ats", {
          body: { resume_id: draft.tailored_resume_id, scanned_job_id: scannedJobId },
        });
        if (atsError) throw atsError;
        atsScore = Number(atsData?.ats?.overall ?? 0);
      }
      toast.success(atsScore
        ? `Application prepared · ${Math.round(atsScore)} ATS — review before submitting`
        : "Application prepared — review before submitting");
      navigate(`/applications/${draft.id}`);
    } catch (e: unknown) {
      void captureIncident(e, { source: "manual", operation: "match_prepare" });
      const safeError = toUserFacingError(e, {
        operation: "match_prepare",
        defaultMessage: "This application could not be prepared. Try again in a moment.",
      });
      toast.error(withSupportReference(safeError));
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
      const score = careerFitScore(ev);
      toast.success(`${score >= 80 ? "Strong fit" : score >= 65 ? "Good fit" : "Potential fit"} · ${score}%`);
    } catch (e: unknown) {
      const safeError = toUserFacingError(e, {
        operation: "match_rescore",
        defaultMessage: "This role could not be rescored. Try again in a moment.",
      });
      toast.error(withSupportReference(safeError));
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
        title="Your job matches"
        status="resume evidence · 50%+ only"
        description="Only fresh roles that clear the match threshold appear here. Scores use every client and role, tools demonstrated in context, non-overlapping experience dates, seniority, location, and saved preferences."
      />

      <div className="-mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => void loadMatches(true)}
          disabled={refreshing}
          className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {refreshing ? "Reviewing resume + jobs…" : "Refresh career matches"}
        </button>
      </div>

      {/* Stat strip */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="glass-card p-5 sm:p-6 flex flex-wrap gap-8">
        <div>
          <p className="text-[11.5px] font-medium text-muted-foreground">Current matches</p>
          <div className="text-[26px] font-bold tabular-nums text-foreground mt-1 tracking-tight">{stats.total}</div>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-muted-foreground">Good fits · 70%+</p>
          <div className="text-[26px] font-bold tabular-nums text-foreground mt-1 tracking-tight">{stats.scored}</div>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-muted-foreground">Autopilot ready</p>
          <div className="text-[26px] font-bold tabular-nums text-foreground mt-1 tracking-tight">{stats.top}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(["recommended", "strong", "autopilot"] as const).map((k) => (
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
              {k === "recommended" ? "Recommended" : k === "strong" ? "Strong · 80%+" : "Autopilot ready"}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="-mt-6 flex flex-col gap-3 rounded-xl border border-border bg-background/50 p-4 lg:flex-row lg:items-center">
        <input
          value={matchSearch}
          onChange={(event) => setMatchSearch(event.target.value)}
          placeholder="Filter matches by role, company, or city"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[12.5px] outline-none focus:border-foreground/30"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "remote", "hybrid", "onsite"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLocationMode(mode)}
              className={cn(
                "h-9 rounded-md px-3 text-[12px] font-medium capitalize transition-colors",
                locationMode === mode ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "all" ? "All locations" : mode === "onsite" ? "On-site" : mode}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigate("/career-ops/preferences")}
          className="h-9 rounded-md border border-border px-3 text-[12px] font-medium text-foreground hover:bg-muted"
        >
          Customize match rules
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-[16px] font-semibold text-foreground">No match fits the current view.</p>
          <p className="text-[13px] text-muted-foreground mt-2">
            Clear the local filters, customize your genuine location and work-mode preferences, or use General Job Search for broader exploration.
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
                      <div className="w-24 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                          <span>{careerFitScore(evaluation)}%</span>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {careerFitScore(evaluation) >= 80 ? "Strong" : careerFitScore(evaluation) >= 65 ? "Good" : "Potential"}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${careerFitScore(evaluation)}%` }} />
                        </div>
                      </div>
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
                    {safeMatchSummary(evaluation?.summary ?? null) ? (
                      <div className="text-[12.5px] text-muted-foreground mt-1.5 max-w-[60ch] line-clamp-2">{safeMatchSummary(evaluation?.summary ?? null)}</div>
                    ) : null}
                    {evaluation && !evaluation.eligible ? (
                      <div className="text-[11.5px] text-muted-foreground mt-1.5 max-w-[60ch] truncate">
                        Outside a saved preference · {evaluation.hard_filters?.[0] ?? "Review your preferences before enabling Autopilot"}
                      </div>
                    ) : evaluation?.fit_confidence != null ? (
                      <div className="text-[11px] text-muted-foreground/80 mt-1">
                        {Math.round(evaluation.fit_confidence * 100)}% confidence in the available job and resume evidence
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
                            onClick={() => prepareApplication(evaluation.id, job.id)}
                            disabled={preparing === evaluation.id}
                            title={!evaluation.eligible ? "You can still prepare this application; Autopilot will not submit it automatically." : undefined}
                            className="inline-flex h-8 px-3.5 items-center rounded-md text-[12px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                          >
                            {preparing === evaluation.id ? "Preparing…" : "Prepare"}
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
          Direct-employer sources refresh hourly · manual applications are available for every match shown
        </p>
        <button
          onClick={() => navigate("/job-search")}
          className="hover:text-foreground transition-colors"
        >
          Open General Job Search →
        </button>
      </div>
    </div>
  );
}

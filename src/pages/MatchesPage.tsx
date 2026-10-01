import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/PageHeader";
import ApplyProgressModal from "@/components/agent/ApplyProgressModal";
import type { ApplyProgressJob } from "@/components/agent/apply-progress-core";
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

function fitChip(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: `Strong fit ${score}%`, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (score >= 65) return { label: `Good fit ${score}%`, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: `Possible fit ${score}%`, tone: "bg-foreground/5 text-muted-foreground" };
}

function safeMatchSummary(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/blocked by a hard preference:?/gi, "Needs your review:")
    .replace(/\bblocked\b/gi, "held for review");
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${operation} timed out`)), timeoutMs);
    }),
  ]);
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [applyJobs, setApplyJobs] = useState<ApplyProgressJob[]>([]);
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const [applyModalOpen, setApplyModalOpen] = useState(false);

  const loadMatches = useCallback(async (announce = false) => {
    if (!user) return;
    if (announce) setRefreshing(true);
    else setLoading(true);

    const refreshSources = async () => {
      try {
        const { error } = await withTimeout(
          supabase.functions.invoke("career-profile-review", { body: {} }),
          12_000,
          "career profile review",
        );
        if (error) throw error;
      } catch (error) {
        void captureIncident(error, { source: "manual", operation: "career_profile_review" }, "warning");
      }

      const { error } = await withTimeout(
        supabase.functions.invoke("career-ops-bootstrap", { body: {} }),
        12_000,
        "career match refresh",
      );
      if (error) throw error;
    };

    const readStoredMatches = async () => {
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
        daily_apply_cap: 60,
        auto_apply_enabled: false,
      });
      return orderedJobs.length;
    };

    try {
      if (announce) {
        try {
          await refreshSources();
        } catch (error) {
          void captureIncident(error, { source: "manual", operation: "career_match_refresh" }, "warning");
        }
        const count = await readStoredMatches();
        toast.success(`${count} jobs that fit your resume are ready to review.`);
      } else {
        await readStoredMatches();
        void refreshSources()
          .then(() => readStoredMatches())
          .catch((error) => {
            void captureIncident(error, { source: "manual", operation: "career_match_background_refresh" }, "warning");
          });
      }
    } catch (error) {
      void captureIncident(error, { source: "manual", operation: "personalized_matches_load" });
      const safeError = toUserFacingError(error, {
        operation: "personalized_matches_load",
        defaultMessage: "Your matches could not be refreshed. Try again in a moment.",
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

  // evaluation_id → scanned_job_id lookup for batch preparation.
  const jobIdByEvaluation = useMemo(() => {
    const map = new Map<string, string>();
    for (const job of jobs) {
      const evaluation = evaluations[job.id];
      if (evaluation) map.set(evaluation.id, job.id);
    }
    return map;
  }, [jobs, evaluations]);

  // Shared single-application preparation (tailor + ATS check). Returns the
  // new draft id and ATS score when available; throws on failure.
  const prepareOne = useCallback(async (evaluationId: string, scannedJobId: string): Promise<{ draftId: string; atsScore: number | null }> => {
    const { data, error } = await supabase.functions.invoke("career-ops-tailor", {
      body: { evaluation_id: evaluationId, allow_outside_preferences: true },
    });
    if (error) throw error;
    const draft = (data as { draft: { id: string; status: string; tailored_resume_id?: string | null } }).draft;
    setDrafts((prev) => ({ ...prev, [evaluationId]: { id: draft.id, status: draft.status } }));
    if (!draft.tailored_resume_id) return { draftId: draft.id, atsScore: null };
    const { data: atsData, error: atsError } = await supabase.functions.invoke("career-ops-ats", {
      body: { resume_id: draft.tailored_resume_id, scanned_job_id: scannedJobId },
    });
    if (atsError) throw atsError;
    return { draftId: draft.id, atsScore: Number(atsData?.ats?.overall ?? 0) };
  }, []);

  const prepareApplication = async (evaluationId: string, scannedJobId: string) => {
    setPreparing(evaluationId);
    try {
      const { draftId, atsScore } = await prepareOne(evaluationId, scannedJobId);
      toast.success(atsScore
        ? `Application ready · resume scores ${Math.round(atsScore)} — take a look before we submit`
        : "Application ready — take a look before we submit");
      navigate(`/applications/${draftId}`);
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

  const toggleSelected = (evaluationId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(evaluationId)) next.delete(evaluationId);
      else next.add(evaluationId);
      return next;
    });
  };

  const prepareSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBatchProgress({ current: 0, total: ids.length });
    // Live animation for small batches (the modal shows up to 5 parallel rows).
    if (ids.length <= 5) {
      setApplyErrors({});
      setApplyJobs(ids.map((evaluationId) => {
        const job = jobs.find((item) => item.id === jobIdByEvaluation.get(evaluationId));
        return {
          evaluationId,
          title: job?.title ?? "Job match",
          company: job?.company.name ?? "Unknown company",
        };
      }));
      setApplyModalOpen(true);
    }
    let prepared = 0;
    let failed = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const evaluationId = ids[index];
      setBatchProgress({ current: index + 1, total: ids.length });
      const scannedJobId = jobIdByEvaluation.get(evaluationId);
      if (!scannedJobId) {
        failed += 1;
        setApplyErrors((current) => ({ ...current, [evaluationId]: "This job is no longer available to prepare." }));
        continue;
      }
      try {
        await prepareOne(evaluationId, scannedJobId);
        prepared += 1;
      } catch (error) {
        failed += 1;
        setApplyErrors((current) => ({ ...current, [evaluationId]: "Tailoring failed — try again in a moment." }));
        void captureIncident(error, { source: "manual", operation: "match_batch_prepare" });
      }
    }
    setBatchProgress(null);
    setSelected(new Set());
    if (failed === 0) {
      toast.success(`${prepared} application${prepared === 1 ? "" : "s"} ready — review them in Applications`);
    } else {
      toast.success(`${prepared} application${prepared === 1 ? "" : "s"} ready · ${failed} need${failed === 1 ? "s" : ""} another try`);
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
      toast.success(`${score >= 80 ? "Strong fit" : score >= 65 ? "Good fit" : "Possible fit"} · ${score}%`);
    } catch (e: unknown) {
      const safeError = toUserFacingError(e, {
        operation: "match_rescore",
        defaultMessage: "This job could not be rescored. Try again in a moment.",
      });
      toast.error(withSupportReference(safeError));
    } finally {
      setEvaluating(null);
    }
  };

  const filtersActive = filter !== "recommended" || locationMode !== "all" || matchSearch.trim() !== "";

  if (loading) {
    return (
      <div className="px-6 lg:px-12 py-12 max-w-[1280px] mx-auto" role="status" aria-live="polite">
        <p className="mb-5 text-sm text-muted-foreground">Finding jobs that fit your resume…</p>
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
    <div className="min-h-full bg-rp-canvas text-rp-ink">
      <div className="max-w-[1280px] mx-auto px-8 lg:px-12 pt-12 pb-24">
        <PageHeader
          title="Jobs that fit you."
          status={`matches · ${stats.total} live`}
          description="Fresh jobs matched to your résumé. Press Prepare application and we'll tailor your résumé for that job. You review it before anything is sent."
        />

        {/* Ledger stat rail — three numerals, hairline dividers, refresh anchor */}
        <div className="grid grid-cols-1 md:grid-cols-4 border-y border-rp-rule -mt-2">
          <StatCell label="Matches found" value={stats.total} tone="ink" />
          <StatCell label="Good fits · 70%+" value={stats.scored} tone="accent" />
          <StatCell label="Ready to auto-apply" value={stats.top} tone="highlight" />
          <div className="flex items-center justify-end px-6 py-6">
            <button
              type="button"
              onClick={() => void loadMatches(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 border-b border-rp-rule-2 text-rp-ink-2 hover:text-rp-accent hover:border-rp-accent transition-colors pb-1 disabled:opacity-50 text-xs font-semibold"
            >
              {refreshing ? "Checking…" : "Check for new matches →"}
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="mt-10 flex flex-wrap items-center gap-4 pb-4 border-b border-rp-rule">
          <div className="flex items-center gap-1.5">
            {(["recommended", "strong", "autopilot"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn("font-semibold",
                  "h-8 px-3 text-xs transition-colors font-medium",
                  filter === k
                    ? "bg-rp-accent text-rp-canvas"
                    : "text-rp-ink-2 hover:text-rp-accent border border-rp-rule",
                )}
              >
                {k === "recommended" ? "Recommended" : k === "strong" ? "Strong · 80%+" : "Auto-apply ready"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "remote", "hybrid", "onsite"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setLocationMode(mode)}
                className={cn("font-medium",
                  "h-8 px-3 text-xs transition-colors font-medium",
                  locationMode === mode ? "text-rp-accent border-b border-rp-accent" : "text-rp-ink-3 hover:text-rp-ink",
                )}
              >
                {mode === "all" ? "All locations" : mode === "onsite" ? "On-site" : mode}
              </button>
            ))}
          </div>
          <input
            aria-label="Filter job matches"
            value={matchSearch}
            onChange={(event) => setMatchSearch(event.target.value)}
            placeholder="Filter by role, company, or city"
            className="ml-auto h-8 min-w-[220px] flex-1 max-w-xs bg-transparent border-0 border-b border-rp-rule-2 px-0 text-meta text-rp-ink placeholder:text-rp-ink-3/60 focus:outline-none focus:border-rp-accent"
          />
          <button
            type="button"
            onClick={() => navigate("/career-ops/preferences")}
            className="text-rp-ink-2 hover:text-rp-accent transition-colors text-xs font-semibold"
          >
            Match prefs →
          </button>
        </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          {jobs.length === 0 ? (
            <>
              <p className="text-base font-semibold text-foreground">We're still finding jobs that fit your resume.</p>
              <p className="text-meta text-muted-foreground mt-2">
                Fresh jobs are checked every hour — give it a moment, then refresh.
              </p>
              <button
                type="button"
                onClick={() => void loadMatches(true)}
                disabled={refreshing}
                className="mt-5 inline-flex h-9 items-center rounded-md bg-foreground px-4 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {refreshing ? "Checking…" : "Refresh now"}
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-foreground">Nothing fits these filters.</p>
              <p className="text-meta text-muted-foreground mt-2">
                Your matches are still here — clear the filters to see them all.
              </p>
              <button
                type="button"
                onClick={() => { setFilter("recommended"); setLocationMode("all"); setMatchSearch(""); }}
                className="mt-5 inline-flex h-9 items-center rounded-md bg-foreground px-4 text-xs font-medium text-background hover:bg-foreground/90"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="glass-card overflow-hidden">
          <table className="w-full text-meta">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-3 py-3" aria-label="Select" />
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-3 w-28">Fit</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-3">Role</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-3">Location</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-3 hidden lg:table-cell">Seen</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ job, evaluation }) => (
                <tr key={job.id} className={cn("border-b border-border last:border-0 hover:bg-muted/40 transition-colors", selected.has(evaluation.id) && "bg-muted/50")}>
                  <td className="px-3 py-4 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Select ${job.title} at ${job.company.name}`}
                      checked={selected.has(evaluation.id)}
                      onChange={() => toggleSelected(evaluation.id)}
                      disabled={Boolean(batchProgress)}
                      className="h-4 w-4 rounded border-border accent-foreground align-middle"
                    />
                  </td>
                  <td className="px-3 py-4">
                    {evaluation ? (
                      <div className="w-28 space-y-1.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", fitChip(careerFitScore(evaluation)).tone)}>
                          {fitChip(careerFitScore(evaluation)).label}
                        </span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${careerFitScore(evaluation)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-dashed border-border text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-sm font-semibold text-foreground leading-tight">{job.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {job.company.name}
                      {job.department ? <span className="opacity-60"> · {job.department}</span> : null}
                    </div>
                    {safeMatchSummary(evaluation?.summary ?? null) ? (
                      <div className="text-xs text-muted-foreground mt-1.5 max-w-[60ch] line-clamp-2">{safeMatchSummary(evaluation?.summary ?? null)}</div>
                    ) : null}
                    {evaluation && !evaluation.eligible ? (
                      <div className="text-xs text-muted-foreground mt-1.5 max-w-[60ch] truncate">
                        Outside your saved preferences · {evaluation.hard_filters?.[0] ?? "review your preferences if you want us to auto-apply to jobs like this"}
                      </div>
                    ) : evaluation?.fit_confidence != null ? (
                      <div className="text-xs text-muted-foreground/80 mt-1">
                        {Math.round(evaluation.fit_confidence * 100)}% confidence in this match
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 text-meta text-muted-foreground">
                    {job.location || "—"}
                    {job.remote_policy ? <div className="text-xs text-muted-foreground/80 mt-0.5">{job.remote_policy}</div> : null}
                  </td>
                  <td className="px-3 py-4 text-xs text-muted-foreground hidden lg:table-cell">{relativeTime(job.last_seen_at)}</td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    {evaluation ? (
                      <>
                        {drafts[evaluation.id] ? (
                          <button
                            onClick={() => navigate(`/applications/${drafts[evaluation.id].id}`)}
                            className="inline-flex h-8 px-3.5 items-center rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                          >
                            Review application
                          </button>
                        ) : (
                          <button
                            onClick={() => prepareApplication(evaluation.id, job.id)}
                            disabled={preparing === evaluation.id || Boolean(batchProgress)}
                            title={!evaluation.eligible ? "You can still prepare this application; we just won't auto-submit it." : undefined}
                            className="inline-flex h-8 px-3.5 items-center rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                          >
                            {preparing === evaluation.id ? "Preparing…" : "Prepare application"}
                          </button>
                        )}
                        <button
                          onClick={() => runEvaluation(job.id)}
                          disabled={evaluating === job.id}
                          className="ml-1.5 inline-flex h-8 px-3 items-center rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {evaluating === job.id ? "…" : "Rescore"}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => runEvaluation(job.id)}
                        disabled={evaluating === job.id}
                        className="inline-flex h-8 px-3.5 items-center rounded-md text-xs font-medium border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
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

      <div className="flex items-center justify-between text-xs text-muted-foreground mt-6">
        <p>
          Jobs come straight from employer sites and refresh hourly · every match can be prepared manually
        </p>
        <button
          onClick={() => navigate("/job-search")}
          className="hover:text-foreground transition-colors"
        >
          Open General Job Search →
        </button>
      </div>

      {/* Batch bar — appears only when something is selected */}
      {selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background px-5 py-3 shadow-lg">
            <span className="text-meta font-medium text-foreground">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() => void prepareSelected()}
              disabled={Boolean(batchProgress)}
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {batchProgress ? `Preparing ${batchProgress.current}/${batchProgress.total}…` : `Prepare ${selected.size} application${selected.size === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={Boolean(batchProgress)}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <ApplyProgressModal
        open={applyModalOpen}
        jobs={applyJobs}
        errors={applyErrors}
        onClose={() => setApplyModalOpen(false)}
        onOpenApplication={(draftId) => {
          setApplyModalOpen(false);
          navigate(`/applications/${draftId}`);
        }}
      />
      </div>
    </div>
  );
}

function StatCell({ label, value, tone }: { label: string; value: number; tone: "ink" | "accent" | "highlight" }) {
  const color = tone === "accent" ? "text-rp-accent" : tone === "highlight" ? "text-rp-accent-2" : "text-rp-ink";
  return (
    <div className="px-6 py-6 border-r border-rp-rule last:border-r-0">
      <p className="text-rp-ink-3 text-xs font-medium">{label}</p>
      <div className={`${color} tabular-nums mt-2 text-5xl font-normal leading-tight`}>
        {String(value).padStart(2, "0")}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileText,
  History,
  Lock,
  Mail,
  Play,
  Radar,
  RefreshCcw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import ApplyProgressModal from "@/components/agent/ApplyProgressModal";
import type { ApplyProgressJob } from "@/components/agent/apply-progress-core";
import { useSubscription } from "@/components/SubscriptionGate";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  firstAutomationTaskOutcome,
  isAgentRunLive,
  resolveAutomationDraftState,
} from "@/lib/application-funnel";
import { captureIncident } from "@/lib/incidents";
import { hydrateApplicationProfileFromResume } from "@/lib/resume-profile-autofill";
import {
  careerFitFromEvaluation,
  JOB_REQUIREMENT_SCORE_MODEL_PATTERN,
  normalizeScore,
} from "@/lib/score-truth";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";
import { selectAppliableNow, selectTopNow } from "@/lib/top-now";
import { toast } from "sonner";
import { isResumeAllowedForAutomation } from "../../supabase/functions/_shared/resume-review";

type ReviewMode = "always" | "low_confidence" | "eligible_only";

interface AgentControls {
  agent_enabled: boolean;
  auto_apply_enabled: boolean;
  review_mode: ReviewMode;
  auto_apply_min_fit_score: number;
  auto_apply_min_ats_score: number;
  tailoring_mode: "evidence_only" | "coverage_boost";
  daily_apply_cap: number;
  agent_max_actions_per_day: number;
  agent_actions_today: number;
  last_agent_run_at: string | null;
}

interface MatchRow {
  id: string;
  fit_score: number | null;
  score: number;
  tier: string;
  eligible: boolean;
  summary: string | null;
  evaluated_at: string;
  scanned_job: {
    id: string;
    title: string;
    location: string | null;
    remote_policy: string | null;
    apply_url: string;
    company: { name: string } | null;
  } | null;
}

interface AtsScore {
  id: string;
  overall: number;
  model: string;
  dim_format: number;
  dim_keywords: number;
  dim_experience: number;
  dim_skills: number;
  dim_education: number;
  dim_impact: number;
  matched_keywords: string[];
  missing_keywords: string[];
  created_at: string;
}

interface ResumeSummary {
  id: string;
  title: string;
  updated_at: string;
  personal_info: unknown;
  experience: unknown;
  parse_quality: unknown;
  source_hash: string | null;
  source_document_id: string | null;
  parser_version: string | null;
  parsed_at: string | null;
}

interface AgentRun {
  id: string;
  status: string;
  summary: string | null;
  started_at: string;
  completed_at: string | null;
}

interface DraftStatusRow {
  id: string;
  evaluation_id: string | null;
  status: string;
  error_message: string | null;
  updated_at: string;
  submitted_at: string | null;
  applypass_task_id: string | null;
  evaluation: {
    scanned_job: {
      title: string;
      company: { name: string } | null;
    } | null;
  } | null;
}

interface SubmitTaskRow {
  id: string;
  status: string;
  error_message: string | null;
  result: unknown;
  run_log: unknown;
  updated_at: string;
}

interface SubmissionReceiptRow {
  id: string;
  draft_application_id: string | null;
  submitted_at: string;
}

interface WorkerHeartbeat {
  last_seen: string;
  hostname: string | null;
  version: string | null;
}

interface GmailConnection {
  gmail_email: string;
  enabled: boolean;
  last_polled_at: string | null;
}

interface LooseQueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface LooseQuery {
  select(columns: string): LooseQuery;
  eq(column: string, value: string): LooseQuery;
  like(column: string, pattern: string): LooseQuery;
  order(column: string, options: { ascending: boolean }): LooseQuery;
  limit(count: number): LooseQuery;
  maybeSingle(): Promise<LooseQueryResult>;
}

// `ats_scores` is deployed by a newer migration than the generated database
// types. Keep this single compatibility shim until the next type generation.
const migratedTables = supabase as unknown as { from(table: string): LooseQuery };

const DEFAULT_CONTROLS: AgentControls = {
  agent_enabled: false,
  auto_apply_enabled: false,
  review_mode: "always",
  auto_apply_min_fit_score: 82,
  auto_apply_min_ats_score: 85,
  tailoring_mode: "evidence_only",
  daily_apply_cap: 60,
  agent_max_actions_per_day: 240,
  agent_actions_today: 0,
  last_agent_run_at: null,
};

const ATS_DIMENSIONS: Array<{ key: keyof AtsScore; label: string }> = [
  { key: "dim_format", label: "Format" },
  { key: "dim_experience", label: "Experience" },
  { key: "dim_skills", label: "Skills" },
  { key: "dim_education", label: "Education" },
  { key: "dim_impact", label: "Impact" },
];

function fitScore(match: MatchRow): number {
  return careerFitFromEvaluation(match.fit_score, match.score) ?? 0;
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-rp-ink-2";
}

/** Fit % chip for the Top 5 strip — our own badge style, tone follows the score. */
function fitChipClasses(score: number): string {
  if (score >= 85) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-rp-rule bg-rp-paper-2 text-rp-ink-2";
}

/** One short, plain-English reason a user can act on. */
function shortReason(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  const first = message.split(/[.\n]/)[0]?.trim() ?? "";
  if (!first) return fallback;
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

export default function AgentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan, hasAutoApply } = useSubscription();
  const [controls, setControls] = useState<AgentControls>(DEFAULT_CONTROLS);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [latestAts, setLatestAts] = useState<AtsScore | null>(null);
  const [resume, setResume] = useState<ResumeSummary | null>(null);
  const [drafts, setDrafts] = useState<DraftStatusRow[]>([]);
  const [submitTasks, setSubmitTasks] = useState<SubmitTaskRow[]>([]);
  const [submissionReceipts, setSubmissionReceipts] = useState<SubmissionReceiptRow[]>([]);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [gmailConnection, setGmailConnection] = useState<GmailConnection | null>(null);
  const [workerHeartbeat, setWorkerHeartbeat] = useState<WorkerHeartbeat | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [batchPreparing, setBatchPreparing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [preparingIds, setPreparingIds] = useState<string[]>([]);
  const [matchSetup, setMatchSetup] = useState<"idle" | "building" | "complete" | "error">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [applyJobs, setApplyJobs] = useState<ApplyProgressJob[]>([]);
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const automaticMatchAttempt = useRef(false);
  const automaticProfilePromise = useRef<Promise<unknown> | null>(null);
  const workspaceRequestId = useRef(0);

  const loadWorkspace = useCallback(async (showSpinner = false) => {
    if (!user) return;
    const requestId = ++workspaceRequestId.current;
    if (showSpinner) setRefreshing(true);

    const [prefsRes, matchRes, atsRes, resumeRes, draftsRes, runsRes, gmailRes, workerRes] = await Promise.all([
      supabase
        .from("user_job_prefs")
        .select("agent_enabled,auto_apply_enabled,review_mode,auto_apply_min_fit_score,auto_apply_min_ats_score,tailoring_mode,daily_apply_cap,agent_max_actions_per_day,agent_actions_today,last_agent_run_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("job_evaluations")
        .select("id,fit_score,score,tier,eligible,summary,evaluated_at,scanned_job:scanned_jobs(id,title,location,remote_policy,apply_url,company:scan_companies(name))")
        .eq("user_id", user.id)
        .is("dismissed_at", null)
        .eq("eligible", true)
        .gte("fit_score", 50)
        .order("fit_score", { ascending: false })
        .limit(12),
      migratedTables
        .from("ats_scores")
        .select("id,overall,model,dim_format,dim_keywords,dim_experience,dim_skills,dim_education,dim_impact,matched_keywords,missing_keywords,created_at")
        .eq("user_id", user.id)
        .like("model", JOB_REQUIREMENT_SCORE_MODEL_PATTERN)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      migratedTables
        .from("resumes")
        .select("id,title,updated_at,personal_info,experience,parse_quality,source_hash,source_document_id,parser_version,parsed_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("draft_applications")
        .select("id,evaluation_id,status,error_message,updated_at,submitted_at,applypass_task_id,evaluation:job_evaluations(scanned_job:scanned_jobs(title,company:scan_companies(name)))")
        .eq("user_id", user.id),
      supabase
        .from("agent_runs")
        .select("id,status,summary,started_at,completed_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("mc_gmail_connections")
        .select("gmail_email,enabled,last_polled_at")
        .eq("user_id", user.id)
        .eq("enabled", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("mc_worker_heartbeats")
        .select("last_seen,hostname,version")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (requestId !== workspaceRequestId.current) return;

    const loadError = [prefsRes, matchRes, atsRes, resumeRes, draftsRes, runsRes, gmailRes, workerRes]
      .map((result) => result.error)
      .find(Boolean);
    if (loadError) {
      void captureIncident(new Error(loadError.message), { source: "manual", operation: "agent_workspace_load" });
      if (showSpinner) toast.error("Some Agent data could not be refreshed.");
    }
    if (draftsRes.error) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const draftRows = (draftsRes.data || []) as unknown as DraftStatusRow[];
    const taskIds = [...new Set(
      draftRows
        .map((draft) => draft.applypass_task_id)
        .filter((id): id is string => Boolean(id)),
    )];
    const draftIds = draftRows.map((draft) => draft.id);
    const [tasksRes, receiptsRes] = await Promise.all([
      taskIds.length > 0
        ? supabase
          .from("applypass_tasks")
          .select("id,status,error_message,result,run_log,updated_at")
          .in("id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      draftIds.length > 0
        ? supabase
          .from("application_submission_receipts")
          .select("id,draft_application_id,submitted_at")
          .in("draft_application_id", draftIds)
          .order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (requestId !== workspaceRequestId.current) return;
    const evidenceError = tasksRes.error ?? receiptsRes.error;
    if (evidenceError) {
      void captureIncident(new Error(evidenceError.message), { source: "manual", operation: "agent_workspace_evidence_load" });
      if (showSpinner) toast.error("Live application status could not be refreshed.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (prefsRes.data && !('error' in prefsRes.data)) {
      const row = prefsRes.data as unknown as Partial<AgentControls>;
      setControls({
        ...DEFAULT_CONTROLS,
        ...row,
        review_mode: ["always", "low_confidence", "eligible_only"].includes(String(row.review_mode))
          ? row.review_mode as ReviewMode
          : "always",
      });
    }
    setMatches((matchRes.data || []) as unknown as MatchRow[]);
    setLatestAts((atsRes.data as unknown as AtsScore | null) ?? null);
    setResume((resumeRes.data as ResumeSummary | null) ?? null);
    setDrafts(draftRows);
    setSubmitTasks((tasksRes.data || []) as SubmitTaskRow[]);
    setSubmissionReceipts((receiptsRes.data || []) as SubmissionReceiptRow[]);
    setLastRun((runsRes.data as AgentRun | null) ?? null);
    setGmailConnection((gmailRes.data as GmailConnection | null) ?? null);
    setWorkerHeartbeat((workerRes.data as WorkerHeartbeat | null) ?? null);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadWorkspace();

    const channel = supabase
      .channel(`career-agent-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_evaluations", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "ats_scores", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_applications", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "applypass_tasks", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "application_submission_receipts", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .subscribe();

    // Realtime may be unavailable in a preview project; this bounded fallback
    // keeps an open workspace current without a background browser process.
    const poll = window.setInterval(() => void loadWorkspace(), 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadWorkspace();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      workspaceRequestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [loadWorkspace, user]);

  useEffect(() => {
    if (!user || loading || !resume || automaticProfilePromise.current) return;
    if (!isResumeAllowedForAutomation(resume)) return;

    automaticProfilePromise.current = hydrateApplicationProfileFromResume({
      userId: user.id,
      resumeId: resume.id,
      resume: {
        title: resume.title,
        personal_info: resume.personal_info,
        experience: resume.experience,
        parse_quality: resume.parse_quality,
        source_hash: resume.source_hash,
        source_document_id: resume.source_document_id,
        parser_version: resume.parser_version,
        parsed_at: resume.parsed_at,
      },
      accountEmail: user.email,
    }).catch((error) => {
      void captureIncident(error, { source: "manual", operation: "application_profile_from_existing_resume" }, "warning");
    });
  }, [loading, resume, user]);

  useEffect(() => {
    if (!user || loading || !resume || matches.length > 0 || automaticMatchAttempt.current) return;
    if (!isResumeAllowedForAutomation(resume)) return;
    automaticMatchAttempt.current = true;
    setMatchSetup("building");

    void (async () => {
      try {
        if (automaticProfilePromise.current) await automaticProfilePromise.current;
        const firstPass = await supabase.functions.invoke("career-ops-bootstrap", { body: {} });
        if (firstPass.error) throw firstPass.error;

        // Paid accounts get one cached, low-cost evidence review when the
        // deterministic pass finds nothing. It reviews the resume once, then
        // the deterministic matcher reuses the result across jobs.
        if (Number(firstPass.data?.evaluated || 0) === 0 && plan !== "free") {
          const review = await supabase.functions.invoke("career-profile-review", { body: { resume_id: resume.id } });
          if (!review.error) await supabase.functions.invoke("career-ops-bootstrap", { body: {} });
        }

        const { data, error } = await supabase
          .from("job_evaluations")
          .select("id,fit_score,score,tier,eligible,summary,evaluated_at,scanned_job:scanned_jobs(id,title,location,remote_policy,apply_url,company:scan_companies(name))")
          .eq("user_id", user.id)
          .is("dismissed_at", null)
          .eq("eligible", true)
          .gte("fit_score", 50)
          .order("fit_score", { ascending: false })
          .limit(12);
        if (error) throw error;
        setMatches((data || []) as unknown as MatchRow[]);
        setMatchSetup("complete");
      } catch (error) {
        void captureIncident(error, { source: "manual", operation: "agent_automatic_match_setup" }, "warning");
        setMatchSetup("error");
      }
    })();
  }, [loading, matches.length, matchSetup, plan, resume, user]);

  const taskById = useMemo(() => new Map(submitTasks.map((task) => [task.id, task])), [submitTasks]);
  const receiptByDraftId = useMemo(() => {
    const map = new Map<string, SubmissionReceiptRow>();
    for (const receipt of submissionReceipts) {
      if (receipt.draft_application_id && !map.has(receipt.draft_application_id)) {
        map.set(receipt.draft_application_id, receipt);
      }
    }
    return map;
  }, [submissionReceipts]);
  // This heartbeat proves recent task activity, not permanent worker uptime:
  // the browser worker records it only after it has leased a task.
  const workerRecentlyActive = workerHeartbeat
    ? Date.now() - new Date(workerHeartbeat.last_seen).getTime() < 90_000
    : false;

  // Pipeline counters are evidence-based. A queued draft counts only while its
  // linked task is pending/running, and submitted counts only an immutable
  // receipt. This prevents stale packets from overstating activity.
  const counts = useMemo(() => {
    const value = { prepared: 0, queued: 0, submitted: 0, failed: 0, skipped: 0 };
    for (const draft of drafts) {
      const task = draft.applypass_task_id ? taskById.get(draft.applypass_task_id) : undefined;
      const status = resolveAutomationDraftState({
        draftStatus: draft.status,
        taskStatus: task?.status,
        taskOutcome: firstAutomationTaskOutcome(task?.result),
        hasSubmissionReceipt: receiptByDraftId.has(draft.id),
      });
      value[status] += 1;
    }
    return value;
  }, [drafts, receiptByDraftId, taskById]);

  const usage = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    const daysFromMonday = (weekStart.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - daysFromMonday);
    weekStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
      weekly: submissionReceipts.filter((receipt) => new Date(receipt.submitted_at) >= weekStart).length,
      monthly: submissionReceipts.filter((receipt) => new Date(receipt.submitted_at) >= monthStart).length,
    };
  }, [submissionReceipts]);

  const draftsByEvaluation = useMemo(() => {
    const map = new Map<string, DraftStatusRow>();
    for (const draft of drafts) {
      if (draft.evaluation_id && !map.has(draft.evaluation_id)) map.set(draft.evaluation_id, draft);
    }
    return map;
  }, [drafts]);

  // Top 5 right now: highest-fit eligible matches whose application isn't
  // submitted yet — submitted ones graduate to the activity receipts below.
  const topNow = useMemo(() => selectTopNow(matches, drafts), [matches, drafts]);

  // Cards with no packet yet — the ones "Apply to all 5" still starts.
  const applyAllTargets = useMemo(() => selectAppliableNow(topNow, drafts), [topNow, drafts]);

  // Per-job plain status for the Top matches list:
  // Matched → Tailoring resume → Ready → Applying → Applied / Needs you.
  const matchStatus = useCallback((match: MatchRow) => {
    const draft = draftsByEvaluation.get(match.id);
    if (!draft) {
      if (preparingIds.includes(match.id)) {
        return {
          key: "tailoring" as const,
          label: "Tailoring resume…",
          tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          detail: "We're customizing your resume for this job right now.",
          draftId: null as string | null,
        };
      }
      return {
        key: "matched" as const,
        label: "Matched",
        tone: "bg-rp-paper-2 text-rp-ink-2",
        detail: "This job fits your resume — nothing for you to do yet.",
        draftId: null as string | null,
      };
    }
    const task = draft.applypass_task_id ? taskById.get(draft.applypass_task_id) : undefined;
    const evidencedStatus = resolveAutomationDraftState({
      draftStatus: draft.status,
      taskStatus: task?.status,
      taskOutcome: firstAutomationTaskOutcome(task?.result),
      hasSubmissionReceipt: receiptByDraftId.has(draft.id),
    });
    if (evidencedStatus === "queued") {
      const running = task?.status === "running" && workerRecentlyActive;
      return {
        key: "applying" as const,
        label: running ? "Applying now" : "Queued",
        tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        detail: running ? "We're on the employer's form right now." : "In line — we start applying shortly.",
        draftId: draft.id,
      };
    }
    if (evidencedStatus === "submitted") {
      const receipt = receiptByDraftId.get(draft.id);
      return {
        key: "applied" as const,
        label: "Applied ✅",
        tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        detail: receipt?.submitted_at
          ? `Receipt confirmed ${formatDistanceToNow(new Date(receipt.submitted_at), { addSuffix: true })}.`
          : "Receipt confirmed.",
        draftId: draft.id,
      };
    }
    if (evidencedStatus === "skipped") {
      return {
        key: "skipped" as const,
        label: "Skipped",
        tone: "bg-rp-paper-2 text-rp-ink-2",
        detail: shortReason(draft.error_message, "This application was held back before submission."),
        draftId: draft.id,
      };
    }
    if (evidencedStatus === "failed") {
      return {
        key: "needs_you" as const,
        label: "Needs you 🟠",
        tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
        detail: shortReason(
          draft.error_message ?? task?.error_message,
          draft.status === "queued"
            ? "This packet is no longer in the submission queue. Review it to try again."
            : "One answer is missing — open it to finish.",
        ),
        draftId: draft.id,
      };
    }
    if (draft.error_message) {
      return {
        key: "needs_you" as const,
        label: "Needs you 🟠",
        tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
        detail: shortReason(draft.error_message, "One step needs your input before we can finish."),
        draftId: draft.id,
      };
    }
    return {
      key: "ready" as const,
      label: "Ready",
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      detail: "Resume tailored — review it and we'll apply.",
      draftId: draft.id,
    };
  }, [draftsByEvaluation, preparingIds, receiptByDraftId, taskById, workerRecentlyActive]);

  // Receipts: one plain line per action, newest first.
  const recentActivity = useMemo(() => {
    return [...drafts]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 8)
      .map((draft) => {
        const title = draft.evaluation?.scanned_job?.title ?? "a job";
        const company = draft.evaluation?.scanned_job?.company?.name;
        const where = company ? `${title} at ${company}` : title;
        const when = formatDistanceToNow(new Date(draft.updated_at), { addSuffix: true });
        const task = draft.applypass_task_id ? taskById.get(draft.applypass_task_id) : undefined;
        const evidencedStatus = resolveAutomationDraftState({
          draftStatus: draft.status,
          taskStatus: task?.status,
          taskOutcome: firstAutomationTaskOutcome(task?.result),
          hasSubmissionReceipt: receiptByDraftId.has(draft.id),
        });
        if (evidencedStatus === "submitted") {
          return { id: draft.id, kind: "applied" as const, sentence: `Applied to ${where}`, detail: "Receipt confirmed.", when, draftId: draft.id };
        }
        if (evidencedStatus === "queued") {
          const logs = Array.isArray(task?.run_log) ? task.run_log as Array<Record<string, unknown>> : [];
          const lastMessage = [...logs].reverse().find((entry) => typeof entry?.message === "string")?.message;
          const running = task?.status === "running" && workerRecentlyActive;
          return {
            id: draft.id,
            kind: "applying" as const,
            sentence: `Applying to ${where}`,
            detail: running ? String(lastMessage ?? "On the employer's form right now.") : "In line — the apply helper will submit it for you.",
            when,
            draftId: draft.id,
          };
        }
        if (evidencedStatus === "failed") {
          return {
            id: draft.id,
            kind: "needs_you" as const,
            sentence: `${where} needs you`,
            detail: shortReason(
              draft.error_message ?? task?.error_message,
              draft.status === "queued"
                ? "This packet is no longer in the submission queue. Review it to try again."
                : "Something needs your input before we can finish.",
            ),
            when,
            draftId: draft.id,
          };
        }
        if (evidencedStatus === "skipped") {
          return {
            id: draft.id,
            kind: "skipped" as const,
            sentence: `Skipped ${where}`,
            detail: shortReason(draft.error_message, "We held this one back — open it to see why."),
            when,
            draftId: draft.id,
          };
        }
        if (draft.error_message) {
          return {
            id: draft.id,
            kind: "needs_you" as const,
            sentence: `${where} needs you`,
            detail: shortReason(draft.error_message, "One step needs your input before we can finish."),
            when,
            draftId: draft.id,
          };
        }
        return { id: draft.id, kind: "ready" as const, sentence: `Resume tailored for ${where}`, detail: "Ready for your review.", when, draftId: draft.id };
      });
  }, [drafts, receiptByDraftId, taskById, workerRecentlyActive]);

  const activeSubmissions = useMemo(() => drafts
    .flatMap((draft) => {
      const task = draft.applypass_task_id ? taskById.get(draft.applypass_task_id) : undefined;
      const state = resolveAutomationDraftState({
        draftStatus: draft.status,
        taskStatus: task?.status,
        taskOutcome: firstAutomationTaskOutcome(task?.result),
        hasSubmissionReceipt: receiptByDraftId.has(draft.id),
      });
      if (state !== "queued" || !task) return [];
      const logs = Array.isArray(task.run_log) ? task.run_log as Array<Record<string, unknown>> : [];
      const lastMessage = [...logs].reverse().find((entry) => typeof entry?.message === "string")?.message;
      return [{
        draft,
        task,
        title: draft.evaluation?.scanned_job?.title ?? "Application",
        company: draft.evaluation?.scanned_job?.company?.name ?? "Company not listed",
        lastMessage: typeof lastMessage === "string" ? shortReason(lastMessage, "") : null,
      }];
    })
    .sort((a, b) => {
      const taskRank = (status: string) => {
        if (status === "running" && workerRecentlyActive) return 0;
        if (status === "pending") return 1;
        return 2;
      };
      const rankDifference = taskRank(a.task.status) - taskRank(b.task.status);
      if (rankDifference !== 0) return rankDifference;
      return new Date(b.task.updated_at).getTime() - new Date(a.task.updated_at).getTime();
    }), [drafts, receiptByDraftId, taskById, workerRecentlyActive]);
  const currentSubmission = activeSubmissions[0] ?? null;
  const hasRunningSubmission = workerRecentlyActive
    && activeSubmissions.some(({ task }) => task.status === "running");
  const lastRunIsLive = lastRun ? isAgentRunLive({
    status: lastRun.status,
    startedAt: lastRun.started_at,
    workerHeartbeatAt: workerHeartbeat?.last_seen ?? null,
  }) : false;
  const lastRunLabel = lastRun?.status === "running" && !lastRunIsLive
    ? "interrupted"
    : lastRun?.status ?? null;
  const submissionState = counts.queued > 0
    ? hasRunningSubmission ? "submitting" : "waiting"
    : "watching";

  const setContinuousApply = async (action: "start" | "stop") => {
    if (!hasAutoApply) {
      navigate("/pricing");
      return;
    }
    setControlBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("career-agent-control", {
        body: {
          action,
          auto_apply_min_fit_score: controls.auto_apply_min_fit_score,
          auto_apply_min_ats_score: controls.auto_apply_min_ats_score,
          tailoring_mode: controls.tailoring_mode,
          daily_apply_cap: controls.daily_apply_cap,
          agent_max_actions_per_day: controls.agent_max_actions_per_day,
        },
      });
      if (error) throw error;
      setControls((current) => ({
        ...current,
        agent_enabled: action === "start",
        auto_apply_enabled: action === "start",
        review_mode: action === "start" ? "eligible_only" : current.review_mode,
      }));
      await loadWorkspace();
      if (action === "start") {
        toast.success("Auto-apply is on. We'll match, tailor, and apply for you in the background.");
      } else {
        toast.success(`${Number(data?.canceled || 0)} application${Number(data?.canceled || 0) === 1 ? " was" : "s were"} stopped before submission.`);
      }
    } catch (error) {
      void captureIncident(error, { source: "manual", operation: `continuous_apply_${action}` });
      const safeError = toUserFacingError(error, {
        operation: `continuous_apply_${action}`,
        defaultMessage: action === "start"
          ? "Auto-apply could not start. Your current settings are unchanged."
          : "Auto-apply could not be stopped. Try again immediately.",
      });
      toast.error(`${safeError.title}. ${withSupportReference(safeError)}`);
    } finally {
      setControlBusy(false);
    }
  };

  const passMatch = async (match: MatchRow) => {
    setMatches((current) => current.filter((item) => item.id !== match.id));
    const { error } = await supabase.functions.invoke("career-agent-control", {
      body: { action: "pass", evaluation_id: match.id },
    });
    if (error) {
      await loadWorkspace();
      toast.error("That job could not be removed from your feed.");
    }
  };

  const saveControls = async () => {
    if (!user) return;
    if (!hasAutoApply) {
      navigate("/pricing");
      return;
    }

    setSaving(true);
    const normalized: AgentControls = {
      ...controls,
      auto_apply_enabled: controls.auto_apply_enabled,
      review_mode: controls.review_mode === "eligible_only" ? "eligible_only" : "always",
      auto_apply_min_fit_score: Math.min(100, Math.max(60, controls.auto_apply_min_fit_score)),
      auto_apply_min_ats_score: Math.min(95, Math.max(70, controls.auto_apply_min_ats_score)),
      tailoring_mode: controls.tailoring_mode === "coverage_boost" ? "coverage_boost" : "evidence_only",
      daily_apply_cap: Math.min(75, Math.max(1, controls.daily_apply_cap)),
      agent_max_actions_per_day: Math.min(300, Math.max(30, controls.agent_max_actions_per_day)),
    };
    const { error } = await supabase.from("user_job_prefs").upsert({
      user_id: user.id,
      agent_enabled: normalized.agent_enabled,
      auto_apply_enabled: normalized.auto_apply_enabled,
      review_mode: normalized.review_mode,
      auto_apply_min_fit_score: normalized.auto_apply_min_fit_score,
      auto_apply_min_ats_score: normalized.auto_apply_min_ats_score,
      tailoring_mode: normalized.tailoring_mode,
      daily_apply_cap: normalized.daily_apply_cap,
      agent_max_actions_per_day: normalized.agent_max_actions_per_day,
      auto_apply_portals: ["greenhouse", "ashby", "lever", "workable"],
    }, { onConflict: "user_id" });
    setSaving(false);

    if (error) {
      void captureIncident(new Error(error.message), { source: "manual", operation: "agent_controls_save" });
      const safeError = toUserFacingError(error, {
        operation: "agent_controls_save",
        defaultMessage: "Your existing settings are unchanged. Try saving again in a moment.",
      });
      toast.error(`${safeError.title}. ${withSupportReference(safeError)}`);
      return;
    }
    setControls(normalized);
    toast.success(normalized.agent_enabled ? "Settings saved" : "Auto-apply paused");
  };

  const prepareMatches = async (selectedMatches: MatchRow[]) => {
    if (!hasAutoApply) {
      navigate("/pricing");
      return;
    }
    const selected = selectedMatches.filter((match) => fitScore(match) >= 50).slice(0, 5);
    if (!selected.length) {
      toast.error("No jobs above 50% career fit are ready to prepare yet.");
      return;
    }

    setBatchPreparing(true);
    setPreparingIds(selected.map((match) => match.id));
    setBatchProgress({ current: 0, total: selected.length });
    setApplyErrors({});
    setApplyJobs(selected.map((match) => ({
      evaluationId: match.id,
      title: match.scanned_job?.title ?? "Job opportunity",
      company: match.scanned_job?.company?.name ?? "Unknown company",
    })));
    setApplyModalOpen(true);
    let prepared = 0;
    let queued = 0;
    let needsAttention = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const match = selected[index];
      setBatchProgress({ current: index + 1, total: selected.length });
      try {
        const { data: tailorData, error: tailorError } = await supabase.functions.invoke("career-ops-tailor", {
          body: { evaluation_id: match.id, allow_outside_preferences: true },
        });
        if (tailorError || !tailorData?.draft?.id) throw tailorError ?? new Error("Application packet was not created");
        prepared += 1;

        if (tailorData.draft.tailored_resume_id && match.scanned_job?.id) {
          const { error: atsError } = await supabase.functions.invoke("career-ops-ats", {
            body: { resume_id: tailorData.draft.tailored_resume_id, scanned_job_id: match.scanned_job.id },
          });
          if (atsError) void captureIncident(atsError, { source: "manual", operation: "agent_batch_ats" }, "warning");
        }

        const shouldQueue = controls.review_mode === "eligible_only" && fitScore(match) >= controls.auto_apply_min_fit_score;
        if (shouldQueue) {
          const { error: submitError } = await supabase.functions.invoke("career-ops-submit", {
            body: { draft_application_id: tailorData.draft.id },
          });
          if (submitError) needsAttention += 1;
          else queued += 1;
        }
      } catch (error) {
        needsAttention += 1;
        setApplyErrors((current) => ({
          ...current,
          [match.id]: shortReason(error instanceof Error ? error.message : null, "Tailoring failed — try again in a moment."),
        }));
        void captureIncident(error, { source: "manual", operation: "agent_batch_prepare" });
      }
    }

    await loadWorkspace();
    setBatchPreparing(false);
    setBatchProgress(null);
    setPreparingIds([]);
    const reviewReady = Math.max(0, prepared - queued);
    // "prepared" counts packets built or refreshed in this batch; existing
    // packets are reused, so the pipeline tiles may not grow by this amount.
    toast.success(`${prepared} application${prepared === 1 ? "" : "s"} prepared · ${queued} in line to apply · ${reviewReady + needsAttention} to review`);
  };

  // "Apply to all 5" — tailor (and queue, per review settings) every strip
  // card that doesn't have a packet yet. prepareMatches re-filters and caps
  // at 5, so the batch stays inside the existing pipeline limits.
  const prepareTopMatches = async () => prepareMatches(applyAllTargets);

  const planName = plan === "autopilot" ? "Autopilot" : plan === "pro" ? "Pro" : "Free";
  const isRunning = controls.agent_enabled && hasAutoApply;
  const canStop = isRunning || activeSubmissions.length > 0;
  const latestCoverageScore = normalizeScore(latestAts?.overall);

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-10 space-y-5">
        <div className="h-20 rounded-lg bg-rp-paper animate-pulse motion-reduce:animate-none" />
        <div className="h-40 rounded-lg bg-rp-paper animate-pulse motion-reduce:animate-none" />
        <div className="h-96 rounded-lg bg-rp-paper animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader
        title="Auto-apply."
        status={`${planName.toLowerCase()} · ${hasRunningSubmission ? "applying" : isRunning ? "watching" : "stopped"}`}
        description="We find jobs that fit your resume, tailor it, and apply for you. You can watch everything here."
      />

      {/* HERO — the one master control: is it working for me right now? */}
      <section className={cn(
        "mt-7 border p-6 sm:p-8 transition-colors",
        isRunning ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-rp-rule bg-rp-paper",
      )} aria-label="Auto-apply control">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className={cn(
                "h-2.5 w-2.5 rounded-full",
                !canStop
                  ? "bg-rp-ink-3"
                  : submissionState === "waiting"
                    ? "bg-amber-500"
                    : "bg-emerald-500 animate-pulse motion-reduce:animate-none",
              )} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rp-ink-3" role="status" aria-live="polite">
                {hasRunningSubmission ? "Applying now" : isRunning ? "Enabled" : activeSubmissions.length > 0 ? "Stopping" : "Stopped"}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-rp-ink">
              {canStop
                ? submissionState === "submitting"
                  ? "Submitting matched applications"
                  : submissionState === "waiting"
                    ? "Applications are waiting to submit"
                    : "Watching for strong matches"
                : "Start auto-applying"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-rp-ink-2">
              {canStop
                ? submissionState === "waiting"
                  ? "Your tailored applications are queued, but the submission service has not checked in recently. Nothing is counted as applied until a confirmation receipt is recorded."
                  : "We find jobs that fit your résumé, tailor each application, and record it as applied only after the employer form confirms submission."
                : "We find jobs that fit your resume, tailor it, and apply for you. You can watch everything here."}
            </p>
            {!hasAutoApply && (
              <p className="mt-2 text-xs text-rp-ink-3">Auto-applying is part of the Autopilot plan — the button takes you to the options.</p>
            )}
          </div>
          <Button
            size="lg"
            disabled={controlBusy}
            onClick={() => void setContinuousApply(canStop ? "stop" : "start")}
            className={cn(
              "min-w-[220px] shrink-0 text-base",
              canStop && "bg-red-600 text-white hover:bg-red-700",
            )}
          >
            {canStop ? <Square className="mr-2 h-4 w-4 fill-current" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
            {controlBusy ? "Updating…" : canStop ? "Stop applying" : "Start auto-applying"}
          </Button>
        </div>

        {currentSubmission && (
          <div
            className="mt-6 border border-rp-rule bg-rp-canvas p-4"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rp-ink-3">
                  Current application
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-rp-ink">{currentSubmission.title}</p>
                <p className="truncate text-xs text-rp-ink-2">{currentSubmission.company}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/applications/${currentSubmission.draft.id}`)}
              >
                Watch details
              </Button>
            </div>
            <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Submission progress">
              {[
                { label: "Queued", state: submissionState === "waiting" ? "current" : "complete" },
                { label: "Employer form", state: submissionState === "submitting" ? "current" : "upcoming" },
                { label: "Receipt", state: "upcoming" },
              ].map((step) => (
                <li
                  key={step.label}
                  aria-current={step.state === "current" ? "step" : undefined}
                  className={cn(
                    "border-t-2 pt-2 text-[11px] font-medium",
                    step.state === "complete" && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
                    step.state === "current" && "border-amber-500 text-amber-600 dark:text-amber-400",
                    step.state === "upcoming" && "border-rp-rule-2 text-rp-ink-3",
                  )}
                >
                  {step.label}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-rp-ink-2">
              {submissionState === "submitting"
                ? currentSubmission.lastMessage || "The submission worker is filling the employer form now."
                : workerRecentlyActive
                  ? "Queued and waiting for the submission worker."
                  : "Queued, but the submission worker has not checked in recently."}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-4 border-t border-rp-rule pt-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto] xl:items-center">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-rp-ink">Confirmed this week</span>
              <span className="tabular-nums text-rp-ink-2">{usage.weekly} / 400</span>
            </div>
            <Progress value={Math.min(100, (usage.weekly / 400) * 100)} className="mt-2 h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-rp-ink">Confirmed this month</span>
              <span className="tabular-nums text-rp-ink-2">{usage.monthly} / 1,600</span>
            </div>
            <Progress value={Math.min(100, (usage.monthly / 1600) * 100)} className="mt-2 h-2" />
          </div>
          <div className="flex items-center gap-2 text-xs text-rp-ink-2 xl:justify-end">
            <span className={cn("h-2 w-2 rounded-full", submissionState === "waiting" ? "bg-amber-500" : "bg-emerald-500")} />
            {counts.queued === 0
              ? "Nothing in line — waiting for the next strong match"
              : workerRecentlyActive
                ? "The submission service is working on your queue"
                : "Queued — submission is delayed, and not counted as applied"}
          </div>
        </div>
      </section>

      {/* Glanceable counts */}
      <section className="mt-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-px border border-rp-rule bg-rp-rule" aria-label="Auto-apply status at a glance">
        {[
          { label: "Matches found", value: matches.length, icon: Radar, note: plan === "free" ? "eligible, from your resume" : "eligible, checked every 10 minutes" },
          { label: "Latest job-requirement coverage", value: latestCoverageScore === null ? "—" : `${latestCoverageScore}%`, icon: FileCheck2, note: latestCoverageScore === null ? "no job-specific check yet" : "requirements covered by the latest tailored résumé" },
          { label: "Ready for you", value: counts.prepared, icon: ShieldCheck, note: `${counts.queued} in line to apply` },
          {
            label: "Applied",
            value: counts.submitted,
            icon: Send,
            note: counts.failed + counts.skipped > 0
              ? `${counts.failed} failed · ${counts.skipped} skipped`
              : "confirmed receipts",
          },
        ].map((item) => (
          <div key={item.label} className="bg-rp-canvas p-4 min-h-28">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.16em] text-rp-ink-3">{item.label}</p>
              <item.icon className="h-4 w-4 text-rp-accent" strokeWidth={1.7} />
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-rp-ink">{item.value}</p>
            <p className="mt-1 text-xs text-rp-ink-2">{item.note}</p>
          </div>
        ))}
      </section>

      {/* TOP 5 RIGHT NOW — five cards, one click to apply to all */}
      <section className="mt-6 border border-rp-rule bg-rp-canvas" aria-label="Top 5 right now">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rp-rule p-5">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-rp-accent" />
              <h2 className="text-base font-semibold text-rp-ink">Top 5 right now</h2>
              {plan !== "free" && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Live</span>}
            </div>
            <p className="mt-1 text-xs text-rp-ink-2">
              We tailor your resume for each job, then apply for you. Watch it happen below.
              {controls.review_mode !== "eligible_only" && " You approve each one before it's sent."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={prepareTopMatches} disabled={batchPreparing || applyAllTargets.length === 0}>
              <Send className="mr-2 h-3.5 w-3.5" />
              {batchProgress ? `Tailoring ${batchProgress.current}/${batchProgress.total}…` : controls.review_mode === "eligible_only" ? "Apply to all 5" : "Prepare all 5"}
            </Button>
            <button
              onClick={() => void loadWorkspace(true)}
              className="inline-flex items-center gap-2 px-2 text-xs font-medium text-rp-ink-2 hover:text-rp-ink"
              disabled={refreshing || batchPreparing}
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin motion-reduce:animate-none")} /> Refresh
            </button>
          </div>
        </div>
        {matches.length === 0 ? (
          <div className="p-8 text-center">
            {matchSetup === "building" ? <RefreshCcw className="mx-auto h-8 w-8 animate-spin text-rp-accent motion-reduce:animate-none" /> : <BriefcaseBusiness className="mx-auto h-8 w-8 text-rp-ink-3" />}
            <p className="mt-3 text-sm font-semibold text-rp-ink">
              {!resume ? "Add your resume to get matches" : matchSetup === "building" ? "Finding jobs that fit your resume…" : matchSetup === "error" ? "The match refresh hit a snag" : "No strong matches right now"}
            </p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-rp-ink-2">
              {!resume
                ? "Upload it once — we'll pull out your experience and start finding jobs that fit."
                : matchSetup === "building"
                  ? "This takes a minute or two. You can leave this page while it finishes."
                  : matchSetup === "error"
                    ? "Your resume is safe — just try the refresh again."
                    : "We check fresh jobs every hour and will show them here as soon as something fits you."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {!resume ? (
                <Button size="sm" onClick={() => navigate("/resume-builder")}>Upload resume</Button>
              ) : matchSetup === "error" ? (
                <Button size="sm" onClick={() => { automaticMatchAttempt.current = false; setMatchSetup("idle"); void loadWorkspace(true); }}>Try again</Button>
              ) : matchSetup !== "building" ? (
                <Button size="sm" onClick={() => navigate("/career-ops/preferences")}>Broaden preferences</Button>
              ) : null}
            </div>
          </div>
        ) : topNow.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-sm font-semibold text-rp-ink">All top matches are in flight</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-rp-ink-2">
              Every strong match already has an application going — watch it in Recent activity below. New matches land here as we find them.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/job-tracker")}>Track applications</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {topNow.map((match) => {
              const score = fitScore(match);
              const title = match.scanned_job?.title ?? "Job opportunity";
              const company = match.scanned_job?.company?.name ?? "Unknown company";
              const status = matchStatus(match);
              const why = match.summary?.trim() || "This job fits your resume — open Matches for the full breakdown.";
              return (
                <div key={match.id} className="flex flex-col border border-rp-rule bg-rp-paper p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums", fitChipClasses(score))}
                      aria-label={`${score}% career fit`}
                    >
                      {score}% career fit
                    </span>
                    {(status.key === "matched" || status.key === "tailoring") && (
                      <button
                        type="button"
                        onClick={() => void passMatch(match)}
                        disabled={batchPreparing}
                        className="text-rp-ink-3 transition-colors hover:text-rp-ink disabled:opacity-50"
                        aria-label={`Pass on ${title} at ${company}`}
                        title="Pass — stop showing this job"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-rp-ink" title={title}>{title}</p>
                  <p className="mt-0.5 truncate text-xs text-rp-ink-2">{company}{match.scanned_job?.location ? ` · ${match.scanned_job.location}` : ""}</p>
                  <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-rp-ink-2">{why}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", status.tone)}>{status.label}</span>
                    <span className="truncate text-[11px] text-rp-ink-3" title={status.detail}>{status.detail}</span>
                  </div>
                  <div className="mt-auto pt-3">
                    {status.key === "matched" && (
                      <Button size="sm" className="w-full" onClick={() => void prepareMatches([match])} disabled={batchPreparing}>
                        <Send className="mr-1.5 h-3.5 w-3.5" /> Apply
                      </Button>
                    )}
                    {status.key === "tailoring" && (
                      <Button size="sm" className="w-full" disabled>
                        <RefreshCcw className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Tailoring…
                      </Button>
                    )}
                    {status.key === "ready" && status.draftId && (
                      <Button size="sm" className="w-full" onClick={() => navigate(`/applications/${status.draftId}`)}>Review & apply</Button>
                    )}
                    {(status.key === "applying" || status.key === "applied") && status.draftId && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/applications/${status.draftId}`)}>
                        {status.key === "applied" ? "View receipt" : "Watch it live"}
                      </Button>
                    )}
                    {status.key === "needs_you" && status.draftId && (
                      <Button size="sm" className="w-full" onClick={() => navigate(`/applications/${status.draftId}`)}>Fix it</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={() => navigate("/matches")} className="flex w-full items-center justify-between border-t border-rp-rule p-4 text-xs font-medium text-rp-ink hover:bg-rp-paper">
          See all matches <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </section>

      {/* RECENT ACTIVITY — receipts for everything */}
      <section className="mt-6 border border-rp-rule bg-rp-paper p-5 sm:p-6" aria-label="Recent activity">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-rp-accent" />
            <h2 className="text-base font-semibold text-rp-ink">Recent activity</h2>
          </div>
          <button onClick={() => navigate("/applications")} className="inline-flex items-center gap-1.5 text-xs font-medium text-rp-ink hover:text-rp-accent">
            See all applications <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-rp-ink-2">A receipt for everything we do for you — newest first.</p>
        {recentActivity.length === 0 ? (
          <p className="mt-5 border border-dashed border-rp-rule-2 bg-rp-canvas p-5 text-center text-xs leading-relaxed text-rp-ink-2">
            Nothing here yet. Once auto-apply starts working, every match, tailored resume, and application shows up here with a time stamp.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rp-rule">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start gap-3">
                  {item.kind === "applied" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : item.kind === "applying" ? (
                    <Send className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  ) : item.kind === "needs_you" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  ) : item.kind === "skipped" ? (
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-rp-ink-3" />
                  ) : (
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-rp-accent" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-rp-ink">
                      {item.sentence} <span className="text-rp-ink-3">· {item.when}</span>
                    </p>
                    <p className={cn("mt-0.5 text-xs leading-relaxed", item.kind === "needs_you" ? "text-orange-600 dark:text-orange-400" : "text-rp-ink-2")}>{item.detail}</p>
                  </div>
                </div>
                {item.kind === "needs_you" ? (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/applications/${item.draftId}`)}>Fix it</Button>
                ) : item.kind === "ready" ? (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/applications/${item.draftId}`)}>Review</Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* JOB-SPECIFIC RESUME MATCH */}
      <section className="mt-6 border border-rp-rule bg-rp-paper p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-rp-accent" />
              <h2 className="text-base font-semibold text-rp-ink">Tailored résumé job-requirement coverage</h2>
            </div>
            <p className="mt-1 text-xs text-rp-ink-2">Percentage of the job's extracted requirements supported by evidence in the tailored résumé. It is not a prediction of an employer decision.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/ats-checker")}>Run a manual check</Button>
        </div>
        {latestAts && latestCoverageScore !== null ? (
          <div className="mt-6 grid md:grid-cols-[150px_1fr] gap-6 items-center">
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border-[10px] border-rp-paper-2 bg-rp-canvas mx-auto">
              <span className={cn("text-3xl font-semibold tabular-nums", scoreTone(latestCoverageScore))}>{latestCoverageScore}%</span>
              <span className="text-center text-[10px] uppercase tracking-wider text-rp-ink-3">Job-requirement coverage</span>
            </div>
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-rp-ink-3">
                Generic résumé quality signals · separate from job coverage
              </p>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {ATS_DIMENSIONS.map((dimension) => {
                  const value = normalizeScore(latestAts[dimension.key]) ?? 0;
                  return (
                    <div key={dimension.key}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-rp-ink-2">{dimension.label}</span>
                        <span className="font-medium tabular-nums text-rp-ink">{value}%</span>
                      </div>
                      <Progress value={value} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-3 border border-dashed border-rp-rule-2 bg-rp-canvas p-5">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-rp-ink-2" />
            <div>
              <p className="text-sm font-semibold text-rp-ink">No job-specific check yet</p>
              <p className="mt-1 text-xs text-rp-ink-2">Prepare an application and its tailored job-requirement coverage will appear here.</p>
            </div>
          </div>
        )}
      </section>

      {/* SETTINGS — everything advanced lives behind this one disclosure */}
      <section className="mt-6 border border-rp-rule bg-rp-paper">
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-rp-accent" />
            <span className="text-base font-semibold text-rp-ink">Settings</span>
            <span className="hidden sm:inline text-xs text-rp-ink-2">Thresholds, daily caps, tailoring, connected accounts</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-rp-ink-2 transition-transform", settingsOpen && "rotate-180")} />
        </button>

        {settingsOpen && (
          <div className="border-t border-rp-rule p-5 sm:p-6 space-y-6">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-rp-accent" />
                    <h3 className="text-sm font-semibold text-rp-ink">Auto-apply settings</h3>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-rp-ink-2">
                    Choose how bold we should be. Defaults work well for most people — you can change them any time.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!hasAutoApply}
                  onClick={() => setControls((current) => ({ ...current, agent_enabled: !current.agent_enabled }))}
                  className={cn(
                    "relative h-8 w-14 shrink-0 overflow-hidden rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    controls.agent_enabled && hasAutoApply ? "bg-rp-accent" : "bg-rp-paper-2",
                  )}
                  aria-label="Toggle auto-apply"
                  aria-pressed={controls.agent_enabled}
                >
                  <span className={cn(
                    "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out",
                    controls.agent_enabled && hasAutoApply ? "translate-x-6" : "translate-x-0",
                  )} />
                </button>
              </div>

              {!hasAutoApply && (
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-rp-rule bg-rp-canvas p-4">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-4 w-4 text-rp-ink-2" />
                    <div>
                      <p className="text-sm font-semibold text-rp-ink">Auto-apply settings are locked</p>
                      <p className="text-xs text-rp-ink-2">Manual resume checks, job search, matches, and tracking remain available.</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => navigate("/pricing")}>See Autopilot</Button>
                </div>
              )}

              <div className={cn("mt-6 space-y-6", !hasAutoApply && "opacity-50 pointer-events-none")}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rp-ink-3">How should we apply?</p>
                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setControls((current) => ({ ...current, review_mode: "always", auto_apply_enabled: true }))}
                      className={cn(
                        "border p-4 text-left transition-colors",
                        controls.review_mode !== "eligible_only" ? "border-rp-accent bg-rp-accent/5" : "border-rp-rule hover:border-rp-rule-2",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4 text-rp-accent" />
                      <p className="mt-3 text-sm font-semibold text-rp-ink">Ask me before each application</p>
                      <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">We tailor the resume and answers; you approve each one before it's sent.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setControls((current) => ({ ...current, review_mode: "eligible_only", auto_apply_enabled: true }))}
                      className={cn(
                        "border p-4 text-left transition-colors",
                        controls.review_mode === "eligible_only" ? "border-rp-accent bg-rp-accent/5" : "border-rp-rule hover:border-rp-rule-2",
                      )}
                    >
                      <Send className="h-4 w-4 text-rp-accent" />
                      <p className="mt-3 text-sm font-semibold text-rp-ink">Apply to strong matches automatically</p>
                      <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">We apply to jobs above your score thresholds. Anything missing or sensitive moves to “Needs you” instead of being guessed.</p>
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-rp-rule pt-5">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-rp-ink">Minimum career fit</span>
                    <input
                      type="number"
                      min="60"
                      max="100"
                      value={controls.auto_apply_min_fit_score}
                      onChange={(event) => setControls((current) => ({ ...current, auto_apply_min_fit_score: Number(event.target.value) }))}
                      className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                    />
                    <span className="block text-[11px] leading-relaxed text-rp-ink-3">Only apply to jobs that fit you at least this well.</span>
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-rp-ink">Applications per day</span>
                    <input
                      type="number"
                      min="1"
                      max="75"
                      value={controls.daily_apply_cap}
                      onChange={(event) => setControls((current) => ({ ...current, daily_apply_cap: Number(event.target.value) }))}
                      className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                    />
                    <span className="block text-[11px] leading-relaxed text-rp-ink-3">The most we'll submit in one day.</span>
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-rp-ink">Checks per day</span>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      value={controls.agent_max_actions_per_day}
                      onChange={(event) => setControls((current) => ({ ...current, agent_max_actions_per_day: Number(event.target.value) }))}
                      className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                    />
                    <span className="block text-[11px] leading-relaxed text-rp-ink-3">How much background work we may do daily.</span>
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-rp-ink">Minimum job-requirement coverage</span>
                    <input
                      type="number"
                      min="70"
                      max="95"
                      value={controls.auto_apply_min_ats_score}
                      onChange={(event) => setControls((current) => ({ ...current, auto_apply_min_ats_score: Number(event.target.value) }))}
                      className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                    />
                    <span className="block text-[11px] leading-relaxed text-rp-ink-3">The tailored résumé must cover at least this percentage of extracted job requirements (default 85).</span>
                  </label>
                </div>

                <div className="border-t border-rp-rule pt-5">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-rp-ink">How we tailor your resume</span>
                    <select
                      value={controls.tailoring_mode}
                      onChange={(event) => setControls((current) => ({ ...current, tailoring_mode: event.target.value === "coverage_boost" ? "coverage_boost" : "evidence_only" }))}
                      className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                    >
                      <option value="evidence_only">Strictly your real experience</option>
                      <option value="coverage_boost">Highlight matching keywords from your real experience</option>
                    </select>
                    <span className="block text-[11px] leading-relaxed text-rp-ink-3">Either way, we never invent skills, employers, dates, or results.</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rp-rule pt-5">
                  <p className="text-xs text-rp-ink-2">
                    {controls.agent_actions_today}/{controls.agent_max_actions_per_day} checks used today · 400 weekly / 1,600 monthly application allowance
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate("/career-ops/preferences")}>
                      <Settings2 className="mr-2 h-4 w-4" /> Job preferences
                    </Button>
                    <Button size="sm" onClick={saveControls} disabled={saving}>
                      {saving ? "Saving…" : "Save settings"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 border-t border-rp-rule pt-6">
              <div className="border border-rp-rule bg-rp-canvas p-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-rp-accent" />
                  <h3 className="text-sm font-semibold text-rp-ink">Your resume</h3>
                </div>
                {resume ? (
                  <>
                    <div className="mt-4 flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-rp-ink">{resume.title || "Untitled resume"}</p>
                        <p className="mt-1 text-xs text-rp-ink-2">Updated {formatDistanceToNow(new Date(resume.updated_at), { addSuffix: true })}</p>
                      </div>
                    </div>
                    <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => navigate(`/resume-builder/${resume.id}`)}>Review resume</Button>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">We need one resume before we can match jobs or tailor anything.</p>
                    <Button className="mt-4 w-full" size="sm" onClick={() => navigate("/resume-builder")}>Import resume</Button>
                  </>
                )}
              </div>

              <div className="border border-rp-rule bg-rp-canvas p-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-rp-accent" />
                  <h3 className="text-sm font-semibold text-rp-ink">Gmail for verification codes</h3>
                </div>
                {gmailConnection ? (
                  <>
                    <div className="mt-4 flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-rp-ink">Inbox connected</p>
                        <p className="mt-1 truncate text-xs text-rp-ink-2">{gmailConnection.gmail_email}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">We can privately pick up a job portal's one-time code, use it once, and continue. We never see your password.</p>
                    <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => navigate("/inbox")}>Open application inbox</Button>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">Connect Gmail once so employer verification codes don't slow your applications down.</p>
                    <Button className="mt-4 w-full" size="sm" onClick={() => navigate("/inbox")}>Connect Gmail</Button>
                  </>
                )}
              </div>

              <div className="border border-rp-rule bg-rp-canvas p-5">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-rp-accent" />
                  <h3 className="text-sm font-semibold text-rp-ink">Last background run</h3>
                </div>
                {lastRun ? (
                  <>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        lastRunLabel === "completed"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : lastRunLabel === "running"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-rp-paper-2 text-rp-ink-2",
                      )}>{lastRunLabel}</span>
                      <span className="text-[10px] text-rp-ink-3">{formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true })}</span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">
                      {lastRun.status === "running" && !lastRunIsLive
                        ? "This run stopped reporting and is not counted as active. Live application status above comes from the current task queue and confirmed receipts."
                        : lastRun.summary || "No summary was recorded."}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">No background runs yet. They start automatically once auto-apply is on.</p>
                )}
              </div>

              <div className="border border-rp-rule bg-rp-canvas p-5">
                <h3 className="text-sm font-semibold text-rp-ink">What we never do</h3>
                <ul className="mt-4 space-y-3 text-xs text-rp-ink-2">
                  <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-rp-accent" /> Your saved preferences always override our matching.</li>
                  <li className="flex gap-2"><FileCheck2 className="h-4 w-4 shrink-0 text-rp-accent" /> We never invent facts or numbers on your resume.</li>
                  <li className="flex gap-2"><Send className="h-4 w-4 shrink-0 text-rp-accent" /> Only an “Applied” receipt counts as sent.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

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
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Lock,
  Mic2,
  Radar,
  RefreshCcw,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSubscription } from "@/components/SubscriptionGate";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { captureIncident } from "@/lib/incidents";
import { toast } from "sonner";

type ReviewMode = "always" | "low_confidence" | "eligible_only";

interface AgentControls {
  agent_enabled: boolean;
  auto_apply_enabled: boolean;
  review_mode: ReviewMode;
  auto_apply_min_fit_score: number;
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
}

interface AgentRun {
  id: string;
  status: string;
  summary: string | null;
  started_at: string;
  completed_at: string | null;
}

interface LooseQueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface LooseQuery {
  select(columns: string): LooseQuery;
  eq(column: string, value: string): LooseQuery;
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
  daily_apply_cap: 10,
  agent_max_actions_per_day: 60,
  agent_actions_today: 0,
  last_agent_run_at: null,
};

const ATS_DIMENSIONS: Array<{ key: keyof AtsScore; label: string }> = [
  { key: "dim_format", label: "Format" },
  { key: "dim_keywords", label: "Keywords" },
  { key: "dim_experience", label: "Experience" },
  { key: "dim_skills", label: "Skills" },
  { key: "dim_education", label: "Education" },
  { key: "dim_impact", label: "Impact" },
];

function fitScore(match: MatchRow): number {
  return Math.round(match.fit_score ?? match.score * 20);
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-rp-ink-2";
}

export default function AgentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan, hasAutoApply } = useSubscription();
  const [controls, setControls] = useState<AgentControls>(DEFAULT_CONTROLS);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [latestAts, setLatestAts] = useState<AtsScore | null>(null);
  const [resume, setResume] = useState<ResumeSummary | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadWorkspace = useCallback(async (showSpinner = false) => {
    if (!user) return;
    if (showSpinner) setRefreshing(true);

    const [prefsRes, matchRes, atsRes, resumeRes, draftsRes, runsRes] = await Promise.all([
      supabase
        .from("user_job_prefs")
        .select("agent_enabled,auto_apply_enabled,review_mode,auto_apply_min_fit_score,daily_apply_cap,agent_max_actions_per_day,agent_actions_today,last_agent_run_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("job_evaluations")
        .select("id,fit_score,score,tier,eligible,summary,evaluated_at,scanned_job:scanned_jobs(id,title,location,remote_policy,apply_url,company:scan_companies(name))")
        .eq("user_id", user.id)
        .order("fit_score", { ascending: false })
        .limit(5),
      migratedTables
        .from("ats_scores")
        .select("id,overall,dim_format,dim_keywords,dim_experience,dim_skills,dim_education,dim_impact,matched_keywords,missing_keywords,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("resumes")
        .select("id,title,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("draft_applications")
        .select("status")
        .eq("user_id", user.id),
      supabase
        .from("agent_runs")
        .select("id,status,summary,started_at,completed_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const loadError = [prefsRes, matchRes, atsRes, resumeRes, draftsRes, runsRes]
      .map((result) => result.error)
      .find(Boolean);
    if (loadError) {
      void captureIncident(new Error(loadError.message), { source: "manual", operation: "agent_workspace_load" });
      if (showSpinner) toast.error("Some Agent data could not be refreshed.");
    }

    if (prefsRes.data) {
      const row = prefsRes.data;
      setControls({
        ...DEFAULT_CONTROLS,
        ...row,
        review_mode: ["always", "low_confidence", "eligible_only"].includes(row.review_mode)
          ? row.review_mode as ReviewMode
          : "always",
      });
    }
    setMatches((matchRes.data || []) as unknown as MatchRow[]);
    setLatestAts((atsRes.data as unknown as AtsScore | null) ?? null);
    setResume((resumeRes.data as ResumeSummary | null) ?? null);
    setDraftStatuses((draftsRes.data || []).map((row) => row.status));
    setLastRun((runsRes.data as AgentRun | null) ?? null);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // The async loader updates only after network promises settle; the rule
    // cannot infer that boundary from the callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace();

    const channel = supabase
      .channel(`career-agent-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_evaluations", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "ats_scores", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_applications", filter: `user_id=eq.${user.id}` }, () => void loadWorkspace())
      .subscribe();

    // Realtime may be unavailable in a preview project; this bounded fallback
    // keeps an open workspace current without a background browser process.
    const poll = window.setInterval(() => void loadWorkspace(), 30_000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [loadWorkspace, user]);

  const counts = useMemo(() => {
    const value = { prepared: 0, queued: 0, submitted: 0, failed: 0, skipped: 0 };
    for (const status of draftStatuses) {
      if (["draft", "ready"].includes(status)) value.prepared += 1;
      else if (status === "queued") value.queued += 1;
      else if (status === "submitted") value.submitted += 1;
      else if (status === "failed") value.failed += 1;
      else if (status === "skipped") value.skipped += 1;
    }
    return value;
  }, [draftStatuses]);

  const saveControls = async () => {
    if (!user) return;
    if (!hasAutoApply) {
      navigate("/pricing");
      return;
    }

    setSaving(true);
    const normalized: AgentControls = {
      ...controls,
      auto_apply_enabled: true,
      review_mode: controls.review_mode === "eligible_only" ? "eligible_only" : "always",
      auto_apply_min_fit_score: Math.min(100, Math.max(60, controls.auto_apply_min_fit_score)),
      daily_apply_cap: Math.min(25, Math.max(1, controls.daily_apply_cap)),
      agent_max_actions_per_day: Math.min(120, Math.max(10, controls.agent_max_actions_per_day)),
    };
    const { error } = await supabase.from("user_job_prefs").upsert({
      user_id: user.id,
      agent_enabled: normalized.agent_enabled,
      auto_apply_enabled: normalized.auto_apply_enabled,
      review_mode: normalized.review_mode,
      auto_apply_min_fit_score: normalized.auto_apply_min_fit_score,
      daily_apply_cap: normalized.daily_apply_cap,
      agent_max_actions_per_day: normalized.agent_max_actions_per_day,
      auto_apply_portals: ["greenhouse"],
    }, { onConflict: "user_id" });
    setSaving(false);

    if (error) {
      void captureIncident(new Error(error.message), { source: "manual", operation: "agent_controls_save" });
      toast.error(`Could not save Agent controls: ${error.message}`);
      return;
    }
    setControls(normalized);
    toast.success(normalized.agent_enabled ? "Agent controls saved" : "Agent paused");
  };

  const planName = plan === "autopilot" ? "Autopilot" : plan === "pro" ? "Pro" : "Free";
  const agentStatus = controls.agent_enabled && hasAutoApply ? "monitoring" : "paused";

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 space-y-5">
        <div className="h-20 rounded-lg bg-rp-paper animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-96 rounded-lg bg-rp-paper animate-pulse" />
          <div className="h-96 rounded-lg bg-rp-paper animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader
        title="Agent."
        status={`${planName.toLowerCase()} · ${agentStatus}`}
        description="Your continuous application workspace: fresh matches, truthful job-specific resumes, ATS checks, queued submissions, and clear outcomes in one place."
      />

      <section className="mt-7 grid sm:grid-cols-2 xl:grid-cols-4 gap-px border border-rp-rule bg-rp-rule" aria-label="Agent workspace status">
        {[
          { label: "New matches", value: matches.length, icon: Radar, note: plan === "free" ? "personalized feed" : "refreshed hourly" },
          { label: "Latest ATS", value: latestAts ? `${Math.round(latestAts.overall)}%` : "—", icon: FileCheck2, note: latestAts ? "exact resume check" : "run first check" },
          { label: "Review ready", value: counts.prepared, icon: ShieldCheck, note: `${counts.queued} queued` },
          { label: "Submitted", value: counts.submitted, icon: Send, note: counts.failed + counts.skipped > 0 ? `${counts.failed + counts.skipped} need attention` : "verified receipts" },
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

      <div className="mt-6 grid lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] gap-6">
        <div className="space-y-6">
          <section className="border border-rp-rule bg-rp-paper p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-rp-accent" />
                  <h2 className="text-lg font-semibold text-rp-ink">Career Agent controls</h2>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-rp-ink-2 max-w-2xl">
                  Autopilot checks fresh company-direct roles every hour, ranks the complete resume story and skills, then prepares or queues applications according to the policy below.
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
                aria-label="Toggle Career Agent"
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
                    <p className="text-sm font-semibold text-rp-ink">Autopilot controls are locked</p>
                    <p className="text-xs text-rp-ink-2">Manual ATS checks, job search, matches, and tracking remain available.</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => navigate("/pricing")}>See Autopilot</Button>
              </div>
            )}

            <div className={cn("mt-6 space-y-6", !hasAutoApply && "opacity-50 pointer-events-none")}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rp-ink-3">Submission policy</p>
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
                    <p className="mt-3 text-sm font-semibold text-rp-ink">Ask before submit</p>
                    <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Prepare the tailored resume, answers, and ATS preview; you approve the final queue action.</p>
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
                    <p className="mt-3 text-sm font-semibold text-rp-ink">Apply strong matches automatically</p>
                    <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Prepare and queue supported jobs above your fit threshold. Missing answers, sensitive questions, and portal challenges move to Needs attention instead of being guessed.</p>
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 border-t border-rp-rule pt-5">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-rp-ink">Minimum fit score</span>
                  <input
                    type="number"
                    min="60"
                    max="100"
                    value={controls.auto_apply_min_fit_score}
                    onChange={(event) => setControls((current) => ({ ...current, auto_apply_min_fit_score: Number(event.target.value) }))}
                    className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-rp-ink">Daily submissions</span>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={controls.daily_apply_cap}
                    onChange={(event) => setControls((current) => ({ ...current, daily_apply_cap: Number(event.target.value) }))}
                    className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-rp-ink">Daily agent actions</span>
                  <input
                    type="number"
                    min="10"
                    max="120"
                    value={controls.agent_max_actions_per_day}
                    onChange={(event) => setControls((current) => ({ ...current, agent_max_actions_per_day: Number(event.target.value) }))}
                    className="h-10 w-full rounded-md border border-rp-rule bg-rp-canvas px-3 text-sm text-rp-ink"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rp-rule pt-5">
                <p className="text-xs text-rp-ink-2">
                  {controls.agent_actions_today}/{controls.agent_max_actions_per_day} workflow steps today · up to 100 verified submissions per month
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("/career-ops/preferences")}>
                    <Settings2 className="mr-2 h-4 w-4" /> Advanced rules
                  </Button>
                  <Button size="sm" onClick={saveControls} disabled={saving}>
                    {saving ? "Saving…" : "Save Agent controls"}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="border border-rp-rule bg-rp-canvas">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rp-rule p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-rp-accent" />
                  <h2 className="text-base font-semibold text-rp-ink">Matches for you</h2>
                  {plan !== "free" && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Live</span>}
                </div>
                <p className="mt-1 text-xs text-rp-ink-2">Autopilot refreshes this feed hourly, even when you are signed out.</p>
              </div>
              <button
                onClick={() => void loadWorkspace(true)}
                className="inline-flex items-center gap-2 text-xs font-medium text-rp-ink-2 hover:text-rp-ink"
                disabled={refreshing}
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
              </button>
            </div>
            {matches.length === 0 ? (
              <div className="p-8 text-center">
                <BriefcaseBusiness className="mx-auto h-8 w-8 text-rp-ink-3" />
                <p className="mt-3 text-sm font-semibold text-rp-ink">No personalized matches yet</p>
                <p className="mt-1 text-xs text-rp-ink-2">Finish your source resume and target profile, then refresh this workspace.</p>
                <Button className="mt-4" size="sm" onClick={() => navigate("/job-search")}>Browse jobs</Button>
              </div>
            ) : (
              <div className="divide-y divide-rp-rule">
                {matches.map((match) => {
                  const score = fitScore(match);
                  const company = match.scanned_job?.company?.name ?? "Unknown company";
                  return (
                    <button
                      key={match.id}
                      onClick={() => navigate("/matches")}
                      className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-4 p-4 text-left hover:bg-rp-paper transition-colors"
                    >
                      <div>
                        <div className={cn("text-xl font-semibold tabular-nums", scoreTone(score))}>{score}%</div>
                        <p className="mt-0.5 text-[9px] uppercase tracking-wide text-rp-ink-3">
                          {score >= 80 ? "Strong" : score >= 60 ? "Possible" : "Low"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-rp-ink">{match.scanned_job?.title ?? "Job match"}</p>
                        <p className="mt-0.5 truncate text-xs text-rp-ink-2">{company}{match.scanned_job?.location ? ` · ${match.scanned_job.location}` : ""}</p>
                        {match.summary && <p className="mt-1 line-clamp-1 text-xs text-rp-ink-2">{match.summary}</p>}
                        <Progress value={score} className="mt-2 h-1.5" aria-label={`${score}% career fit`} />
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-rp-ink-3">Career fit</span>
                        <p className="mt-1 text-[10px] text-rp-ink-3">{formatDistanceToNow(new Date(match.evaluated_at), { addSuffix: true })}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={() => navigate("/matches")} className="flex w-full items-center justify-between border-t border-rp-rule p-4 text-xs font-medium text-rp-ink hover:bg-rp-paper">
              Open all matches <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </section>

          <section className="border border-rp-rule bg-rp-paper p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-rp-accent" />
                  <h2 className="text-base font-semibold text-rp-ink">ATS preview</h2>
                </div>
                <p className="mt-1 text-xs text-rp-ink-2">Manual checks work on every plan. Autopilot also scores each tailored resume against its job.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/ats-checker")}>Run manual ATS check</Button>
            </div>
            {latestAts ? (
              <div className="mt-6 grid md:grid-cols-[150px_1fr] gap-6 items-center">
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border-[10px] border-rp-paper-2 bg-rp-canvas mx-auto">
                  <span className={cn("text-3xl font-semibold tabular-nums", scoreTone(latestAts.overall))}>{Math.round(latestAts.overall)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-rp-ink-3">ATS score</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {ATS_DIMENSIONS.map((dimension) => {
                    const value = Number(latestAts[dimension.key] ?? 0);
                    return (
                      <div key={dimension.key}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-rp-ink-2">{dimension.label}</span>
                          <span className="font-medium tabular-nums text-rp-ink">{Math.round(value)}</span>
                        </div>
                        <Progress value={value} className="h-1.5" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-start gap-3 border border-dashed border-rp-rule-2 bg-rp-canvas p-5">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-rp-ink-2" />
                <div>
                  <p className="text-sm font-semibold text-rp-ink">No ATS result yet</p>
                  <p className="mt-1 text-xs text-rp-ink-2">Choose a resume and job description to see format, keyword, experience, skill, education, and impact scores.</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="border border-rp-rule bg-rp-paper p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-rp-accent" />
              <h2 className="text-sm font-semibold text-rp-ink">Resume source</h2>
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
                <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => navigate(`/resume-builder/${resume.id}`)}>Review source resume</Button>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">A source resume is required before the Agent can match evidence or tailor a job-specific version.</p>
                <Button className="mt-4 w-full" size="sm" onClick={() => navigate("/resume-builder")}>Import resume</Button>
              </>
            )}
          </section>

          <section className="border border-rp-rule bg-rp-canvas p-5">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-rp-accent" />
              <h2 className="text-sm font-semibold text-rp-ink">Last Agent run</h2>
            </div>
            {lastRun ? (
              <>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    lastRun.status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  )}>{lastRun.status}</span>
                  <span className="text-[10px] text-rp-ink-3">{formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true })}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">{lastRun.summary || "No summary was recorded."}</p>
              </>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">No runs yet. Enable the Agent after setting your target roles and resume.</p>
            )}
          </section>

          <section className="border border-rp-rule bg-rp-paper p-5">
            <h2 className="text-sm font-semibold text-rp-ink">Human checkpoints</h2>
            <ul className="mt-4 space-y-3 text-xs text-rp-ink-2">
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-rp-accent" /> Hard filters always override AI ranking.</li>
              <li className="flex gap-2"><FileCheck2 className="h-4 w-4 shrink-0 text-rp-accent" /> Tailored resumes cannot invent facts or numbers.</li>
              <li className="flex gap-2"><Send className="h-4 w-4 shrink-0 text-rp-accent" /> Only a Submitted receipt counts as applied.</li>
            </ul>
          </section>

          <button onClick={() => navigate("/interview-prep")} className="w-full border border-rp-rule bg-rp-canvas p-5 text-left hover:bg-rp-paper transition-colors">
            <Mic2 className="h-4 w-4 text-rp-accent" />
            <p className="mt-3 text-sm font-semibold text-rp-ink">Interview practice</p>
            <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Prepare STAR stories and rehearse when a match advances.</p>
          </button>
        </aside>
      </div>
    </div>
  );
}

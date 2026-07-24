import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleSlash,
  Inbox,
  Loader2,
  Plane,
  RefreshCcw,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { captureIncident } from "@/lib/incidents";
import { cn } from "@/lib/utils";
import { resolveAutomationDraftState } from "@/lib/application-funnel";
import {
  rowMatchesTab,
  tabCounts,
  taskJobResult,
  toBoardRow,
  type BoardDraft,
  type BoardRow,
  type BoardStatusKey,
  type BoardTab,
  type BoardTask,
} from "@/lib/application-board";

interface SubmissionReceiptEvidence {
  draft_application_id: string;
  submitted_at: string;
}

const TABS: Array<{ key: BoardTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "in_flight", label: "In flight" },
  { key: "needs_you", label: "Needs you" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
];

const STATUS_TONES: Record<BoardStatusKey, string> = {
  submitted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  tailoring: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  queued: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  applying: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  needs_you: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  cant_apply: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  expired: "bg-rp-paper-2 text-rp-ink-2",
  skipped: "bg-rp-paper-2 text-rp-ink-2",
};

interface EmptyCopy {
  icon: typeof Inbox;
  title: string;
  body: string;
  actionLabel: string;
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export default function ApplicationsBoardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<BoardTab>("all");
  const loadRequestId = useRef(0);

  const load = useCallback(async (showSpinner = false) => {
    if (!user) return;
    const requestId = ++loadRequestId.current;
    if (showSpinner) setRefreshing(true);

    const { data: draftData, error: draftError } = await supabase
      .from("draft_applications")
      .select("id,status,error_message,submitted_at,created_at,updated_at,applypass_task_id,tailored_resume_id,tailored_cv_md,answers,evaluation:job_evaluations(scanned_job:scanned_jobs(title,company:scan_companies(name)))")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (requestId !== loadRequestId.current) return;
    if (draftError) {
      void captureIncident(new Error(draftError.message), { source: "manual", operation: "applications_board_load" });
      // Honest failure: don't fall through to the "No applications yet"
      // empty state when the read itself failed — show an error + retry
      // instead. The 30s poll also retries automatically.
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoadError(false);

    const drafts = (draftData || []) as unknown as BoardDraft[];
    const taskIds = [...new Set(drafts.map((draft) => draft.applypass_task_id).filter((id): id is string => Boolean(id)))];
    const draftIds = drafts.map((draft) => draft.id);

    const { data: heartbeatData, error: heartbeatError } = await supabase
      .from("mc_worker_heartbeats")
      .select("last_seen")
      .eq("user_id", user.id)
      .maybeSingle();
    if (requestId !== loadRequestId.current) return;
    if (heartbeatError) {
      void captureIncident(new Error(heartbeatError.message), { source: "manual", operation: "applications_board_heartbeat" }, "warning");
    }
    const heartbeatAt = (heartbeatData as { last_seen?: string } | null)?.last_seen;
    const workerRecentlyActive = Boolean(
      heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() < 90_000,
    );

    let taskById = new Map<string, BoardTask>();
    let receiptByDraftId = new Map<string, SubmissionReceiptEvidence>();
    if (taskIds.length > 0) {
      const { data: taskData, error: taskError } = await supabase
        .from("applypass_tasks")
        .select("id,status,error_message,result,created_at")
        .in("id", taskIds);
      if (requestId !== loadRequestId.current) return;
      if (taskError) {
        void captureIncident(new Error(taskError.message), { source: "manual", operation: "applications_board_tasks" }, "warning");
        setLoadError(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      taskById = new Map(((taskData || []) as unknown as BoardTask[]).map((task) => [
        task.id,
        { ...task, workerRecentlyActive },
      ]));
    }

    if (draftIds.length > 0) {
      const { data: receiptData, error: receiptError } = await supabase
        .from("application_submission_receipts")
        .select("draft_application_id,submitted_at")
        .in("draft_application_id", draftIds);
      if (requestId !== loadRequestId.current) return;
      if (receiptError) {
        void captureIncident(new Error(receiptError.message), { source: "manual", operation: "applications_board_receipts" }, "warning");
        setLoadError(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      receiptByDraftId = new Map(
        ((receiptData || []) as SubmissionReceiptEvidence[]).map((receipt) => [receipt.draft_application_id, receipt]),
      );
    }

    const boardRows = drafts
      .map((draft) => {
        const task = draft.applypass_task_id ? taskById.get(draft.applypass_task_id) : undefined;
        const receipt = receiptByDraftId.get(draft.id);
        const state = resolveAutomationDraftState({
          draftStatus: draft.status,
          taskStatus: task?.status,
          taskOutcome: taskJobResult(task)?.status ?? null,
          hasSubmissionReceipt: Boolean(receipt),
        });
        return toBoardRow(draft, taskById, {
          state,
          receiptSubmittedAt: receipt?.submitted_at,
        });
      })
      .sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime());
    setRows(boardRows);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const initialLoad = window.setTimeout(() => void load(), 0);

    const channel = supabase
      .channel(`applications-board-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_applications", filter: `user_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "applypass_tasks", filter: `user_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "application_submission_receipts", filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();

    // Realtime may be unavailable in a preview project; bounded polling keeps
    // an open board current without a background browser process.
    const poll = window.setInterval(() => void load(), 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      loadRequestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  const counts = useMemo(() => tabCounts(rows), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => rowMatchesTab(row, tab)), [rows, tab]);
  const activeCount = useMemo(
    () => rows.filter((row) => ["tailoring", "queued", "applying"].includes(row.status.key)).length,
    [rows],
  );

  const emptyCopy: EmptyCopy = useMemo(() => {
    switch (tab) {
      case "in_flight":
        return {
          icon: Plane,
          title: "Nothing in flight",
          body: "When we tailor, queue, or submit an application for you, it shows up here while it's moving.",
          actionLabel: "Review top matches",
        };
      case "needs_you":
        return {
          icon: AlertTriangle,
          title: "Nothing needs you",
          body: "You're all caught up. When an application needs your review or a verification step, it lands here.",
          actionLabel: "View all applications",
        };
      case "failed":
        return {
          icon: CircleSlash,
          title: "No failed applications",
          body: "Anything we couldn't submit — and the reason why — shows up here so you can fix it and retry.",
          actionLabel: "Find more matches",
        };
      case "skipped":
        return {
          icon: Inbox,
          title: "Nothing skipped",
          body: "Applications we deliberately held back — with the reason — show up here.",
          actionLabel: "Review matches",
        };
      case "all":
      default:
        return {
          icon: BriefcaseBusiness,
          title: "No applications yet",
          body: "Once auto-apply starts working for you, every tailored resume, submission, and receipt shows up here.",
          actionLabel: "Open auto-apply",
        };
    }
  }, [tab]);

  const emptyAction = () => {
    switch (tab) {
      case "needs_you":
        setTab("all");
        return;
      case "failed":
      case "skipped":
        navigate("/matches");
        return;
      case "in_flight":
      case "all":
      default:
        navigate("/agent");
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-10 space-y-5">
        <div className="h-20 rounded-lg bg-rp-paper animate-pulse motion-reduce:animate-none" />
        <div className="h-10 rounded-lg bg-rp-paper animate-pulse motion-reduce:animate-none" />
        <div className="h-96 rounded-lg bg-rp-paper animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader
        title="All applications."
        status={`auto-apply · ${counts.all} total`}
        description="Every application we're preparing, sending, or have sent for you — with confirmed submission receipts and clear next steps."
      />

      {/* Tabs with counts */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-rp-rule">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Filter applications">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
                  active
                    ? "border-rp-accent text-rp-ink"
                    : "border-transparent text-rp-ink-2 hover:text-rp-ink",
                )}
              >
                {item.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active ? "bg-rp-accent/10 text-rp-accent" : "bg-rp-paper-2 text-rp-ink-3",
                )}>
                  {counts[item.key]}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void load(true)}
          className="mb-1 inline-flex items-center gap-2 px-2 text-xs font-medium text-rp-ink-2 hover:text-rp-ink"
          disabled={refreshing}
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin motion-reduce:animate-none")} /> Refresh
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-rp-ink-2" role="status" aria-live="polite">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          {activeCount > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", activeCount > 0 ? "bg-amber-500" : "bg-emerald-500")} />
        </span>
        {activeCount > 0
          ? `${activeCount} application${activeCount === 1 ? "" : "s"} moving now · status updates live`
          : "Live updates are on · Applied always means a receipt was confirmed"}
      </p>

      {/* Board */}
      {loadError ? (
        <div className="mt-6 border border-dashed border-rp-rule-2 bg-rp-paper p-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rp-ink-3" strokeWidth={1.6} />
          <p className="mt-3 text-sm font-semibold text-rp-ink">Your applications couldn't be loaded</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-rp-ink-2">
            Nothing is lost — this is a connection hiccup on our side. We retry automatically every 15 seconds, or you can try now.
          </p>
          <Button size="sm" className="mt-4" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? "Retrying…" : "Try again"}
          </Button>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="mt-6 border border-dashed border-rp-rule-2 bg-rp-paper p-10 text-center">
          <emptyCopy.icon className="mx-auto h-8 w-8 text-rp-ink-3" strokeWidth={1.6} />
          <p className="mt-3 text-sm font-semibold text-rp-ink">{emptyCopy.title}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-rp-ink-2">{emptyCopy.body}</p>
          <Button size="sm" className="mt-4" onClick={emptyAction}>{emptyCopy.actionLabel}</Button>
        </div>
      ) : (
        <div className="mt-6 border border-rp-rule bg-rp-canvas">
          <Table>
            <TableHeader>
              <TableRow className="border-rp-rule hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.14em] text-rp-ink-3">Position</TableHead>
                <TableHead className="w-[110px] text-[10px] uppercase tracking-[0.14em] text-rp-ink-3">Resume</TableHead>
                <TableHead className="w-[110px] text-[10px] uppercase tracking-[0.14em] text-rp-ink-3">Cover letter</TableHead>
                <TableHead className="w-[220px] text-[10px] uppercase tracking-[0.14em] text-rp-ink-3">Status</TableHead>
                <TableHead className="w-[130px] text-right text-[10px] uppercase tracking-[0.14em] text-rp-ink-3">Activity</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow
                  key={row.draft.id}
                  onClick={() => navigate(`/applications/${row.draft.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/applications/${row.draft.id}`);
                    }
                  }}
                  tabIndex={0}
                  className="cursor-pointer border-rp-rule hover:bg-rp-paper focus-visible:outline-none focus-visible:bg-rp-paper"
                  aria-label={`${row.title} at ${row.company} — ${row.status.label}`}
                >
                  <TableCell className="py-3.5">
                    <p className="truncate text-sm font-semibold text-rp-ink">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-rp-ink-2">{row.company}</p>
                  </TableCell>
                  <TableCell>
                    {row.resumeState === "ready" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rp-ink">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Ready
                      </span>
                    ) : row.resumeState === "tailoring" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Tailoring…
                      </span>
                    ) : (
                      <span className="text-xs text-rp-ink-3">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.hasCoverLetter ? (
                      <span className="text-xs font-medium text-rp-ink">Ready</span>
                    ) : (
                      <span className="text-xs text-rp-ink-3">Off</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_TONES[row.status.key])}
                      aria-live={["tailoring", "queued", "applying"].includes(row.status.key) ? "polite" : undefined}
                    >
                      {["tailoring", "queued", "applying"].includes(row.status.key) && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />
                      )}
                      {row.status.label}
                    </span>
                    <p className="mt-1 line-clamp-1 text-[11px] text-rp-ink-2">{row.status.detail}</p>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-rp-ink-2">
                    {relativeTime(row.activityAt)}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-rp-ink-3" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-rp-ink-3">
        Open any row to review the tailored resume, answers, and submission receipt — or to finish a step that's waiting on you.
      </p>
    </div>
  );
}

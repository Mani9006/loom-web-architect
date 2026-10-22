/**
 * ApplyProgressModal, Tsenta-style live "applying" animation, in our own
 * theme. When the user clicks Apply / Apply All, one row per job (up to 5,
 * parallel) walks a stepper: Tailoring résumé → Applying → result.
 *
 * - While tailoring: a compact résumé preview fades edited lines in with a
 *   GREEN highlight when the tailoring report exists; otherwise shimmering
 *   skeleton lines + a typewriter status degrade gracefully.
 * - While applying: pulse + "Filling the application…" (+ last worker log).
 * - Result: ✅ Applied · <when> / 🟠 Needs you, <reason> / 🔴 Couldn't
 *   apply, <reason> / ✓ Ready for review (review-mode terminal).
 *
 * Self-contained: polls draft_applications + applypass_tasks while open
 * (Realtime on AgentPage keeps flowing too, no backend changes) and lazily
 * fetches career-ops-tailor-report once per draft for the green lines.
 * Status logic lives in ./apply-progress-core (unit-tested).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TerminalText } from "@/components/Terminal";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { TailoringChange } from "../../../supabase/functions/_shared/tailoring-report-core.ts";
import {
  ApplyDraftRow,
  ApplyProgressJob,
  ApplyStepInfo,
  ApplyTaskRow,
  deriveApplyStep,
  lastLogMessage,
  shortReason,
} from "./apply-progress-core";

// ── Animation atoms ─────────────────────────────────────────────────

const TAILOR_MESSAGES = [
  "Reading job description…",
  "Matching keywords to your experience…",
  "Rewriting bullets for this role…",
  "Tightening your summary…",
];

/** Graceful fallback while no tailoring report exists yet: shimmering
 * résumé lines + one rotating typewriter status, in our CLI aesthetic. */
function ShimmerPreview() {
  const [messageIndex, setMessageIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setMessageIndex((i) => (i + 1) % TAILOR_MESSAGES.length), 2600);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="border border-rp-rule/70 bg-background/70 p-3" aria-label="Tailoring in progress">
      <div className="space-y-1.5">
        {[92, 78, 88, 64].map((width, i) => (
          <div key={i} className="h-2 animate-pulse rounded-sm bg-rp-paper-2" style={{ width: `${width}%`, animationDelay: `${i * 180}ms` }} />
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-rp-ink-2">
        <TerminalText key={messageIndex} text={TAILOR_MESSAGES[messageIndex]} speed={18} startDelay={0} hideCursorWhenDone />
      </p>
    </div>
  );
}

/** The real thing: edited résumé lines fade in one by one, GREEN highlight. */
function ChangesPreview({ changes }: { changes: TailoringChange[] }) {
  const lines = useMemo(
    () => changes.filter((change) => change.after && change.after.trim()).slice(0, 4),
    [changes],
  );
  if (lines.length === 0) return <ShimmerPreview />;
  return (
    <div className="border border-emerald-500/25 bg-emerald-500/[0.04] p-3" aria-label="Résumé edits for this job">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        <FileText className="h-3 w-3" /> Editing your résumé, changes in green
      </p>
      <ul className="space-y-1.5">
        {lines.map((change, i) => (
          <motion.li
            key={`${change.section}-${change.bullet_index ?? i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.45, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="line-clamp-1 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200"
          >
            {change.after}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ── Stepper ─────────────────────────────────────────────────────────

type NodeState = "done" | "active" | "pending";

function StepNode({ state, label }: { state: NodeState; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {state === "done" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : state === "active" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
      ) : (
        <span className="h-3.5 w-3.5 rounded-full border border-rp-rule-2" />
      )}
      <span className={cn(
        "text-[11px] font-medium",
        state === "done" && "text-emerald-600 dark:text-emerald-400",
        state === "active" && "text-amber-600 dark:text-amber-400",
        state === "pending" && "text-rp-ink-3",
      )}>
        {label}
      </span>
    </span>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return <span className={cn("h-px w-4 sm:w-6", done ? "bg-emerald-500/60" : "bg-rp-rule-2")} aria-hidden />;
}

function ResultLine({ info }: { info: ApplyStepInfo }) {
  if (info.step === "applied") {
    const when = info.submittedAt ? formatDistanceToNow(new Date(info.submittedAt), { addSuffix: true }) : "just now";
    return (
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
        ✅ Applied · {when}
      </motion.p>
    );
  }
  if (info.step === "needs_you") {
    return (
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[12px] font-medium text-orange-600 dark:text-orange-400">
        🟠 Needs you, {info.reason}
      </motion.p>
    );
  }
  if (info.step === "couldnt_apply") {
    return (
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[12px] font-medium text-rose-600 dark:text-rose-400">
        🔴 Couldn't apply, {info.reason}
      </motion.p>
    );
  }
  if (info.step === "ready") {
    return (
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
        ✓ Résumé tailored, ready for your review
      </motion.p>
    );
  }
  return null;
}

// ── Main modal ──────────────────────────────────────────────────────

const AUTO_CLOSE_MS = 6000;
const POLL_MS = 3000;

export default function ApplyProgressModal({
  open,
  jobs,
  errors = {},
  onClose,
  onOpenApplication,
}: {
  open: boolean;
  jobs: ApplyProgressJob[];
  /** Per-evaluation orchestration failures (tailor threw before a draft existed). */
  errors?: Record<string, string>;
  onClose: () => void;
  onOpenApplication?: (draftId: string) => void;
}) {
  const { user } = useAuth();
  const [draftsByEvaluation, setDraftsByEvaluation] = useState<Map<string, ApplyDraftRow>>(new Map());
  const [tasksById, setTasksById] = useState<Map<string, ApplyTaskRow>>(new Map());
  // draftId → changes | null (report not ready) | undefined (not attempted)
  const [changesByDraft, setChangesByDraft] = useState<Map<string, TailoringChange[] | null>>(new Map());
  const retriedRef = useRef<Set<string>>(new Set());
  const [closingIn, setClosingIn] = useState<number | null>(null);

  const sessionKey = useMemo(() => jobs.map((job) => job.evaluationId).sort().join(","), [jobs]);

  // Reset local state whenever a new batch of jobs opens the modal.
  useEffect(() => {
    if (open) {
      setDraftsByEvaluation(new Map());
      setTasksById(new Map());
      setChangesByDraft(new Map());
      retriedRef.current = new Set();
      setClosingIn(null);
    }
  }, [open, sessionKey]);

  const poll = useCallback(async () => {
    if (!user || jobs.length === 0) return;
    const ids = jobs.map((job) => job.evaluationId);
    const { data: drafts } = await (supabase as any)
      .from("draft_applications")
      .select("id,evaluation_id,status,error_message,submitted_at,applypass_task_id")
      .eq("user_id", user.id)
      .in("evaluation_id", ids);
    const rows = (drafts ?? []) as ApplyDraftRow[];
    const byEvaluation = new Map<string, ApplyDraftRow>();
    for (const row of rows) {
      if (row.evaluation_id && !byEvaluation.has(row.evaluation_id)) byEvaluation.set(row.evaluation_id, row);
    }
    setDraftsByEvaluation(byEvaluation);

    const taskIds = rows.map((row) => row.applypass_task_id).filter((id): id is string => Boolean(id));
    if (taskIds.length > 0) {
      const { data: tasks } = await (supabase as any)
        .from("applypass_tasks")
        .select("id,status,error_message,run_log")
        .in("id", taskIds);
      setTasksById(new Map(((tasks ?? []) as ApplyTaskRow[]).map((task) => [task.id, task])));
    }
  }, [jobs, user]);

  // Poll immediately, then on an interval while open. Realtime on AgentPage
  // also updates the underlying rows; this keeps the modal truthful anywhere.
  useEffect(() => {
    if (!open) return undefined;
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, poll]);

  const infos = useMemo(() => {
    const map = new Map<string, ApplyStepInfo>();
    for (const job of jobs) {
      const draft = draftsByEvaluation.get(job.evaluationId) ?? null;
      const task = draft?.applypass_task_id ? tasksById.get(draft.applypass_task_id) ?? null : null;
      map.set(job.evaluationId, deriveApplyStep(draft, task, errors[job.evaluationId]));
    }
    return map;
  }, [jobs, draftsByEvaluation, tasksById, errors]);

  const doneCount = useMemo(() => [...infos.values()].filter((info) => info.terminal).length, [infos]);
  const allDone = jobs.length > 0 && doneCount === jobs.length;

  // Lazily fetch the tailoring report once per draft (one retry), so edited
  // lines can light up green while the row is still in the tailoring step.
  useEffect(() => {
    if (!open) return;
    for (const info of infos.values()) {
      if (!info.draftId || changesByDraft.has(info.draftId)) continue;
      const draftId = info.draftId;
      setChangesByDraft((current) => new Map(current).set(draftId, null));
      void (async () => {
        const { data, error } = await supabase.functions.invoke("career-ops-tailor-report", {
          body: { draft_application_id: draftId },
        });
        const changes = !error && data?.report?.changes ? (data.report.changes as TailoringChange[]) : null;
        setChangesByDraft((current) => new Map(current).set(draftId, changes));
        if (!changes && !retriedRef.current.has(draftId)) {
          retriedRef.current.add(draftId);
          window.setTimeout(() => {
            setChangesByDraft((current) => {
              if (current.get(draftId)) return current;
              const next = new Map(current);
              next.delete(draftId); // allow exactly one re-attempt
              return next;
            });
          }, 8000);
        }
      })();
    }
  }, [open, infos, changesByDraft]);

  // Auto-close a few seconds after every row reaches a result.
  useEffect(() => {
    if (!open || !allDone) {
      setClosingIn(null);
      return undefined;
    }
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, AUTO_CLOSE_MS - (Date.now() - startedAt));
      setClosingIn(Math.ceil(left / 1000));
      if (left <= 0) {
        window.clearInterval(tick);
        onClose();
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [open, allDone, onClose]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-none border-rp-rule bg-rp-canvas p-0 [&>button]:hidden">
        <div className="border-b border-rp-rule px-5 py-4">
          <DialogTitle className="text-base font-semibold text-rp-ink">
            {allDone ? "All done, receipts below" : `Applying to ${jobs.length} job${jobs.length === 1 ? "" : "s"}…`}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-rp-ink-2">
            {doneCount} of {jobs.length} finished{!allDone ? ", you can watch each step live" : ""}
          </DialogDescription>
        </div>

        <ul className="max-h-[60vh] divide-y divide-rp-rule overflow-y-auto">
          <AnimatePresence initial={false}>
            {jobs.map((job, index) => {
              const draft = draftsByEvaluation.get(job.evaluationId);
              const task = draft?.applypass_task_id ? tasksById.get(draft.applypass_task_id) : undefined;
              const info = infos.get(job.evaluationId) ?? deriveApplyStep(null, null, null);
              const taskRunning = info.step === "applying" && task?.status === "running";
              const logLine = info.step === "applying" ? lastLogMessage(task) : null;
              const changes = info.draftId ? changesByDraft.get(info.draftId) : undefined;
              const tailoringNode: NodeState = info.step === "tailoring" ? "active" : "done";
              const applyingNode: NodeState =
                info.step === "applying" ? "active"
                : info.step === "applied" || (info.terminal && info.step !== "ready" && Boolean(draft?.applypass_task_id)) ? "done"
                : "pending";
              return (
                <motion.li
                  key={job.evaluationId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-rp-ink">{job.title}</p>
                      <p className="mt-0.5 truncate text-xs text-rp-ink-2">{job.company}</p>
                    </div>
                    {info.draftId && info.terminal && onOpenApplication && (
                      <button
                        type="button"
                        onClick={() => onOpenApplication(info.draftId as string)}
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-rp-ink-2 hover:text-rp-ink"
                      >
                        Open <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Stepper: Tailoring résumé → Applying → result */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <StepNode state={tailoringNode} label="Tailoring résumé" />
                    <StepConnector done={tailoringNode === "done"} />
                    <StepNode state={applyingNode} label="Applying" />
                    {info.terminal && (
                      <>
                        <StepConnector done={info.step === "applied"} />
                        <ResultLine info={info} />
                      </>
                    )}
                  </div>

                  {/* Live body per state */}
                  {info.step === "tailoring" && (
                    <div className="mt-3">
                      {changes && changes.length > 0 ? <ChangesPreview changes={changes} /> : <ShimmerPreview />}
                    </div>
                  )}
                  {info.step === "applying" && (
                    <div className="mt-3 flex items-center gap-2 border border-rp-rule/70 bg-background/70 px-3 py-2.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                      </span>
                      <p className="text-[12px] text-rp-ink-2">
                        {taskRunning ? "Filling the application…" : "In line, submission starts shortly."}
                        {taskRunning && logLine && <span className="text-rp-ink-3"> {shortReason(logLine, "")}</span>}
                      </p>
                    </div>
                  )}
                  {info.step === "needs_you" && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-rp-ink-3">
                      <XCircle className="h-3 w-3 text-orange-500" /> Open the application to answer and we'll finish it.
                    </p>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-rp-rule bg-rp-paper px-5 py-3">
          <p className="text-[11px] text-rp-ink-3">
            {allDone
              ? closingIn !== null ? `Closing in ${closingIn}s…` : "Closing…"
              : "Live, updates every few seconds"}
          </p>
          <Button size="sm" variant={allDone ? "default" : "outline"} onClick={onClose}>
            {allDone ? "Done" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

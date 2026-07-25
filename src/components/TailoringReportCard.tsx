import { useEffect, useMemo, useState } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import { ArrowRight, ChevronDown, FileDiff, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  TailoringChange,
  TailoringReport,
  wordDiff,
  WordDiffToken,
} from "../../supabase/functions/_shared/tailoring-report-core.ts";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } }),
};

const CHANGE_TYPE_LABEL: Record<TailoringChange["type"], string> = {
  summary_rewritten: "Summary rewritten",
  bullet_rephrased: "Bullet rephrased",
  bullet_reordered: "Bullets reordered",
  skills_reordered: "Skills reordered",
  keyword_added: "Keyword added",
  section_added: "Section added",
};

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [motionValue, value]);
  return <span className="tabular-nums">{display}</span>;
}

function Gauge({ value, tone, delay = 0 }: { value: number; tone: "muted" | "primary"; delay?: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-20 w-20">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="7" className={tone === "primary" ? "stroke-primary/15" : "stroke-muted-foreground/15"} />
        <motion.circle
          cx="36" cy="36" r={radius} fill="none" strokeWidth="7" strokeLinecap="round"
          className={tone === "primary" ? "stroke-primary" : "stroke-muted-foreground/50"}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">
        <AnimatedNumber value={clamped} />
      </div>
    </div>
  );
}

function DiffText({ tokens, highlight }: { tokens: WordDiffToken[]; highlight: "added" | "removed" }) {
  return (
    <p className="whitespace-pre-wrap text-xs leading-relaxed">
      {tokens.map((token, index) => (
        <span
          key={index}
          className={cn(
            token.kind === "added" && highlight === "added" && "rounded-sm bg-emerald-500/15 px-0.5 font-medium text-emerald-800 dark:text-emerald-200",
            token.kind === "removed" && highlight === "removed" && "rounded-sm bg-rose-500/10 px-0.5 text-muted-foreground line-through decoration-rose-500/60",
          )}
        >
          {token.text}
        </span>
      ))}
    </p>
  );
}

function ChangeRow({ change }: { change: TailoringChange }) {
  const diff = useMemo(
    () => (change.before || change.after ? wordDiff(change.before ?? "", change.after ?? "") : null),
    [change.before, change.after],
  );
  return (
    <li className="border-t border-rp-rule/70 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          change.type === "keyword_added" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 text-primary",
        )}>
          {CHANGE_TYPE_LABEL[change.type]}
        </span>
        {change.jd_keywords.length > 0 && (
          <span className="text-[10px] text-muted-foreground">+{change.jd_keywords.join(", ")}</span>
        )}
      </div>
      {diff && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="border border-rp-rule/60 bg-background/60 p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
            {change.before ? <DiffText tokens={diff.before} highlight="removed" /> : <p className="text-xs italic text-muted-foreground">Not present in master résumé</p>}
          </div>
          <div className="border border-emerald-500/20 bg-emerald-500/5 p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">After</p>
            {change.after ? <DiffText tokens={diff.after} highlight="added" /> : <p className="text-xs italic text-muted-foreground">Removed</p>}
          </div>
        </div>
      )}
    </li>
  );
}

function ChangeGroup({ label, changes, defaultOpen }: { label: string; changes: TailoringChange[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-rp-rule bg-background">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold">{label}<span className="ml-2 font-normal text-muted-foreground">{changes.length} change{changes.length === 1 ? "" : "s"}</span></span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <ul className="border-t border-rp-rule px-3 py-3">{changes.map((change, index) => <ChangeRow key={index} change={change} />)}</ul>}
    </div>
  );
}

function KeywordChip({ keyword, tone }: { keyword: string; tone: "added" | "covered" | "missing" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
      tone === "added" && "border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-200",
      tone === "covered" && "border-rp-rule bg-background text-muted-foreground",
      tone === "missing" && "border-dashed border-muted-foreground/40 text-muted-foreground",
    )}>
      {keyword}
    </span>
  );
}

export default function TailoringReportCard({ report, loading }: { report: TailoringReport | null; loading: boolean }) {
  // Avoid flashing the empty state while the first request is in flight: only
  // show "still generating" copy once the report has been absent for ~2s.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (report) return undefined;
    const timer = window.setTimeout(() => setSettled(true), 2000);
    return () => window.clearTimeout(timer);
  }, [report]);

  const groups = useMemo(() => {
    if (!report) return [] as Array<{ key: string; label: string; changes: TailoringChange[] }>;
    const byKey = new Map<string, { key: string; label: string; changes: TailoringChange[] }>();
    for (const change of report.changes) {
      const key = `${change.section}:${change.entry_id ?? "global"}`;
      const label = change.entry_label
        ? `${change.entry_label}${change.section === "projects" ? " (project)" : ""}`
        : change.section === "summary" ? "Professional summary" : change.section === "skills" ? "Skills" : change.section;
      if (!byKey.has(key)) byKey.set(key, { key, label, changes: [] });
      byKey.get(key)!.changes.push(change);
    }
    return [...byKey.values()];
  }, [report]);

  if (!report) {
    if (loading || !settled) {
      return (
        <section className="mb-6 flex min-h-28 items-center justify-center border border-dashed border-rp-rule bg-rp-canvas p-5" aria-label="What changed for this application">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
            {loading ? "Building your change report…" : "Preparing change report…"}
          </p>
        </section>
      );
    }
    return (
      <section className="mb-6 border border-dashed border-rp-rule bg-rp-canvas p-5 text-center" aria-label="What changed for this application">
        <p className="text-xs text-muted-foreground">Change report is still generating for this application. Refresh the packet or check back shortly.</p>
      </section>
    );
  }

  const before = report.ats_before ?? 0;
  const after = report.ats_after ?? 0;
  const delta = Math.round(after - before);
  const { added, covered_now, still_missing } = report.keyword_delta;

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      custom={0}
      className="mb-6 border border-rp-rule bg-rp-canvas p-5"
      aria-label="What changed for this application"
    >
      <div className="flex items-center gap-2">
        <FileDiff className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">What changed for this application</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">How the tailor rewrote your master résumé for this job, score, keywords, and bullet-level edits.</p>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <Gauge value={before} tone="muted" />
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Master ATS</p>
          </div>
          <div className="flex flex-col items-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            {delta !== 0 && (
              <span className={cn("mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", delta > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-600")}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
          <div className="text-center">
            <Gauge value={after} tone="primary" delay={0.15} />
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Tailored ATS</p>
          </div>
        </div>

        {(added.length > 0 || covered_now.length > 0 || still_missing.length > 0) && (
          <div className="min-w-56 flex-1 space-y-2">
            {added.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Keywords added</p>
                <div className="flex flex-wrap gap-1.5">{added.map((keyword) => <KeywordChip key={keyword} keyword={keyword} tone="added" />)}</div>
              </div>
            )}
            {covered_now.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Already covered</p>
                <div className="flex flex-wrap gap-1.5">{covered_now.map((keyword) => <KeywordChip key={keyword} keyword={keyword} tone="covered" />)}</div>
              </div>
            )}
            {still_missing.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Still missing</p>
                <div className="flex flex-wrap gap-1.5">{still_missing.map((keyword) => <KeywordChip key={keyword} keyword={keyword} tone="missing" />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <div className="mt-4 space-y-2">
          {groups.map((group, index) => <ChangeGroup key={group.key} label={group.label} changes={group.changes} defaultOpen={index === 0} />)}
        </div>
      )}
      {groups.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">No textual edits detected, the tailor kept your master résumé wording for this application.</p>
      )}
    </motion.section>
  );
}

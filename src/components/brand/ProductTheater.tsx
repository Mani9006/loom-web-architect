import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Cloud, FileText, Inbox, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "queued", label: "Queued", icon: Cloud },
  { key: "tailor", label: "Tailoring resume", icon: FileText },
  { key: "form", label: "Filling form", icon: Radar },
  { key: "done", label: "Submitted", icon: Check },
] as const;

const BEFORE = [
  "Owned weekly reporting for a 12-person product ops team",
  "Worked with stakeholders on hiring process improvements",
  "Used Excel and SQL for ad-hoc analysis",
];

const AFTER = [
  "Owned weekly pipeline reporting for a 12-person recruiting ops team",
  "Reduced time-to-offer by coordinating hiring-manager reviews",
  "Built SQL + spreadsheet models used in Monday staffing standups",
];

export function ProductTheater({ className }: { className?: string }) {
  const [stage, setStage] = useState(0);
  const [lines, setLines] = useState(0);

  useEffect(() => {
    const ticker = window.setInterval(() => {
      setStage((current) => (current + 1) % STAGES.length);
    }, 2800);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    setLines(0);
    if (stage !== 1 && stage !== 3) return;
    const ticker = window.setInterval(() => {
      setLines((current) => (current >= AFTER.length ? current : current + 1));
    }, 220);
    return () => window.clearInterval(ticker);
  }, [stage]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-rp-ink/10 bg-rp-paper shadow-[8px_8px_0_0_hsl(var(--rp-ink)/0.08)]", className)}>
      <div className="flex items-center justify-between border-b border-rp-ink/10 px-5 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">In-flight · Staff Recruiter · Denver, CO</p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-rp-accent-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rp-accent-2" />
          Greenhouse · live
        </span>
      </div>
      <div className="grid gap-0 lg:grid-cols-[1fr_1.15fr]">
        <div className="border-b border-rp-ink/10 p-5 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">Lifecycle</p>
          <ol className="mt-4 space-y-2">
            {STAGES.map((item, index) => {
              const Icon = item.icon;
              const active = index === stage;
              const done = index < stage;
              return (
                <li
                  key={item.key}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-[13px]",
                    active && "bg-primary text-primary-foreground",
                    done && !active && "text-rp-accent-2",
                    !active && !done && "text-rp-ink-3",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                  {item.label}
                </li>
              );
            })}
          </ol>
          <p className="mt-5 text-[12px] leading-relaxed text-rp-ink-2">
            Submitted is locked until the portal writes a receipt. This theater is the same sequence the worker reports on Applications.
          </p>
        </div>
        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">Before</p>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-rp-ink-3">
                {BEFORE.map((line) => (
                  <li key={line} className={cn(stage >= 1 && "line-through decoration-rp-ink/30")}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">After</p>
              <ul className="mt-3 min-h-[120px] space-y-2 text-[13px] leading-relaxed text-rp-ink">
                <AnimatePresence>
                  {AFTER.slice(0, stage === 0 ? 0 : lines || AFTER.length).map((line) => (
                    <motion.li
                      key={line}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-rp-accent-2"
                    >
                      {line}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between rounded-md border border-rp-ink/10 bg-rp-canvas px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] text-rp-ink-2">
              <Inbox className="h-3.5 w-3.5 text-rp-accent-2" />
              apply-from · rp8f2a…@apply.resumepreps.com
            </div>
            <span className="font-mono text-[11px] text-rp-ink-3">{stage === 3 ? "receipt:true" : "receipt:pending"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

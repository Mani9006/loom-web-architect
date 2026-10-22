import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { applyLifecycleLabel, diffResumeText } from "@/lib/resume-diff";
import { cn } from "@/lib/utils";

export function ResumeDiffTheater({
  before,
  after,
  status,
}: {
  before: string;
  after: string;
  status: string;
}) {
  const rows = useMemo(() => diffResumeText(before, after), [before, after]);
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    setVisible(0);
    if (rows.length === 0) return;
    const timer = window.setInterval(() => {
      setVisible((current) => {
        if (current >= rows.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, [rows]);

  const stages = ["queued", "draft", "ready", "submitted"];
  const active = status === "queued" ? 0 : status === "draft" ? 1 : status === "submitted" ? 3 : 2;

  return (
    <div>
      <div className="mb-5 grid grid-cols-4 gap-2">
        {stages.map((stage, index) => (
          <div key={stage} className={cn("rounded-md px-3 py-2 text-[11px] font-medium", index <= active ? "bg-primary text-primary-foreground" : "bg-rp-paper-2 text-rp-ink-3")}>
            {applyLifecycleLabel(stage === "draft" ? "draft" : stage)}
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-rp-ink/10 bg-rp-canvas p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">Before</p>
          <pre className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-rp-ink-2">{before || "Source resume not attached to this packet yet."}</pre>
        </section>
        <section className="rounded-lg border border-rp-ink/10 bg-rp-canvas p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">After · rewritten to the job</p>
          <div className="mt-3 space-y-1.5">
            {rows.slice(0, visible).map((row, index) => (
              <motion.p
                key={`${row.kind}-${index}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "text-[13px] leading-relaxed",
                  row.kind === "removed" && "text-rose-700 line-through",
                  row.kind === "added" && "text-emerald-800",
                  row.kind === "same" && "text-rp-ink-2",
                )}
              >
                {row.kind === "added" ? "+ " : row.kind === "removed" ? "− " : "  "}
                {row.text}
              </motion.p>
            ))}
            {rows.length === 0 && <p className="text-[13px] text-rp-ink-2">{after || "Tailored copy appears here after the worker finishes."}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

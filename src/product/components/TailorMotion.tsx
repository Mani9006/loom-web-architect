import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function TailorMotion({
  before,
  after,
  active,
  className,
}: {
  before: string[];
  after: string[];
  active: boolean;
  className?: string;
}) {
  const pairs = Math.max(before.length, after.length, 1);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1600);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div className={cn("grid gap-3 md:grid-cols-2", className)}>
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Source bullets</p>
        <ul className="space-y-2">
          {Array.from({ length: pairs }).map((_, i) => (
            <li key={`b-${i}`} className={cn("text-[13px] leading-snug text-muted-foreground", active && i === tick % pairs && "animate-tailor-swap text-foreground")}>
              {before[i] || "—"}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Tailored bullets</p>
        <ul className="space-y-2">
          {Array.from({ length: pairs }).map((_, i) => (
            <li key={`a-${i}`} className={cn("text-[13px] leading-snug", active && i === tick % pairs && "animate-tailor-swap")}>
              {after[i] || "Waiting for tailor…"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function QueueStage({
  stage,
}: {
  stage: "queued" | "tailoring" | "filling" | "submitted" | "failed" | "needs_you";
}) {
  const steps = [
    { id: "queued", label: "Cloud queue" },
    { id: "tailoring", label: "Tailoring" },
    { id: "filling", label: "Filling" },
    { id: "submitted", label: "Submitted" },
  ] as const;
  const index = stage === "failed" || stage === "needs_you" ? 2 : steps.findIndex((s) => s.id === stage);

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => {
        const done = i < index || stage === "submitted";
        const current = i === index && stage !== "submitted";
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium",
                done && "border-primary/30 bg-primary/10 text-primary",
                current && "border-primary bg-primary text-primary-foreground animate-status-pulse",
                !done && !current && "border-border text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

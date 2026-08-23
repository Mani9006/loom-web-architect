import { cn } from "@/lib/utils";

export function Mark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[5px] bg-primary text-primary-foreground font-semibold tracking-tight",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.48) }}
      aria-hidden
    >
      R
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 no-underline text-foreground">
      <Mark />
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.02em]">ResumePreps</span>}
    </span>
  );
}

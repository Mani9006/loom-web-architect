import { cn } from "@/lib/utils";
import type { BoardStatusKey } from "@/lib/application-board";

const TONES: Record<string, string> = {
  queued: "bg-primary/10 text-primary border-primary/20",
  tailoring: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  applying: "bg-primary/10 text-primary border-primary/20 animate-status-pulse",
  submitted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  needs_you: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25",
  cant_apply: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  expired: "bg-muted text-muted-foreground border-border",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  skipped: "bg-muted text-muted-foreground border-border",
  interview: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  offer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  ghosted: "bg-muted text-muted-foreground border-border",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  applied: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
};

export function StatusChip({
  status,
  label,
  className,
}: {
  status: BoardStatusKey | string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        TONES[status] || "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

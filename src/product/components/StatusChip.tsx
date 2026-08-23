import { cn } from "@/lib/utils";
import type { BoardStatusKey } from "@/lib/application-board";

const TONES: Record<string, string> = {
  queued: "border-primary/40 text-primary",
  tailoring: "border-border text-foreground",
  applying: "border-primary/40 text-primary animate-status-pulse",
  submitted: "border-primary text-primary",
  needs_you: "border-border text-foreground",
  cant_apply: "border-destructive/40 text-destructive",
  expired: "border-border text-muted-foreground",
  failed: "border-destructive/40 text-destructive",
  skipped: "border-border text-muted-foreground",
  interview: "border-primary/40 text-primary",
  offer: "border-primary text-primary",
  ghosted: "border-border text-muted-foreground",
  rejected: "border-destructive/40 text-destructive",
  applied: "border-primary/40 text-primary",
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
        "inline-flex items-center border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]",
        TONES[status] || "border-border text-muted-foreground",
        className,
      )}
    >
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

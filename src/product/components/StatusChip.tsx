import { cn } from "@/lib/utils";
import type { BoardStatusKey } from "@/lib/application-board";

const TONES: Record<string, string> = {
  queued: "border-primary/40 bg-primary/8 text-primary",
  tailoring: "border-border bg-muted/60 text-foreground",
  applying: "border-primary/40 bg-primary/8 text-primary animate-status-pulse",
  submitted: "border-primary/50 bg-primary/10 text-primary",
  needs_you: "border-border bg-muted/50 text-foreground",
  cant_apply: "border-destructive/40 bg-destructive/8 text-destructive",
  expired: "border-border text-muted-foreground",
  failed: "border-destructive/40 bg-destructive/8 text-destructive",
  skipped: "border-border text-muted-foreground",
  interview: "border-primary/40 bg-primary/8 text-primary",
  offer: "border-primary/50 bg-primary/10 text-primary",
  ghosted: "border-border text-muted-foreground",
  rejected: "border-destructive/40 bg-destructive/8 text-destructive",
  applied: "border-primary/40 bg-primary/8 text-primary",
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
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em]",
        TONES[status] || "border-border text-muted-foreground",
        className,
      )}
    >
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

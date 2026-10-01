import { cn } from "@/lib/utils";

/** A keyboard key hint. Decorative: pair it with a text label or aria-keyshortcuts. */
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-background px-1 font-sans text-xs font-medium leading-none text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}


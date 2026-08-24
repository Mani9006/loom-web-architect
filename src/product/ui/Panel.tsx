import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  kicker,
  action,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn(flush ? "rp-panel-flush" : "rp-panel", className)}>
      {(title || action || kicker) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {kicker && <p className="rp-kicker">{kicker}</p>}
            {title && <h2 className={cn("truncate text-[13px] font-semibold tracking-tight", kicker && "mt-1")}>{title}</h2>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(flush && !title ? "" : title ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

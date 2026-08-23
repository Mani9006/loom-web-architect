import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center", className)}>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 mx-auto max-w-md text-[13px] text-muted-foreground leading-relaxed">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0 max-w-2xl">
        <p className="rp-kicker">{kicker}</p>
        <h1 className="rp-page-title mt-1.5">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{action}</div>}
    </header>
  );
}

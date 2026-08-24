import type { ReactNode } from "react";

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
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="rp-kicker">{kicker}</p>
        <h1 className="rp-page-title mt-0.5">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

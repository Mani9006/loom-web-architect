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
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-caption text-primary">{kicker}</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">{title}</h1>
        {subtitle && <p className="mt-3 text-body text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

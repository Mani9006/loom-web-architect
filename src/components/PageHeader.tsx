import { ReactNode } from "react";

export function PageHeader({
  title,
  status,
  description,
  action,
}: {
  title: string;
  status?: string;
  description?: string;
  action?: ReactNode;
  speed?: number;
  startDelay?: number;
}) {
  return (
    <div className="mb-8">
      {status && (
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">
          {status}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-display text-[34px] font-semibold italic leading-none tracking-tight text-rp-ink sm:text-[40px]">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-rp-ink-2">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

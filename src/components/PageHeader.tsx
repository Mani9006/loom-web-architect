/**
 * Shared header for every interior page.
 *
 * Product-first: small mono crumb, tight title, single-line description,
 * optional right-aligned action slot. No typewriter effect, no blinking
 * cursor, no big display font. Density matches the app shell.
 *
 *   <PageHeader
 *     title="Matches"
 *     status="live"
 *     description="Roles scored against your resume."
 *     action={<button>New search</button>}
 *   />
 */
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
  /** kept for backward-compat with existing call sites, ignored */
  speed?: number;
  startDelay?: number;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="text-[11px] uppercase tracking-[0.14em] text-rp-ink-3 font-mono"
        >
          {status || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-rp-ink font-semibold tracking-[-0.015em]"
            style={{ fontSize: "22px", lineHeight: "28px" }}
          >
            {title}
          </h1>
          {description && (
            <p
              className="text-rp-ink-2 mt-1"
              style={{ fontSize: "13px", lineHeight: "20px" }}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className="mt-5 h-px bg-rp-rule" />
    </div>
  );
}

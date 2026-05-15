/**
 * Shared header for every interior page.
 *
 *   <PageHeader title="Find your next role." status="job-search · live" />
 *
 * Renders:
 *   - Top row with date on the left, status badge in mono on the right,
 *     hairline rule underneath.
 *   - Big typed title with the red cursor.
 *   - Optional Inter description paragraph.
 *
 * Keeps the visual cadence of /home and /resume-builder consistent across
 * Job Search, ATS Checker, Cover Letters, Interview Prep, Matches, etc.
 */
import { TerminalText } from "@/components/Terminal";

export function PageHeader({
  title,
  status,
  description,
  speed = 80,
  startDelay = 150,
}: {
  title: string;
  status?: string;
  description?: string;
  speed?: number;
  startDelay?: number;
}) {
  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-4 border-b border-rp-rule">
        <span
          className="text-rp-ink-2"
          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.06em" }}
        >
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
        {status && (
          <span
            className="text-rp-ink-3"
            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.06em" }}
          >
            {status}
          </span>
        )}
      </div>

      <div className="mt-10 mb-3">
        <h1
          className="text-rp-ink"
          style={{
            fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
            fontSize: "clamp(36px, 5.5vw, 56px)",
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            fontWeight: 700,
          }}
        >
          <TerminalText text={title} speed={speed} startDelay={startDelay} />
        </h1>
      </div>

      {description && (
        <p
          className="text-rp-ink-2 max-w-2xl"
          style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "16px", lineHeight: 1.6 }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

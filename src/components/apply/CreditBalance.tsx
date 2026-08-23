import { creditPlanLabel, type ApplyCreditSnapshot } from "@/lib/apply-credits";
import { cn } from "@/lib/utils";

export function CreditBalance({
  snapshot,
  className,
}: {
  snapshot: ApplyCreditSnapshot | null;
  className?: string;
}) {
  return (
    <div className={cn("text-right", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rp-ink-3">
        Apply credits
      </p>
      {snapshot ? (
        <>
          <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rp-ink">
            {snapshot.remaining}
            <span className="text-sm font-normal text-rp-ink-2"> / {snapshot.granted}</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-rp-ink-3">
            {snapshot.daily_remaining} live left today · {creditPlanLabel(snapshot.plan)}
            {snapshot.reserved > 0 ? ` · ${snapshot.reserved} reserved` : ""}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-rp-ink-2">Loading balance…</p>
      )}
    </div>
  );
}

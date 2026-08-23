import { cn } from "@/lib/utils";

export function MatchRing({
  score,
  size = 44,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;
  const tone = clamped >= 80 ? "text-primary" : clamped >= 65 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" className="text-border" strokeWidth="3.5" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          className={tone}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={cn("text-[11px] font-semibold tabular-nums", tone)}>{clamped}</span>
    </div>
  );
}

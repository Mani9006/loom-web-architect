import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Mark({
  href,
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2.5 text-foreground no-underline", className)}>
      <span className="inline-block h-[15px] w-[3px] rounded-sm bg-primary" aria-hidden />
      {!compact && (
        <span className="text-[12.5px] font-semibold tracking-[0.12em] uppercase">ResumePreps</span>
      )}
    </span>
  );
  if (!href) return inner;
  return (
    <Link to={href} className="no-underline">
      {inner}
    </Link>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean; invert?: boolean }) {
  return <Mark compact={compact} />;
}

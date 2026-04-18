import { cn } from "@/lib/utils";

export type RPIconName =
  | "home"
  | "search"
  | "resume"
  | "score"
  | "pipeline"
  | "letter"
  | "interview"
  | "chat"
  | "tailor"
  | "pitch"
  | "trophy"
  | "bookmark"
  | "applied"
  | "reject"
  | "spark"
  | "zap"
  | "settings"
  | "moon"
  | "play"
  | "arrow"
  | "check";

interface RPIconProps extends React.SVGAttributes<SVGSVGElement> {
  name: RPIconName;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}

export function RPIcon({
  name,
  size = 18,
  strokeWidth = 1.75,
  filled = false,
  className,
  ...rest
}: RPIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("rp-icon", filled && "rp-icon--filled", className)}
      style={{ ["--rp-sw" as any]: strokeWidth, ...(rest.style || {}) }}
      {...rest}
    >
      <use href={`#rp-${name}`} />
    </svg>
  );
}

export default RPIcon;

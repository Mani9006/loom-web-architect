import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  dark?: boolean;
  markOnly?: boolean;
}

const sizes = {
  sm: { mark: "h-7 w-7 text-[11px]", text: "text-[15px]" },
  md: { mark: "h-8 w-8 text-[12px]", text: "text-[17px]" },
  lg: { mark: "h-10 w-10 text-[14px]", text: "text-[20px]" },
  xl: { mark: "h-14 w-14 text-[18px]", text: "text-[28px]" },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-primary text-primary-foreground font-display font-semibold select-none",
        className,
      )}
      aria-hidden="true"
    >
      <span className="leading-none">rp</span>
    </div>
  );
}

export default function Logo({ size = "md", className, markOnly }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoIcon className={s.mark} />
      {!markOnly && (
        <span className={cn(s.text, "font-display font-semibold tracking-tight text-rp-ink")}>
          ResumePreps
        </span>
      )}
    </div>
  );
}

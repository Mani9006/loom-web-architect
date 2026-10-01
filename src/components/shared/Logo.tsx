import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  dark?: boolean;
  /** When true, renders just the circled R mark without wordmark. */
  markOnly?: boolean;
}

const sizes = {
  sm: { mark: "w-7 h-7", text: "text-sm" },
  md: { mark: "w-8 h-8", text: "text-sm" },
  lg: { mark: "w-10 h-10", text: "text-lg" },
  xl: { mark: "w-14 h-14", text: "text-2xl" },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold select-none",
        "bg-foreground text-background",
        className,
      )}
      aria-hidden="true"
    >
      <span className="leading-none" style={{ fontSize: "0.56em", letterSpacing: "-0.03em" }}>R</span>
    </div>
  );
}

export default function Logo({ size = "md", className, dark, markOnly }: LogoProps) {
  const s = sizes[size];
  const textCls = dark ? "text-sidebar-accent-foreground" : "text-foreground";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoIcon className={s.mark} />
      {!markOnly && (
        <span className={cn(s.text, "font-medium tracking-tight", textCls)}>
          ResumePreps
        </span>
      )}
    </div>
  );
}

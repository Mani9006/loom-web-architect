import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  dark?: boolean;
  /** When true, renders just the circled R mark without wordmark. */
  markOnly?: boolean;
}

const sizes = {
  sm: { mark: "w-6 h-6 text-xs", text: "text-sm" },
  md: { mark: "w-7 h-7 text-sm", text: "text-sm" },
  lg: { mark: "w-8 h-8 text-base", text: "text-base" },
  xl: { mark: "w-10 h-10 text-xl", text: "text-xl" },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md flex items-center justify-center font-semibold select-none",
        "bg-foreground text-background",
        className,
      )}
      aria-hidden="true"
    >
      <span className="leading-none">R</span>
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
        <span className={cn(s.text, "font-semibold", textCls)}>
          ResumePreps
        </span>
      )}
    </div>
  );
}

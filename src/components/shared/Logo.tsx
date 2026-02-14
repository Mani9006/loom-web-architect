import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  dark?: boolean;
}

const sizes = {
  sm: { icon: "w-7 h-7", text: "text-sm" },
  md: { icon: "w-9 h-9", text: "text-base" },
  lg: { icon: "w-12 h-12", text: "text-lg" },
  xl: { icon: "w-16 h-16", text: "text-2xl" },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Document shape */}
      <rect x="6" y="4" width="22" height="28" rx="3" stroke="currentColor" strokeWidth="2.5" fill="none" />
      {/* Lines on document */}
      <line x1="11" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="22" x2="17" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Arrow pointing up-right */}
      <path d="M22 26L32 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 15H33V22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ size = "md", className, dark }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn(s.icon, "shrink-0", dark ? "text-sidebar-accent-foreground" : "text-foreground")}>
        <LogoIcon className="w-full h-full" />
      </div>
      <span className={cn(
        s.text, "font-bold tracking-tight",
        dark ? "text-sidebar-accent-foreground" : "text-foreground"
      )}>
        Resume<span className="text-primary">Preps</span>
      </span>
    </div>
  );
}

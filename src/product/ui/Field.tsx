import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("rp-field", className)}>
      <span>{label}</span>
      {children}
      {hint && <span className="text-[11px] font-normal leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );
}

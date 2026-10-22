import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Something went wrong",
  body,
  action,
  className,
}: {
  title?: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rp-empty", className)}>
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

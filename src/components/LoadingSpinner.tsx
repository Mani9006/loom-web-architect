import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  className?: string;
  message?: string;
}

export function LoadingSpinner({ fullScreen, className, message }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        fullScreen && "min-h-screen bg-background",
        className
      )}
    >
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-muted" />
        <Loader2 className="w-12 h-12 text-primary animate-spin absolute inset-0" strokeWidth={2.5} />
      </div>
      {message && (
        <p className="text-sm text-muted-foreground font-medium animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}

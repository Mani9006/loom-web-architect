import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in", className)}>
      <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-5">
        <Icon className="w-8 h-8 text-primary/60" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{subtitle}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="rounded-2xl gap-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-rp-ink/10 bg-rp-paper shadow-[0_1px_0_hsl(var(--rp-ink)/0.04)]", className)}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-8 py-12 text-center">
      <h3 className="font-display text-[22px] italic text-rp-ink">{title}</h3>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-rp-ink-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-rp-paper-2", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-10 w-64" />
      <SkeletonBlock className="h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border border-rp-ink/15 bg-rp-paper px-4 py-2.5 text-[13px] font-medium text-rp-ink disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

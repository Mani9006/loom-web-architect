import { cn } from "@/lib/utils";

/**
 * Shared ElevenLabs-style page shell primitives.
 * Keeps spacing, type scale, and section rhythm consistent across all
 * authed pages regardless of which feature the page implements.
 */

export function PageShell({ children, className, wide = false }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn(
      "px-6 lg:px-10 pt-10 pb-16 mx-auto w-full",
      wide ? "max-w-[1400px]" : "max-w-[1200px]",
      className,
    )}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-6 mb-8", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[12px] font-medium text-muted-foreground mb-1.5">{eyebrow}</p>
        )}
        <h1 className="text-[28px] sm:text-[32px] font-bold text-foreground tracking-tight leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[14px] text-muted-foreground max-w-[64ch] leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, description, actions }: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h2 className="text-[17px] font-semibold text-foreground tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function TabBar({ tabs, active, onChange }: {
  tabs: Array<{ value: string; label: string }>;
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="border-b border-border mb-6">
      <div className="flex gap-1 -mb-px">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              "h-10 px-4 text-[13px] font-medium transition-colors relative",
              active === t.value
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {active === t.value && (
              <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Btn({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-4 text-[13px]",
        variant === "primary" && "bg-foreground text-background hover:bg-foreground/90",
        variant === "secondary" && "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]",
        variant === "ghost" && "text-foreground hover:bg-foreground/[0.06]",
        className,
      )}
    />
  );
}

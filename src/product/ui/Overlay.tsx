import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="rp-overlay" onClick={onClose} role="presentation">
      <aside
        className={cn("rp-drawer", className)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-[15px] font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="rp-overlay flex items-end justify-center p-4 sm:items-center" onClick={onClose} role="presentation">
      <div
        className={cn("rp-dialog", className)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="dialog-title" className="text-[15px] font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

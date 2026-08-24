import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ id: T; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cn("rp-seg flex-wrap", className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          data-active={value === option.id}
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count != null && <span className="ml-1 tabular-nums opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

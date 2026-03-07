import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { US_LOCATIONS } from "@/data/us-locations";

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  error?: boolean;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = "City, State or Remote",
  className,
  onKeyDown,
  error,
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filterLocations = useCallback((input: string) => {
    if (!input.trim()) {
      setFiltered([]);
      setOpen(false);
      return;
    }
    const lower = input.toLowerCase();
    const matches = US_LOCATIONS.filter((loc) => loc.toLowerCase().includes(lower)).slice(0, 20);
    setFiltered(matches);
    setOpen(matches.length > 0);
    setHighlightIndex(-1);
  }, []);

  useEffect(() => {
    filterLocations(value);
  }, [value, filterLocations]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const selectItem = (item: string) => {
    onChange(item);
    setOpen(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (open && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        return;
      }
      if (e.key === "Enter" && highlightIndex >= 0) {
        e.preventDefault();
        selectItem(filtered[highlightIndex]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      <Input
        placeholder={placeholder}
        className={cn("pl-10 h-11", error && "border-destructive", className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (value.trim()) filterLocations(value); }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto py-1"
        >
          {filtered.map((loc, idx) => (
            <li
              key={loc}
              onMouseDown={(e) => { e.preventDefault(); selectItem(loc); }}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors",
                idx === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/50"
              )}
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span>{loc}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

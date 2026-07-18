import type { ReactNode } from "react";
import { cleanJobDescription } from "@/lib/job-description";

export function JobDescription({ value, empty }: { value: string; empty?: ReactNode }) {
  const clean = cleanJobDescription(value);
  if (!clean) return empty ?? null;
  const lines = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-2.5 text-sm leading-6 text-foreground/80">
      {lines.map((line, index) => {
        const bullet = line.match(/^(?:[•·▪◦*-]|\d+[.)])\s*(.+)$/);
        if (bullet) {
          return (
            <div key={`${index}-${line.slice(0, 16)}`} className="flex items-start gap-2.5 pl-1">
              <span aria-hidden="true" className="mt-[0.65rem] size-1 shrink-0 rounded-full bg-foreground/50" />
              <p>{bullet[1]}</p>
            </div>
          );
        }
        const heading = line.length <= 72 && (/^[A-Z][A-Za-z0-9 &/+-]+:$/.test(line) || /^[A-Z0-9 &/+-]{4,}$/.test(line));
        if (heading) {
          return <h4 key={`${index}-${line}`} className="pt-2 text-sm font-semibold text-foreground">{line.replace(/:$/, "")}</h4>;
        }
        return <p key={`${index}-${line.slice(0, 16)}`}>{line}</p>;
      })}
    </div>
  );
}

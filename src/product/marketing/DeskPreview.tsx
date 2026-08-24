import { cn } from "@/lib/utils";

const MATCHES = [
  ["Staff Data Analyst", "Stripe · Remote US", "92"],
  ["Analytics Engineer", "Notion · NYC", "87"],
  ["Product Analyst", "Linear · Hybrid", "81"],
  ["Revenue Analyst", "Figma · SF", "78"],
  ["Data Analytics Lead", "Rippling · Remote US", "74"],
];

const APPS = [
  ["Queued", "Not submitted"],
  ["Filling", "Greenhouse"],
  ["Submitted", "Receipt on file"],
  ["Needs you", "Workday"],
];

export function DeskPreview({
  variant = "desk",
  className,
}: {
  variant?: "desk" | "receipt";
  className?: string;
}) {
  if (variant === "receipt") {
    return (
      <div className={cn("rp-panel-flush", className)}>
        <div className="flex h-9 items-center justify-between border-b border-border px-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Receipt</span>
          <span className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-primary">
            Submitted
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-border">
          {[
            ["Role", "Staff Data Analyst"],
            ["Company", "Stripe"],
            ["Portal", "Greenhouse"],
            ["Credit", "1 · on receipt"],
            ["State before", "Filling"],
            ["Worker", "task_8f2a · confirmed"],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-[12.5px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Queued is not submitted. Filling is not submitted. Only a portal receipt writes Submitted.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rp-panel-flush", className)}>
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-[3px] rounded-sm bg-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Desk</span>
        </div>
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        </div>
      </div>
      <div className="grid md:grid-cols-[1.15fr_0.85fr]">
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Top matches</p>
          <ul className="mt-2 space-y-1.5">
            {MATCHES.map(([title, meta, score]) => (
              <li
                key={title}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-[hsl(var(--rp-well))] px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-medium">{title}</p>
                  <p className="text-[12px] text-muted-foreground">{meta}</p>
                </div>
                <span className="font-mono text-[12px] text-primary">{score}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Applications</p>
          <div className="mt-2 space-y-1.5">
            {APPS.map(([status, note]) => (
              <div key={status} className="rounded-md border border-border bg-[hsl(var(--rp-well))] px-3 py-2">
                <p className="text-[13px] font-medium">{status}</p>
                <p className="text-[12px] text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
        What Submitted means: a Greenhouse, Lever, Ashby, or Workable receipt. Nothing else.
      </p>
    </div>
  );
}

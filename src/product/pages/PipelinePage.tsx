import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useApplications } from "@/product/hooks/useApplications";
import { StatusChip } from "@/product/components/StatusChip";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { csvEscape, downloadText, relativeTime } from "@/product/lib/format";
import { db } from "@/product/lib/table";
import type { BoardRow } from "@/lib/application-board";
import { PageHeader } from "@/product/components/PageHeader";
import { Dialog } from "@/product/ui/Overlay";
import { Field } from "@/product/ui/Field";

type Lane = "applied" | "ghosted" | "interviewing" | "rejected" | "offer";

const LANES: Array<{ id: Lane; label: string }> = [
  { id: "applied", label: "Applied" },
  { id: "ghosted", label: "Ghosted" },
  { id: "interviewing", label: "Interviewing" },
  { id: "rejected", label: "Rejected" },
  { id: "offer", label: "Offer" },
];

function laneFor(row: BoardRow): Lane {
  const note = `${row.status.key} ${row.status.detail}`.toLowerCase();
  if (note.includes("offer")) return "offer";
  if (note.includes("reject")) return "rejected";
  if (note.includes("interview")) return "interviewing";
  if (row.status.key === "submitted") {
    const days = (Date.now() - new Date(row.activityAt).getTime()) / 86400000;
    return days > 14 ? "ghosted" : "applied";
  }
  if (row.status.key === "failed" || row.status.key === "skipped") return "rejected";
  return "applied";
}

export default function PipelinePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rows, loading, reload } = useApplications();
  const [open, setOpen] = useState<BoardRow | null>(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ title: "", company: "", url: "" });

  const grouped = useMemo(() => {
    const map: Record<Lane, BoardRow[]> = { applied: [], ghosted: [], interviewing: [], rejected: [], offer: [] };
    for (const row of rows) map[laneFor(row)].push(row);
    return map;
  }, [rows]);

  const counts = LANES.map((lane) => ({ ...lane, count: grouped[lane.id].length }));

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader
        kicker="Pipeline"
        title="From applied to offer"
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rp-btn rp-btn-outline" onClick={() => exportCsv(rows)}>Export CSV</button>
            <label className="rp-btn rp-btn-outline cursor-pointer">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => void importCsv(e.target.files?.[0], user?.id, reload)} />
            </label>
            <button type="button" className="rp-btn rp-btn-primary" onClick={() => setManual(true)}>Add manual</button>
          </div>
        }
      />

      <section className="rp-panel px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {counts.map((lane, i) => (
            <div key={lane.id} className="flex items-center gap-2">
              <div className="min-w-[96px] rounded-md border border-border bg-muted/40 px-3 py-2 text-center">
                <p className="text-[20px] font-semibold tabular-nums tracking-tight">{lane.count}</p>
                <p className="text-[11px] text-muted-foreground">{lane.label}</p>
              </div>
              {i < counts.length - 1 && (
                <svg width="40" height="24" viewBox="0 0 40 24" className="text-primary/40">
                  <path d="M0 12 H28 L22 6 M28 12 L22 18" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {LANES.map((lane) => (
          <section key={lane.id} className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <p className="border-b border-border bg-[hsl(var(--rp-well))] px-3 py-2 text-[12px] font-semibold">
              {lane.label} <span className="tabular-nums text-muted-foreground">{grouped[lane.id].length}</span>
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {grouped[lane.id].map((row) => (
                <button key={row.draft.id} type="button" onClick={() => setOpen(row)} className="w-full rounded-md border border-border bg-background p-3 text-left hover:bg-muted/50">
                  <p className="text-[13px] font-medium">{row.title}</p>
                  <p className="text-[12px] text-muted-foreground">{row.company}</p>
                  <div className="mt-2"><StatusChip status={row.status.key} label={row.status.label} /></div>
                </button>
              ))}
              {grouped[lane.id].length === 0 && <p className="px-2 py-8 text-center text-[12px] text-muted-foreground">Empty</p>}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title || "Application"} subtitle={open ? `${open.company} · ${relativeTime(open.activityAt)}` : undefined}>
        {open && (
          <>
            <p className="text-[13px] text-muted-foreground">{open.status.detail}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="rp-btn rp-btn-primary" onClick={() => navigate(`/applications/${open.draft.id}`)}>Open packet</button>
              <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={manual} onClose={() => setManual(false)} title="Add manual application">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!user) return;
            const { error } = await db().from("tracked_jobs").insert({
              user_id: user.id,
              title: form.title,
              company: form.company,
              url: form.url,
              status: "Applied",
            });
            if (error) toast.error(error.message);
            else {
              toast.success("Manual application added");
              setManual(false);
              void reload();
            }
          }}
        >
          <Field label="Title"><input required className="rp-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Company"><input required className="rp-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="URL"><input className="rp-input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setManual(false)}>Cancel</button>
            <button type="submit" className="rp-btn rp-btn-primary">Save</button>
          </div>
        </form>
      </Dialog>
      {rows.length === 0 && <EmptyState title="Pipeline is empty" body="Apply a US role or add a manual card." />}
    </div>
  );
}

function exportCsv(rows: BoardRow[]) {
  const header = ["title", "company", "status", "updated"];
  const body = rows.map((row) => [row.title, row.company, row.status.label, row.activityAt].map(csvEscape).join(","));
  downloadText(`resumepreps-pipeline.csv`, [header.join(","), ...body].join("\n"));
}

async function importCsv(file: File | undefined, userId: string | undefined, reload: () => Promise<void>) {
  if (!file || !userId) return;
  const text = await file.text();
  const lines = text.split(/\r?\n/).slice(1).filter(Boolean);
  for (const line of lines.slice(0, 50)) {
    const [title, company, , url] = line.split(",").map((c) => c.replace(/^"|"$/g, ""));
    if (title && company) {
      await db().from("tracked_jobs").insert({ user_id: userId, title, company, url: url || null, status: "Applied" });
    }
  }
  toast.success("Imported rows (capped at 50)");
  await reload();
}

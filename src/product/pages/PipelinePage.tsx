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
    <div className="space-y-6">
      <PageHeader
        kicker="Pipeline"
        title="From applied to offer"
        action={
          <div className="flex gap-2">
            <button type="button" className="h-9 border border-border px-3 text-[13px]" onClick={() => exportCsv(rows)}>Export CSV</button>
            <label className="h-9 border border-border px-3 text-[13px] leading-9">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => void importCsv(e.target.files?.[0], user?.id, reload)} />
            </label>
            <button type="button" className="h-9 bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => setManual(true)}>Add manual</button>
          </div>
        }
      />

      <section className="border border-border p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Flow</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {counts.map((lane, i) => (
            <div key={lane.id} className="flex items-center gap-2">
              <div className="min-w-[88px] rounded-lg bg-muted px-3 py-2 text-center">
                <p className="text-[18px] font-semibold tabular-nums">{lane.count}</p>
                <p className="text-[11px] text-muted-foreground">{lane.label}</p>
              </div>
              {i < counts.length - 1 && (
                <svg width="48" height="24" viewBox="0 0 48 24" className="text-primary/40">
                  <path d="M0 12 H36 L28 4 M36 12 L28 20" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-5">
        {LANES.map((lane) => (
          <section key={lane.id} className="min-h-[320px] rounded-xl border border-border bg-card p-2">
            <p className="px-2 py-2 text-[12px] font-semibold">{lane.label} <span className="text-muted-foreground tabular-nums">{grouped[lane.id].length}</span></p>
            <div className="space-y-2">
              {grouped[lane.id].map((row) => (
                <button key={row.draft.id} type="button" onClick={() => setOpen(row)} className="w-full rounded-lg border border-border bg-background p-3 text-left">
                  <p className="text-[13px] font-medium">{row.title}</p>
                  <p className="text-[12px] text-muted-foreground">{row.company}</p>
                  <div className="mt-2"><StatusChip status={row.status.key} label={row.status.label} /></div>
                </button>
              ))}
              {grouped[lane.id].length === 0 && <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">Empty</p>}
            </div>
          </section>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold">{open.title}</h2>
            <p className="text-[13px] text-muted-foreground">{open.company} · {relativeTime(open.activityAt)}</p>
            <p className="mt-3 text-[13px]">{open.status.detail}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => navigate(`/applications/${open.draft.id}`)}>Open packet</button>
              <button type="button" className="h-9 px-3 text-[13px]" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {manual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setManual(false)}>
          <form
            className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
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
            <h2 className="text-[16px] font-semibold">Add manual application</h2>
            <input required className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input required className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <input className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="h-9 px-3 text-[13px]" onClick={() => setManual(false)}>Cancel</button>
              <button type="submit" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground">Save</button>
            </div>
          </form>
        </div>
      )}
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

import { useNavigate } from "react-router-dom";
import { StatusChip } from "@/product/components/StatusChip";
import { TableSkeleton } from "@/product/components/Skeleton";
import { EmptyState } from "@/product/components/EmptyState";
import { useApplications } from "@/product/hooks/useApplications";
import { PRODUCT_APP_TABS } from "@/product/lib/application-tabs";
import { relativeTime } from "@/product/lib/format";

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { counts, tab, setTab, paged, page, setPage, pageCount, loading } = useApplications();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 space-y-4">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Applications</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Every packet, with a status you can trust</h1>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {PRODUCT_APP_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`h-8 rounded-full px-3 text-[12px] ${tab === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {item.label} <span className="tabular-nums">{counts[item.id]}</span>
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? <div className="p-4"><TableSkeleton /></div> : paged.length === 0 ? (
          <EmptyState title="No applications in this tab" body="Apply from Home or Job matches. Submitted never appears without a worker receipt." />
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Resume</th>
                <th className="px-3 py-2 font-medium">Cover</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr key={row.draft.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => navigate(`/applications/${row.draft.id}`)}>
                  <td className="px-3 py-2.5 font-medium">{row.title}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.company}</td>
                  <td className="px-3 py-2.5"><StatusChip status={row.status.key} label={row.status.label} /></td>
                  <td className="px-3 py-2.5 capitalize text-muted-foreground">{row.resumeState}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.hasCoverLetter ? "Yes" : "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{relativeTime(row.activityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex justify-end gap-2 text-[12px]">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 rounded-md border border-border px-2 disabled:opacity-40">Prev</button>
        <span className="tabular-nums self-center text-muted-foreground">{page} / {pageCount}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="h-8 rounded-md border border-border px-2 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

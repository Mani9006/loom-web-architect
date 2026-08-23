import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilterBar } from "@/product/components/FilterBar";
import { MatchRing } from "@/product/components/MatchRing";
import { StatusChip } from "@/product/components/StatusChip";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton, TableSkeleton } from "@/product/components/Skeleton";
import { useMatches } from "@/product/hooks/useMatches";
import { useApplications } from "@/product/hooks/useApplications";
import { useApply } from "@/product/hooks/useApply";
import { EMPTY_FILTERS, type MatchFilters } from "@/product/lib/filters";
import { PRODUCT_APP_TABS, rowMatchesProductTab } from "@/product/lib/application-tabs";
import { relativeTime, workplaceLabel } from "@/product/lib/format";
import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, jobs, evaluations, filterJobs, pass } = useMatches();
  const { rows, counts, tab, setTab, paged, page, setPage, pageCount, loading: appsLoading } = useApplications();
  const { applyEvaluation, busyId } = useApply();
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_FILTERS);

  const top = useMemo(() => filterJobs(filters).slice(0, 5), [filterJobs, filters]);

  if (loading && appsLoading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 space-y-8">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Home</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">US matches, then receipts.</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Signed in as {user?.email}. Filters stay US-only. Batch apply hits the visible top set only.</p>
      </header>

      <FilterBar value={filters} onChange={setFilters} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Top matches</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-8 rounded-md border border-border bg-card px-3 text-[12px] font-medium"
              disabled={!top.length || Boolean(busyId)}
              onClick={() => {
                const first = top[0];
                if (first && evaluations[first.id]) void applyEvaluation(evaluations[first.id].id, first.applyUrl);
              }}
            >
              Apply visible top set
            </button>
            <button type="button" className="h-8 text-[12px] text-primary" onClick={() => navigate("/matches")}>All matches</button>
          </div>
        </div>
        {top.length === 0 ? (
          <EmptyState
            title="No US matches yet"
            body="Upload a resume, then refresh Job matches. We only score United States roles."
            action={<button type="button" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => navigate("/resume")}>Open My resume</button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {top.map((job) => {
              const evaluation = evaluations[job.id];
              return (
                <article key={job.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">{job.company}</p>
                      <h3 className="text-[14px] font-semibold leading-snug">{job.title}</h3>
                      <p className="mt-1 text-[12px] text-muted-foreground">{workplaceLabel(job.workplace)} · {job.location || "United States"}</p>
                    </div>
                    <MatchRing score={evaluation?.score ?? 0} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-[12px] text-muted-foreground">{evaluation?.summary || "Fit scored from your source resume. No invented history."}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="h-8 flex-1 rounded-md bg-primary text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                      disabled={!evaluation || busyId === evaluation.id}
                      onClick={() => evaluation && void applyEvaluation(evaluation.id, job.applyUrl)}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-md border border-border px-3 text-[12px]"
                      onClick={() => evaluation && void pass(evaluation.id)}
                    >
                      Pass
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Applications</h2>
          <p className="text-[12px] text-muted-foreground">{rows.length} total</p>
        </div>
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
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          {appsLoading ? <div className="p-4"><TableSkeleton /></div> : (
            <table className="w-full text-left text-[13px]">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {paged.filter((row) => rowMatchesProductTab(row, tab)).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Nothing in this tab.</td></tr>
                )}
                {paged.map((row) => (
                  <tr key={row.draft.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => navigate(`/applications/${row.draft.id}`)}>
                    <td className="px-3 py-2.5 font-medium">{row.title}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.company}</td>
                    <td className="px-3 py-2.5"><StatusChip status={row.status.key} label={row.status.label} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{relativeTime(row.activityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-[12px]">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 rounded-md border border-border px-2 disabled:opacity-40">Prev</button>
          <span className="tabular-nums text-muted-foreground">{page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="h-8 rounded-md border border-border px-2 disabled:opacity-40">Next</button>
        </div>
      </section>
    </div>
  );
}

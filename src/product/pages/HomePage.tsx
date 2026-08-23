import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FilterBar } from "@/product/components/FilterBar";
import { MatchRing } from "@/product/components/MatchRing";
import { StatusChip } from "@/product/components/StatusChip";
import { EmptyState } from "@/product/components/EmptyState";
import { PageHeader } from "@/product/components/PageHeader";
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
  const [params] = useSearchParams();
  const { loading, jobs, evaluations, filterJobs, pass } = useMatches();
  const { rows, counts, tab, setTab, paged, page, setPage, pageCount, loading: appsLoading } = useApplications();
  const { applyEvaluation, busyId } = useApply();
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_FILTERS);

  const top = useMemo(() => filterJobs(filters).slice(0, 5), [filterJobs, filters]);

  useEffect(() => {
    if (params.get("checkout") === "success") {
      toast.success("Plan unlocked. Credits are on your ledger.");
    }
  }, [params]);

  if (loading && appsLoading) return <PageSkeleton />;

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Home"
        title="US matches, then receipts."
        subtitle={`Signed in as ${user?.email}. Filters stay US-only. Apply hits one role unless you confirm more.`}
      />

      <FilterBar value={filters} onChange={setFilters} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Top matches</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-8 border border-border bg-background px-3 text-[12px] font-medium"
              disabled={!top.length || Boolean(busyId)}
              onClick={() => {
                const first = top[0];
                if (first && evaluations[first.id]) void applyEvaluation(evaluations[first.id].id, first.applyUrl);
              }}
            >
              Apply first visible
            </button>
            <button type="button" className="h-8 text-[12px] text-primary" onClick={() => navigate("/matches")}>All matches</button>
          </div>
        </div>
        {top.length === 0 ? (
          <EmptyState
            title="No US matches yet"
            body="Upload a resume, then refresh Job matches. We only score United States roles."
            action={<button type="button" className="h-9 bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => navigate("/resume")}>Open My resume</button>}
          />
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {top.map((job) => {
              const evaluation = evaluations[job.id];
              return (
                <article key={job.id} className="flex flex-wrap items-center gap-4 py-5">
                  <MatchRing score={evaluation?.score ?? 0} />
                  <div className="min-w-[220px] flex-1">
                    <p className="text-[11px] text-muted-foreground">{job.company}</p>
                    <h3 className="font-display text-xl leading-snug">{job.title}</h3>
                    <p className="mt-1 text-[13px] text-muted-foreground">{workplaceLabel(job.workplace)} · {job.location || "United States"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-9 bg-primary px-4 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                      disabled={!evaluation || busyId === evaluation.id}
                      onClick={() => evaluation && void applyEvaluation(evaluation.id, job.applyUrl)}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="h-9 border border-border px-3 text-[12px]"
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
              className={`h-8 px-3 text-[12px] ${tab === item.id ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
            >
              {item.label} <span className="tabular-nums">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-hidden border border-border">
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
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 border border-border px-2 disabled:opacity-40">Prev</button>
          <span className="tabular-nums text-muted-foreground">{page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="h-8 border border-border px-2 disabled:opacity-40">Next</button>
        </div>
      </section>
    </div>
  );
}

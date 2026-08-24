import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FilterBar } from "@/product/components/FilterBar";
import { MatchRing } from "@/product/components/MatchRing";
import { StatusChip } from "@/product/components/StatusChip";
import { EmptyState } from "@/product/components/EmptyState";
import { PageHeader } from "@/product/components/PageHeader";
import { PageSkeleton } from "@/product/components/Skeleton";
import { useMatches } from "@/product/hooks/useMatches";
import { useApplications } from "@/product/hooks/useApplications";
import { useApply } from "@/product/hooks/useApply";
import { EMPTY_FILTERS, type MatchFilters } from "@/product/lib/filters";
import { PRODUCT_APP_TABS, rowMatchesProductTab } from "@/product/lib/application-tabs";
import { relativeTime, workplaceLabel } from "@/product/lib/format";
import { useAuth } from "@/contexts/AuthContext";
import { Panel } from "@/product/ui/Panel";
import { DataTable, Pagination } from "@/product/ui/DataTable";
import { Segmented } from "@/product/ui/Segmented";

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loading, evaluations, filterJobs, pass } = useMatches();
  const { rows, counts, tab, setTab, paged, page, setPage, pageCount, loading: appsLoading } = useApplications();
  const { applyEvaluation, busyId } = useApply();
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_FILTERS);

  const top = useMemo(() => filterJobs(filters).slice(0, 6), [filterJobs, filters]);
  const visibleApps = paged.filter((row) => rowMatchesProductTab(row, tab));

  useEffect(() => {
    if (params.get("checkout") === "success") {
      toast.success("Plan unlocked. Credits are on your ledger.");
    }
  }, [params]);

  if (loading && appsLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Home"
        title="US matches, then receipts."
        subtitle={`Signed in as ${user?.email}. Filters stay US-only. Apply hits one role unless you confirm more.`}
      />

      <FilterBar value={filters} onChange={setFilters} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel
          title="Top matches"
          action={
            <>
              <button
                type="button"
                className="rp-btn rp-btn-outline rp-btn-sm"
                disabled={!top.length || Boolean(busyId)}
                onClick={() => {
                  const first = top[0];
                  if (first && evaluations[first.id]) void applyEvaluation(evaluations[first.id].id, first.applyUrl);
                }}
              >
                Apply first visible
              </button>
              <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => navigate("/matches")}>
                All matches
              </button>
            </>
          }
        >
          {top.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No US matches yet"
                body="Upload a resume, then refresh Job matches. We only score United States roles."
                action={
                  <button type="button" className="rp-btn rp-btn-primary" onClick={() => navigate("/resume")}>
                    Open My resume
                  </button>
                }
              />
            </div>
          ) : (
            <div>
              {top.map((job) => {
                const evaluation = evaluations[job.id];
                return (
                  <article key={job.id} className="rp-row">
                    <MatchRing score={evaluation?.score ?? 0} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">{job.company}</p>
                      <h3 className="truncate text-[14px] font-semibold tracking-tight">{job.title}</h3>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {workplaceLabel(job.workplace)} · {job.location || "United States"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        className="rp-btn rp-btn-primary"
                        disabled={!evaluation || busyId === evaluation.id}
                        onClick={() => evaluation && void applyEvaluation(evaluation.id, job.applyUrl)}
                      >
                        Apply
                      </button>
                      <button type="button" className="rp-btn rp-btn-outline" onClick={() => evaluation && void pass(evaluation.id)}>
                        Pass
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Applications"
          action={<span className="text-[12px] tabular-nums text-muted-foreground">{rows.length} total</span>}
        >
          <div className="px-3 pt-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={PRODUCT_APP_TABS.map((item) => ({ id: item.id, label: item.label, count: counts[item.id] }))}
            />
          </div>
          <DataTable
            columns={[
              { key: "role", header: "Role", cell: (row) => <span className="font-medium">{row.title}</span> },
              { key: "company", header: "Company", cell: (row) => row.company, hideOnMobile: true },
              { key: "status", header: "Status", cell: (row) => <StatusChip status={row.status.key} label={row.status.label} /> },
              { key: "updated", header: "Updated", cell: (row) => relativeTime(row.activityAt), hideOnMobile: true },
            ]}
            rows={visibleApps}
            rowKey={(row) => row.draft.id}
            onRowClick={(row) => navigate(`/applications/${row.draft.id}`)}
            loading={appsLoading}
            empty={<div className="p-4"><EmptyState title="Nothing in this tab" body="Apply from Home or Job matches. Submitted never appears without a worker receipt." /></div>}
          />
          <Pagination page={page} pageCount={pageCount} onPage={setPage} />
        </Panel>
      </div>
    </div>
  );
}

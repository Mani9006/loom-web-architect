import { useMemo, useState } from "react";
import { ExternalLink, Link2, X } from "lucide-react";
import { FilterBar } from "@/product/components/FilterBar";
import { MatchRing } from "@/product/components/MatchRing";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { StatusChip } from "@/product/components/StatusChip";
import { useMatches, type ProductJob } from "@/product/hooks/useMatches";
import { useApply } from "@/product/hooks/useApply";
import { EMPTY_FILTERS, type MatchFilters } from "@/product/lib/filters";
import { atsSupported, detectAts, relativeTime, workplaceLabel } from "@/product/lib/format";
import { PageHeader } from "@/product/components/PageHeader";

export default function MatchesPage() {
  const { loading, refreshing, jobs, evaluations, drafts, saved, refreshPipeline, pass, saveJob, filterJobs } = useMatches();
  const { applyEvaluation, applyUrl, busyId } = useApply();
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_FILTERS);
  const [drawer, setDrawer] = useState<ProductJob | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlForm, setUrlForm] = useState({ title: "", company: "", apply_url: "", description: "" });

  const list = useMemo(() => filterJobs(filters), [filterJobs, filters]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Job matches"
        title="Ranked US feed"
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setUrlOpen(true)} className="inline-flex h-9 items-center gap-1.5 border border-border bg-background px-3 text-[13px]">
              <Link2 className="h-3.5 w-3.5" /> Add URL
            </button>
            <button type="button" onClick={() => void refreshPipeline()} className="h-9 bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50" disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh matches"}
            </button>
          </div>
        }
      />

      <FilterBar value={filters} onChange={setFilters} />

      {list.length === 0 ? (
        <EmptyState title="No live US matches" body="Refresh after you upload a resume. We drop anything that is not a United States role." />
      ) : (
        <div className="space-y-2">
          {list.map((job) => {
            const evaluation = evaluations[job.id];
            const draft = evaluation ? drafts[evaluation.id] : undefined;
            const portal = detectAts(job.applyUrl);
            return (
              <article key={job.id} className="flex flex-wrap items-center gap-3 border-b border-border py-4">
                <MatchRing score={evaluation?.score ?? 0} />
                <div className="min-w-[220px] flex-1">
                  <p className="text-[11px] text-muted-foreground">{job.company} · {workplaceLabel(job.workplace)}</p>
                  <h2 className="text-[14px] font-semibold">{job.title}</h2>
                  <p className="text-[12px] text-muted-foreground">{job.location || "United States"} · {relativeTime(job.postedAt)}</p>
                </div>
                <StatusChip status={atsSupported(portal) ? "queued" : "needs_you"} label={atsSupported(portal) ? portal : `${portal} · needs you`} />
                {draft && <StatusChip status={draft.status} />}
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={`h-8 border px-2.5 text-[12px] ${saved.has(job.id) ? "border-primary text-primary" : "border-border"}`} onClick={() => void saveJob(job.id)}>
                    {saved.has(job.id) ? "Saved" : "Save"}
                  </button>
                  <button type="button" className="h-8 border border-border px-2.5 text-[12px]" onClick={() => setDrawer(job)}>Details</button>
                  <button
                    type="button"
                    className="h-8 bg-primary px-2.5 text-[12px] text-primary-foreground disabled:opacity-50"
                    disabled={!evaluation || busyId === evaluation.id}
                    onClick={() => evaluation && void applyEvaluation(evaluation.id, job.applyUrl)}
                  >
                    Apply
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDrawer(null)}>
          <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">{drawer.company}</p>
                <h2 className="text-[18px] font-semibold">{drawer.title}</h2>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-muted-foreground">
              <span>{drawer.location || "United States"}</span>
              <span>{workplaceLabel(drawer.workplace)}</span>
              <span>{detectAts(drawer.applyUrl)}</span>
              <span>{relativeTime(drawer.postedAt)}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <a href={drawer.applyUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-[13px] no-underline">
                <ExternalLink className="h-3.5 w-3.5" /> View original
              </a>
              <button type="button" className="h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => evaluations[drawer.id] && void pass(evaluations[drawer.id].id)}>
                Not interested
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground"
                onClick={() => evaluations[drawer.id] && void applyEvaluation(evaluations[drawer.id].id, drawer.applyUrl)}
              >
                Apply
              </button>
            </div>
            <div className="prose prose-sm mt-5 max-w-none text-[13px] text-foreground">
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-muted-foreground">{drawer.description || "No job description cached yet."}</pre>
            </div>
          </aside>
        </div>
      )}

      {urlOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setUrlOpen(false)}>
          <form
            className="w-full max-w-md space-y-3 border border-border bg-background p-5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void applyUrl(urlForm).then((id) => { if (id) setUrlOpen(false); });
            }}
          >
            <h2 className="text-[16px] font-semibold">Add a job URL</h2>
            <p className="text-[12px] text-muted-foreground">We fetch the JD and start apply if the ATS is supported. Otherwise the packet stays in Needs you.</p>
            <input required className="h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]" placeholder="https://boards.greenhouse.io/…" value={urlForm.apply_url} onChange={(e) => setUrlForm({ ...urlForm, apply_url: e.target.value })} />
            <input className="h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]" placeholder="Title" value={urlForm.title} onChange={(e) => setUrlForm({ ...urlForm, title: e.target.value })} />
            <input className="h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]" placeholder="Company" value={urlForm.company} onChange={(e) => setUrlForm({ ...urlForm, company: e.target.value })} />
            <textarea className="min-h-[100px] w-full rounded-md border border-input bg-background p-3 text-[13px]" placeholder="Paste JD if the fetch needs a fallback" value={urlForm.description} onChange={(e) => setUrlForm({ ...urlForm, description: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="h-9 px-3 text-[13px]" onClick={() => setUrlOpen(false)}>Cancel</button>
              <button type="submit" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" disabled={busyId === "url"}>Fetch + apply</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

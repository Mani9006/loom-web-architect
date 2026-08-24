import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
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
import { Drawer, Dialog } from "@/product/ui/Overlay";
import { Field } from "@/product/ui/Field";

export default function MatchesPage() {
  const { loading, refreshing, evaluations, drafts, saved, refreshPipeline, pass, saveJob, filterJobs } = useMatches();
  const { applyEvaluation, applyUrl, busyId } = useApply();
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<ProductJob | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlForm, setUrlForm] = useState({ title: "", company: "", apply_url: "", description: "" });

  const [isXl, setIsXl] = useState(false);
  const list = useMemo(() => filterJobs(filters), [filterJobs, filters]);
  const active = selected && list.some((job) => job.id === selected.id) ? selected : list[0] ?? null;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsXl(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader
        kicker="Job matches"
        title="Ranked US feed"
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setUrlOpen(true)} className="rp-btn rp-btn-outline">
              <Link2 /> Add URL
            </button>
            <button type="button" onClick={() => void refreshPipeline()} className="rp-btn rp-btn-primary" disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh matches"}
            </button>
          </div>
        }
      />

      <FilterBar value={filters} onChange={setFilters} />

      {list.length === 0 ? (
        <EmptyState title="No live US matches" body="Refresh after you upload a resume. We drop anything that is not a United States role." />
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border border-border shadow-sm xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.map((job) => {
              const evaluation = evaluations[job.id];
              const draft = evaluation ? drafts[evaluation.id] : undefined;
              const portal = detectAts(job.applyUrl);
              const isActive = active?.id === job.id;
              return (
                <article
                  key={job.id}
                  className={`rp-row cursor-pointer ${isActive ? "bg-muted/60" : ""}`}
                  onClick={() => setSelected(job)}
                >
                  <MatchRing score={evaluation?.score ?? 0} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">{job.company} · {workplaceLabel(job.workplace)}</p>
                    <h2 className="truncate text-[13.5px] font-semibold">{job.title}</h2>
                    <p className="text-[12px] text-muted-foreground">{job.location || "United States"} · {relativeTime(job.postedAt)}</p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                    <StatusChip status={atsSupported(portal) ? "queued" : "needs_you"} label={atsSupported(portal) ? portal : `${portal} · needs you`} />
                    {draft && <StatusChip status={draft.status} />}
                  </div>
                </article>
              );
            })}
          </div>
          {active && (
            <MatchDetail
              job={active}
              className="hidden border-l border-border xl:flex"
              evaluationId={evaluations[active.id]?.id}
              apply={() => evaluations[active.id] && void applyEvaluation(evaluations[active.id].id, active.applyUrl)}
              pass={() => evaluations[active.id] && void pass(evaluations[active.id].id)}
              save={() => void saveJob(active.id)}
              saved={saved.has(active.id)}
              busy={busyId === evaluations[active.id]?.id}
            />
          )}
        </div>
      )}

      <Drawer
        open={Boolean(selected) && !isXl}
        onClose={() => setSelected(null)}
        title={selected?.title || "Match"}
        subtitle={selected?.company}
        footer={
          selected && (
            <>
              <button type="button" className="rp-btn rp-btn-outline" onClick={() => evaluations[selected.id] && void pass(evaluations[selected.id].id)}>
                Not interested
              </button>
              <button
                type="button"
                className="rp-btn rp-btn-primary"
                disabled={!evaluations[selected.id] || busyId === evaluations[selected.id]?.id}
                onClick={() => evaluations[selected.id] && void applyEvaluation(evaluations[selected.id].id, selected.applyUrl)}
              >
                Apply
              </button>
            </>
          )
        }
      >
        {selected && <MatchBody job={selected} saved={saved.has(selected.id)} onSave={() => void saveJob(selected.id)} />}
      </Drawer>

      <Dialog
        open={urlOpen}
        onClose={() => setUrlOpen(false)}
        title="Add a job URL"
        subtitle="We fetch the JD and start apply if the ATS is supported. Otherwise the packet stays in Needs you."
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void applyUrl(urlForm).then((id) => { if (id) setUrlOpen(false); });
          }}
        >
          <Field label="Apply URL">
            <input required className="rp-input" placeholder="https://boards.greenhouse.io/…" value={urlForm.apply_url} onChange={(e) => setUrlForm({ ...urlForm, apply_url: e.target.value })} />
          </Field>
          <Field label="Title">
            <input className="rp-input" value={urlForm.title} onChange={(e) => setUrlForm({ ...urlForm, title: e.target.value })} />
          </Field>
          <Field label="Company">
            <input className="rp-input" value={urlForm.company} onChange={(e) => setUrlForm({ ...urlForm, company: e.target.value })} />
          </Field>
          <Field label="Job description fallback">
            <textarea className="rp-textarea" value={urlForm.description} onChange={(e) => setUrlForm({ ...urlForm, description: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setUrlOpen(false)}>Cancel</button>
            <button type="submit" className="rp-btn rp-btn-primary" disabled={busyId === "url"}>Fetch + apply</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function MatchDetail({
  job,
  className,
  apply,
  pass,
  save,
  saved,
  busy,
}: {
  job: ProductJob;
  className?: string;
  evaluationId?: string;
  apply: () => void;
  pass: () => void;
  save: () => void;
  saved: boolean;
  busy: boolean;
}) {
  return (
    <aside className={`flex min-h-[420px] flex-col bg-card ${className || ""}`}>
      <div className="border-b border-border px-5 py-4">
        <p className="text-[11px] text-muted-foreground">{job.company}</p>
        <h2 className="mt-1 text-[16px] font-semibold tracking-tight">{job.title}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rp-btn rp-btn-primary" disabled={busy} onClick={apply}>Apply</button>
          <button type="button" className="rp-btn rp-btn-outline" onClick={pass}>Not interested</button>
          <button type="button" className={`rp-btn ${saved ? "rp-btn-outline text-primary" : "rp-btn-ghost"}`} onClick={save}>
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <MatchBody job={job} saved={saved} onSave={save} />
      </div>
    </aside>
  );
}

function MatchBody({ job, saved, onSave }: { job: ProductJob; saved: boolean; onSave: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
        <span>{job.location || "United States"}</span>
        <span>{workplaceLabel(job.workplace)}</span>
        <span>{detectAts(job.applyUrl)}</span>
        <span>{relativeTime(job.postedAt)}</span>
      </div>
      <a href={job.applyUrl} target="_blank" rel="noreferrer" className="rp-btn rp-btn-outline no-underline">
        <ExternalLink /> View original
      </a>
      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-muted-foreground">{job.description || "No job description cached yet."}</pre>
      <button type="button" className="rp-btn rp-btn-ghost xl:hidden" onClick={onSave}>{saved ? "Saved" : "Save"}</button>
    </div>
  );
}

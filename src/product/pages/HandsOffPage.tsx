import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useHandsOff, type ApplyRecipe, type HandsOffState } from "@/product/hooks/useHandsOff";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { StatusChip } from "@/product/components/StatusChip";
import { invokeFunction } from "@/product/lib/table";
import { relativeTime } from "@/product/lib/format";
import { PageHeader } from "@/product/components/PageHeader";
import { Field } from "@/product/ui/Field";
import { Panel } from "@/product/ui/Panel";

export default function HandsOffPage() {
  const { state, setState, recipes, setRecipes, runs, resumes, loading, saving, persist } = useHandsOff();
  const [params] = useSearchParams();
  const [preview, setPreview] = useState<HandsOffState | null>(null);
  const [tuner, setTuner] = useState("");
  const [confirmEnable, setConfirmEnable] = useState(params.get("confirm") === "1");

  const draft = preview ?? state;

  async function save(next = draft, enable = next.enabled) {
    const ok = await persist({ ...next, enabled: enable }, recipes, enable ? confirmEnable || state.enabled : true);
    if (!ok && enable) {
      setConfirmEnable(true);
      toast.message("Confirm required", { description: "Hands-off apply will not turn on until you confirm." });
      return;
    }
    setPreview(null);
    toast.success(enable ? "Hands-off apply saved" : "Hands-off settings saved (disabled)");
  }

  async function runTuner() {
    const result = await invokeFunction<{ reply?: string; preview?: Partial<HandsOffState> }>("ops-assistant", {
      messages: [{ role: "user", content: `Preview hands-off settings only. Do not save. Request: ${tuner}` }],
    });
    const next = { ...draft, ...(result.data?.preview || guessPreview(tuner, draft)) };
    setPreview(next);
    toast.message("Preview only", { description: "Nothing saved until you approve." });
  }

  function patch(partial: Partial<HandsOffState>) {
    const next = { ...draft, ...partial };
    if (preview) setPreview(next);
    else setState(next);
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Hands-off apply" title="One daily cap. Many recipes. No silent enable." />

      <Panel>
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[14px] font-semibold">Enable hands-off apply</p>
            <p className="text-[12px] text-muted-foreground">Requires an explicit confirm. US roles only. Submitted still needs a receipt.</p>
          </div>
          <button
            type="button"
            className={`h-7 w-12 rounded-full transition ${draft.enabled ? "bg-primary" : "bg-muted"}`}
            onClick={() => {
              if (!draft.enabled) {
                setConfirmEnable(true);
                setState({ ...draft, enabled: false });
                toast.message("Confirm below to enable.");
              } else {
                void save({ ...draft, enabled: false }, false);
              }
            }}
            aria-label="Enable toggle"
          >
            <span className={`block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow-sm transition ${draft.enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </button>
        </div>
      </Panel>

      {confirmEnable && !state.enabled && (
        <div className="rounded-lg border border-primary/40 bg-primary/8 p-4">
          <p className="text-[13px] font-medium">Confirm enable</p>
          <p className="mt-1 text-[12px] text-muted-foreground">This will start the hunter on a shared daily cap. Review-before-submit is {draft.reviewBeforeSubmit ? "on" : "off"}.</p>
          <button type="button" className="rp-btn rp-btn-primary mt-3" onClick={() => { setConfirmEnable(true); void save({ ...draft, enabled: true }, true); }}>
            Yes, enable hands-off apply
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Panel title="Policy">
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <Field label="Daily cap (shared)">
              <input type="number" min={0} max={75} className="rp-input" value={draft.dailyCap} onChange={(e) => patch({ dailyCap: Number(e.target.value) })} />
            </Field>
            <Field label="Resume profile">
              <select className="rp-select" value={draft.resumeId ?? ""} onChange={(e) => patch({ resumeId: e.target.value || null })}>
                <option value="">Primary resume</option>
                {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
              </select>
            </Field>
            <Field label="Min match quality">
              <input type="number" min={50} max={99} className="rp-input" value={draft.minMatch} onChange={(e) => patch({ minMatch: Number(e.target.value) })} />
            </Field>
            <Field label="Optimization">
              <select className="rp-select" value={draft.optimization} onChange={(e) => patch({ optimization: e.target.value as HandsOffState["optimization"] })}>
                <option value="off">Off</option>
                <option value="honest">Honest</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[13px] md:col-span-2">
              <input type="checkbox" checked={draft.reviewBeforeSubmit} onChange={(e) => patch({ reviewBeforeSubmit: e.target.checked })} />
              Review before submit
            </label>
            <label className="flex items-center gap-2 text-[13px] md:col-span-2">
              <input type="checkbox" checked={draft.coverAuto} onChange={(e) => patch({ coverAuto: e.target.checked })} />
              Cover letter auto
            </label>
            <Field label="Standing exclude-only instructions" className="md:col-span-2">
              <textarea className="rp-textarea" value={draft.excludeInstructions} onChange={(e) => patch({ excludeInstructions: e.target.value })} placeholder="Never apply to staffing firms. Skip roles that require clearance." />
            </Field>
            <Field label="Filters" className="md:col-span-2">
              <input className="rp-input" value={draft.filters} onChange={(e) => patch({ filters: e.target.value })} placeholder="Remote US, data analytics, no internships" />
            </Field>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel
            title="Search recipes"
            action={<button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setRecipes([...recipes, { id: crypto.randomUUID(), name: "New recipe", query: "", enabled: true }])}>Add recipe</button>}
          >
            <p className="border-b border-border px-4 py-2 text-[12px] text-muted-foreground">Recipes share one daily cap.</p>
            <div className="space-y-2 p-3">
              {recipes.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} onChange={(next) => setRecipes(recipes.map((r) => r.id === next.id ? next : r))} />
              ))}
            </div>
          </Panel>

          <Panel title="AI tuner">
            <div className="space-y-3 p-4">
              <p className="text-[12px] text-muted-foreground">Preview first. Save only after you approve.</p>
              <div className="flex gap-2">
                <input className="rp-input" value={tuner} onChange={(e) => setTuner(e.target.value)} placeholder="Lower the cap to 10 and exclude FAANG" />
                <button type="button" className="rp-btn rp-btn-outline" onClick={() => void runTuner()}>Preview</button>
              </div>
              {preview && (
                <div className="rounded-md bg-muted p-3 text-[12px]">
                  Preview cap {preview.dailyCap}, min match {preview.minMatch}, review {preview.reviewBeforeSubmit ? "on" : "off"}.
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rp-btn rp-btn-primary rp-btn-sm" onClick={() => void save(preview, preview.enabled)}>Approve & save</button>
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setPreview(null)}>Discard</button>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <button type="button" disabled={saving} className="rp-btn rp-btn-primary" onClick={() => void save(draft, false)}>Save settings</button>

      <Panel title="Run history">
        {runs.length === 0 ? (
          <div className="p-4"><EmptyState title="No runs yet" body="Enable hands-off after confirm to start a history. Hunter typically ticks every few hours." /></div>
        ) : (
          <ul>
            {runs.map((run) => (
              <li key={run.id} className="rp-row text-[13px]">
                <span className="flex-1">{run.summary || "Hunter pass"}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <StatusChip status={run.status} />
                  {relativeTime(run.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function RecipeRow({ recipe, onChange }: { recipe: ApplyRecipe; onChange: (next: ApplyRecipe) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
      <Field label="Name" className="min-w-[140px] flex-1">
        <input className="rp-input" value={recipe.name} onChange={(e) => onChange({ ...recipe, name: e.target.value })} />
      </Field>
      <Field label="Query" className="min-w-[200px] flex-1">
        <input className="rp-input" value={recipe.query} onChange={(e) => onChange({ ...recipe, query: e.target.value })} placeholder="US remote analytics" />
      </Field>
      <label className="flex h-9 items-center gap-2 text-[12px]"><input type="checkbox" checked={recipe.enabled} onChange={(e) => onChange({ ...recipe, enabled: e.target.checked })} /> On</label>
    </div>
  );
}

function guessPreview(text: string, current: HandsOffState): Partial<HandsOffState> {
  const cap = text.match(/cap(?: to)? (\d+)/i);
  const min = text.match(/min(?: match)? (\d+)/i);
  return {
    dailyCap: cap ? Number(cap[1]) : current.dailyCap,
    minMatch: min ? Number(min[1]) : current.minMatch,
    excludeInstructions: /exclude|never/i.test(text) ? `${current.excludeInstructions}\n${text}`.trim() : current.excludeInstructions,
  };
}

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

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-8">
      <PageHeader kicker="Hands-off apply" title="One daily cap. Many recipes. No silent enable." />

      <section className="flex items-center justify-between border border-border p-5">
        <div>
          <p className="text-[14px] font-semibold">Enable hands-off apply</p>
          <p className="text-[12px] text-muted-foreground">Requires an explicit confirm. US roles only. Submitted still needs a receipt.</p>
        </div>
        <button
          type="button"
          className={`h-8 w-14 rounded-full ${draft.enabled ? "bg-primary" : "bg-muted"}`}
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
          <span className={`block h-7 w-7 translate-y-0.5 rounded-full bg-white shadow transition ${draft.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </section>

      {confirmEnable && !state.enabled && (
        <div className="border border-primary/40 bg-primary/5 p-5">
          <p className="text-[13px] font-medium">Confirm enable</p>
          <p className="mt-1 text-[12px] text-muted-foreground">This will start the hunter on a shared daily cap. Review-before-submit is {draft.reviewBeforeSubmit ? "on" : "off"}.</p>
          <button type="button" className="mt-3 h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => { setConfirmEnable(true); void save({ ...draft, enabled: true }, true); }}>
            Yes, enable hands-off apply
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Daily cap (shared)">
          <input type="number" min={0} max={75} className="h-10 w-full rounded-md border border-input px-3 text-[13px]" value={draft.dailyCap} onChange={(e) => patch({ dailyCap: Number(e.target.value) })} />
        </Field>
        <Field label="Resume profile">
          <select className="h-10 w-full rounded-md border border-input px-3 text-[13px]" value={draft.resumeId ?? ""} onChange={(e) => patch({ resumeId: e.target.value || null })}>
            <option value="">Primary resume</option>
            {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
          </select>
        </Field>
        <Field label="Min match quality">
          <input type="number" min={50} max={99} className="h-10 w-full rounded-md border border-input px-3 text-[13px]" value={draft.minMatch} onChange={(e) => patch({ minMatch: Number(e.target.value) })} />
        </Field>
        <Field label="Optimization">
          <select className="h-10 w-full rounded-md border border-input px-3 text-[13px]" value={draft.optimization} onChange={(e) => patch({ optimization: e.target.value as HandsOffState["optimization"] })}>
            <option value="off">Off</option>
            <option value="honest">Honest</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={draft.reviewBeforeSubmit} onChange={(e) => patch({ reviewBeforeSubmit: e.target.checked })} />
        Review before submit
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={draft.coverAuto} onChange={(e) => patch({ coverAuto: e.target.checked })} />
        Cover letter auto
      </label>

      <Field label="Standing exclude-only instructions">
        <textarea className="min-h-[80px] w-full rounded-md border border-input p-3 text-[13px]" value={draft.excludeInstructions} onChange={(e) => patch({ excludeInstructions: e.target.value })} placeholder="Never apply to staffing firms. Skip roles that require clearance." />
      </Field>
      <Field label="Filters">
        <input className="h-10 w-full rounded-md border border-input px-3 text-[13px]" value={draft.filters} onChange={(e) => patch({ filters: e.target.value })} placeholder="Remote US, data analytics, no internships" />
      </Field>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Search recipes</h2>
          <button type="button" className="text-[12px] text-primary" onClick={() => setRecipes([...recipes, { id: crypto.randomUUID(), name: "New recipe", query: "", enabled: true }])}>Add recipe</button>
        </div>
        <p className="text-[12px] text-muted-foreground">Recipes share one daily cap.</p>
        {recipes.map((recipe) => (
          <RecipeRow key={recipe.id} recipe={recipe} onChange={(next) => setRecipes(recipes.map((r) => r.id === next.id ? next : r))} />
        ))}
      </section>

      <section className="border border-border p-5">
        <h2 className="text-[15px] font-semibold">AI tuner</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">Preview first. Save only after you approve.</p>
        <div className="mt-3 flex gap-2">
          <input className="h-10 flex-1 rounded-md border border-input px-3 text-[13px]" value={tuner} onChange={(e) => setTuner(e.target.value)} placeholder="Lower the cap to 10 and exclude FAANG" />
          <button type="button" className="h-10 rounded-md border border-border px-3 text-[13px]" onClick={() => void runTuner()}>Preview</button>
        </div>
        {preview && (
          <div className="mt-3 rounded-lg bg-muted p-3 text-[12px]">
            Preview cap {preview.dailyCap}, min match {preview.minMatch}, review {preview.reviewBeforeSubmit ? "on" : "off"}.
            <div className="mt-2 flex gap-2">
              <button type="button" className="h-8 rounded-md bg-primary px-3 text-primary-foreground" onClick={() => void save(preview, preview.enabled)}>Approve & save</button>
              <button type="button" className="h-8 px-3" onClick={() => setPreview(null)}>Discard</button>
            </div>
          </div>
        )}
      </section>

      <div className="flex gap-2">
        <button type="button" disabled={saving} className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => void save(draft, false)}>Save settings</button>
      </div>

      <section>
        <h2 className="text-[15px] font-semibold">Run history</h2>
        <p className="text-[12px] text-muted-foreground">Hunter typically ticks every few hours.</p>
        {runs.length === 0 ? <EmptyState className="mt-3" title="No runs yet" body="Enable hands-off after confirm to start a history." /> : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <span>{run.summary || "Hunter pass"}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <StatusChip status={run.status} />
                  {relativeTime(run.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  function patch(partial: Partial<HandsOffState>) {
    const next = { ...draft, ...partial };
    if (preview) setPreview(next);
    else setState(next);
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-medium">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function RecipeRow({ recipe, onChange }: { recipe: ApplyRecipe; onChange: (next: ApplyRecipe) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <input className="h-9 flex-1 rounded-md border border-input px-2 text-[13px]" value={recipe.name} onChange={(e) => onChange({ ...recipe, name: e.target.value })} />
      <input className="h-9 min-w-[200px] flex-1 rounded-md border border-input px-2 text-[13px]" value={recipe.query} onChange={(e) => onChange({ ...recipe, query: e.target.value })} placeholder="US remote analytics" />
      <label className="text-[12px]"><input type="checkbox" checked={recipe.enabled} onChange={(e) => onChange({ ...recipe, enabled: e.target.checked })} /> On</label>
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

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { CreditBalance } from "@/components/apply/CreditBalance";
import { EmptyState, GhostButton, Panel, PrimaryButton } from "@/components/brand/ui";
import { useSubscription } from "@/components/SubscriptionGate";
import { useAuth } from "@/contexts/AuthContext";
import { useApplyCredits } from "@/hooks/use-apply-credits";
import { clampDailyApplyCap, creditPlanLabel, resolveCreditPlan } from "@/lib/apply-credits";
import { emptyRecipe, type SearchRecipe } from "@/lib/search-recipes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Prefs {
  agent_enabled: boolean;
  auto_apply_enabled: boolean;
  auto_apply_min_fit_score: number;
  daily_apply_cap: number;
  hands_off_cadence: "off" | "hourly" | "daily";
  standing_instructions: string;
  cover_letter_auto: boolean;
  review_ats_pause: boolean;
  tailoring_mode: "off" | "honest" | "aggressive";
}

const defaults: Prefs = {
  agent_enabled: false,
  auto_apply_enabled: false,
  auto_apply_min_fit_score: 82,
  daily_apply_cap: 10,
  hands_off_cadence: "hourly",
  standing_instructions: "",
  cover_letter_auto: true,
  review_ats_pause: true,
  tailoring_mode: "honest",
};

export default function AgentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { plan, hasAutoApply } = useSubscription();
  const creditPlan = resolveCreditPlan(plan);
  const { snapshot: credits } = useApplyCredits();
  const [prefs, setPrefs] = useState(defaults);
  const [recipes, setRecipes] = useState<SearchRecipe[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; status: string; summary: string | null; started_at: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [prefRes, recipeRes, runRes] = await Promise.all([
      supabase.from("user_job_prefs").select("agent_enabled,auto_apply_enabled,auto_apply_min_fit_score,daily_apply_cap,hands_off_cadence,standing_instructions,cover_letter_auto,review_ats_pause,tailoring_mode").eq("user_id", user.id).maybeSingle(),
      (supabase.from("search_recipes" as never) as never as { select: (c: string) => { eq: (a: string, b: string) => { order: (c: string) => Promise<{ data: SearchRecipe[] | null }> } } }).select("id,name,enabled,target_roles,locations,min_fit_score,exclude_keywords,sort_order").eq("user_id", user.id).order("sort_order"),
      supabase.from("agent_runs").select("id,status,summary,started_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(8),
    ]);
    if (prefRes.data) {
      const row = prefRes.data as Partial<Prefs> & { tailoring_mode?: string };
      setPrefs({
        ...defaults,
        ...row,
        tailoring_mode: row.tailoring_mode === "coverage_boost" || row.tailoring_mode === "aggressive" ? "aggressive" : row.tailoring_mode === "off" || row.tailoring_mode === "evidence_only" ? (row.tailoring_mode === "off" ? "off" : "honest") : "honest",
        hands_off_cadence: row.hands_off_cadence === "off" || row.hands_off_cadence === "daily" ? row.hands_off_cadence : "hourly",
      });
    }
    setRecipes(recipeRes.data || []);
    setRuns((runRes.data || []) as typeof runs);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const running = prefs.agent_enabled && hasAutoApply;

  const toggle = async () => {
    if (!hasAutoApply) {
      navigate("/plans");
      return;
    }
    setBusy(true);
    const action = running ? "stop" : "start";
    const { error } = await supabase.functions.invoke("career-agent-control", { body: { action, daily_apply_cap: prefs.daily_apply_cap } });
    setBusy(false);
    if (error) {
      toast.error("Hands-off could not update.");
      return;
    }
    setPrefs((current) => ({ ...current, agent_enabled: !running, auto_apply_enabled: !running }));
    toast.success(running ? "Kill switch on. In-flight hands-off jobs cancel." : "Hands-off is on. Recipes share one daily cap.");
  };

  const save = async () => {
    if (!user || !hasAutoApply) return;
    setSaving(true);
    await supabase.from("user_job_prefs").upsert({
      user_id: user.id,
      agent_enabled: prefs.agent_enabled,
      auto_apply_enabled: prefs.auto_apply_enabled,
      auto_apply_min_fit_score: prefs.auto_apply_min_fit_score,
      daily_apply_cap: clampDailyApplyCap(prefs.daily_apply_cap, creditPlan) || 1,
      hands_off_cadence: prefs.hands_off_cadence,
      standing_instructions: prefs.standing_instructions,
      cover_letter_auto: prefs.cover_letter_auto,
      review_ats_pause: prefs.review_ats_pause,
      tailoring_mode: prefs.tailoring_mode === "aggressive" ? "coverage_boost" : "evidence_only",
    }, { onConflict: "user_id" });
    for (const recipe of recipes) {
      await (supabase.from("search_recipes" as never) as never as { upsert: (v: unknown) => Promise<unknown> }).upsert({ ...recipe, user_id: user.id });
    }
    setSaving(false);
    toast.success("Hands-off settings saved.");
  };

  const addRecipe = () => {
    setRecipes((current) => [...current, { id: crypto.randomUUID(), ...emptyRecipe(current.length + 1) }]);
  };

  return (
    <div>
      <PageHeader
        title="Hands-off apply"
        status={`${creditPlanLabel(plan)} · ${running ? "running" : "stopped"}`}
        description="Search recipes share one daily cap. Best matches first. Standing instructions are exclude-only. Review-before-submit pauses on ATSes that support it."
        action={<CreditBalance snapshot={credits} />}
      />

      <Panel className="mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">{running ? "Running" : "Stopped"}</p>
            <h2 className="mt-1 font-display text-[28px] italic">{running ? "Scheduler is enqueueing" : "Start the scheduler"}</h2>
            <p className="mt-2 max-w-xl text-[14px] text-rp-ink-2">Cadence {prefs.hands_off_cadence}. Floor {prefs.auto_apply_min_fit_score}%. Cap {prefs.daily_apply_cap}/day. Apply on Job matches does not require this to be on.</p>
          </div>
          <PrimaryButton onClick={() => void toggle()} disabled={busy} className={running ? "bg-rose-700" : undefined}>
            {busy ? "Updating…" : running ? "Stop applying" : "Start applying"}
          </PrimaryButton>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="font-display text-[22px] italic">Controls</h3>
          <label className="mt-4 block text-[13px]">Daily cap
            <input type="number" min={1} max={40} value={prefs.daily_apply_cap} onChange={(e) => setPrefs((c) => ({ ...c, daily_apply_cap: Number(e.target.value) }))} className="mt-1 h-10 w-full rounded-md border border-rp-ink/15 bg-rp-canvas px-3" />
          </label>
          <label className="mt-3 block text-[13px]">Minimum match quality
            <input type="number" min={50} max={100} value={prefs.auto_apply_min_fit_score} onChange={(e) => setPrefs((c) => ({ ...c, auto_apply_min_fit_score: Number(e.target.value) }))} className="mt-1 h-10 w-full rounded-md border border-rp-ink/15 bg-rp-canvas px-3" />
          </label>
          <label className="mt-3 block text-[13px]">Cadence
            <select value={prefs.hands_off_cadence} onChange={(e) => setPrefs((c) => ({ ...c, hands_off_cadence: e.target.value as Prefs["hands_off_cadence"] }))} className="mt-1 h-10 w-full rounded-md border border-rp-ink/15 bg-rp-canvas px-3">
              <option value="hourly">Every few hours</option>
              <option value="daily">Once a day</option>
              <option value="off">Scheduler off</option>
            </select>
          </label>
          <label className="mt-3 block text-[13px]">Resume optimization
            <select value={prefs.tailoring_mode} onChange={(e) => setPrefs((c) => ({ ...c, tailoring_mode: e.target.value as Prefs["tailoring_mode"] }))} className="mt-1 h-10 w-full rounded-md border border-rp-ink/15 bg-rp-canvas px-3">
              <option value="off">Off</option>
              <option value="honest">Honest</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>
          <label className="mt-4 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={prefs.cover_letter_auto} onChange={(e) => setPrefs((c) => ({ ...c, cover_letter_auto: e.target.checked }))} />
            Write a cover letter when the form asks
          </label>
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={prefs.review_ats_pause} onChange={(e) => setPrefs((c) => ({ ...c, review_ats_pause: e.target.checked }))} />
            Review-before-submit on ATSes that pause
          </label>
          <label className="mt-3 block text-[13px]">Standing instructions (exclude only)
            <textarea value={prefs.standing_instructions} onChange={(e) => setPrefs((c) => ({ ...c, standing_instructions: e.target.value }))} placeholder="staffing agencies, crypto, companies named Acme" className="mt-1 min-h-24 w-full rounded-md border border-rp-ink/15 bg-rp-canvas px-3 py-2" />
          </label>
          <PrimaryButton className="mt-4" onClick={() => void save()} disabled={saving || !hasAutoApply}>{saving ? "Saving…" : "Save settings"}</PrimaryButton>
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[22px] italic">Search recipes</h3>
              <GhostButton onClick={addRecipe}>Add recipe</GhostButton>
            </div>
            <p className="mt-1 text-[13px] text-rp-ink-2">They share the daily cap. Highest fit wins.</p>
            {recipes.length === 0 ? (
              <EmptyState title="No recipes yet" body="Add a primary search. Locations default to the United States." action={<GhostButton onClick={addRecipe}>Create primary search</GhostButton>} />
            ) : recipes.map((recipe, index) => (
              <div key={recipe.id} className="mt-4 rounded-md border border-rp-ink/10 p-3">
                <input value={recipe.name} onChange={(e) => setRecipes((current) => current.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} className="h-9 w-full bg-transparent text-[14px] font-medium" />
                <input value={recipe.target_roles.join(", ")} onChange={(e) => setRecipes((current) => current.map((item, i) => i === index ? { ...item, target_roles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : item))} placeholder="Roles (comma separated)" className="mt-2 h-9 w-full rounded-md border border-rp-ink/10 px-2 text-[13px]" />
                <input value={recipe.locations.join(", ")} onChange={(e) => setRecipes((current) => current.map((item, i) => i === index ? { ...item, locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : item))} placeholder="Locations (United States default)" className="mt-2 h-9 w-full rounded-md border border-rp-ink/10 px-2 text-[13px]" />
                <input value={recipe.exclude_keywords.join(", ")} onChange={(e) => setRecipes((current) => current.map((item, i) => i === index ? { ...item, exclude_keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : item))} placeholder="Exclude keywords" className="mt-2 h-9 w-full rounded-md border border-rp-ink/10 px-2 text-[13px]" />
                <label className="mt-2 block text-[12px] text-rp-ink-2">
                  Min match
                  <input type="number" min={50} max={100} value={recipe.min_fit_score} onChange={(e) => setRecipes((current) => current.map((item, i) => i === index ? { ...item, min_fit_score: Number(e.target.value) } : item))} className="mt-1 h-9 w-full rounded-md border border-rp-ink/10 px-2 text-[13px]" />
                </label>
                <label className="mt-2 flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={recipe.enabled} onChange={(e) => setRecipes((current) => current.map((item, i) => i === index ? { ...item, enabled: e.target.checked } : item))} /> Enabled
                </label>
              </div>
            ))}
          </Panel>

          <Panel className="p-5">
            <h3 className="font-display text-[22px] italic">Run history</h3>
            {runs.length === 0 ? (
              <p className="mt-3 text-[13px] text-rp-ink-2">No scheduler runs yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-[13px]">
                {runs.map((run) => (
                  <li key={run.id} className="flex justify-between gap-3">
                    <span>{run.summary || run.status}</span>
                    <span className="font-mono text-[11px] text-rp-ink-3">{new Date(run.started_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

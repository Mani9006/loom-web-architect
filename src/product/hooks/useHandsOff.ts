import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, invokeFunction } from "@/product/lib/table";

export type OptimizationMode = "off" | "honest" | "aggressive";

export interface ApplyRecipe {
  id: string;
  name: string;
  query: string;
  enabled: boolean;
}

export interface HandsOffState {
  enabled: boolean;
  dailyCap: number;
  resumeId: string | null;
  reviewBeforeSubmit: boolean;
  minMatch: number;
  optimization: OptimizationMode;
  coverAuto: boolean;
  excludeInstructions: string;
  filters: string;
}

export const DEFAULT_HANDS_OFF: HandsOffState = {
  enabled: false,
  dailyCap: 25,
  resumeId: null,
  reviewBeforeSubmit: true,
  minMatch: 82,
  optimization: "honest",
  coverAuto: false,
  excludeInstructions: "",
  filters: "",
};

export function useHandsOff() {
  const { user } = useAuth();
  const [state, setState] = useState<HandsOffState>(DEFAULT_HANDS_OFF);
  const [recipes, setRecipes] = useState<ApplyRecipe[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; created_at: string; status: string; summary: string | null }>>([]);
  const [resumes, setResumes] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [prefs, profile, runsRes, resumesRes, recipesRes] = await Promise.all([
      db().from("user_job_prefs").select("auto_apply_enabled,daily_apply_cap,auto_apply_min_fit_score,review_mode,agent_enabled").eq("user_id", user.id).maybeSingle(),
      db().from("profiles").select("job_preferences,primary_resume_id").eq("user_id", user.id).maybeSingle(),
      db().from("agent_runs").select("id,created_at,status,summary").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
      db().from("resumes").select("id,title").eq("user_id", user.id).order("updated_at", { ascending: false }),
      db().from("apply_recipes").select("id,name,query,enabled").eq("user_id", user.id).order("created_at"),
    ]);

    const prefsRow = (prefs.data || {}) as Record<string, unknown>;
    const jobPrefs = ((profile.data as { job_preferences?: Record<string, unknown> } | null)?.job_preferences || {}) as Record<string, unknown>;
    const hands = (jobPrefs.hands_off || {}) as Record<string, unknown>;
    setState({
      enabled: prefsRow.auto_apply_enabled === true || prefsRow.agent_enabled === true,
      dailyCap: Number(prefsRow.daily_apply_cap ?? hands.dailyCap ?? 25),
      resumeId: (profile.data as { primary_resume_id?: string } | null)?.primary_resume_id ?? null,
      reviewBeforeSubmit: prefsRow.review_mode !== "eligible_only",
      minMatch: Number(prefsRow.auto_apply_min_fit_score ?? 82),
      optimization: (["off", "honest", "aggressive"].includes(String(hands.optimization)) ? hands.optimization : "honest") as OptimizationMode,
      coverAuto: hands.coverAuto === true,
      excludeInstructions: typeof hands.excludeInstructions === "string" ? hands.excludeInstructions : "",
      filters: typeof hands.filters === "string" ? hands.filters : "",
    });

    if (!recipesRes.error && recipesRes.data) {
      setRecipes(recipesRes.data as ApplyRecipe[]);
    } else if (Array.isArray(hands.recipes)) {
      setRecipes(hands.recipes as ApplyRecipe[]);
    } else {
      setRecipes([{ id: "default", name: "Primary US search", query: "", enabled: true }]);
    }

    setRuns((runsRes.data || []) as Array<{ id: string; created_at: string; status: string; summary: string | null }>);
    setResumes(((resumesRes.data || []) as Array<{ id: string; title: string | null }>).map((r) => ({ id: r.id, title: r.title || "Untitled resume" })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (next: HandsOffState, nextRecipes: ApplyRecipe[], enableConfirmed: boolean) => {
    if (!user) return false;
    if (next.enabled && !enableConfirmed) return false;
    setSaving(true);
    const { data: profile } = await db().from("profiles").select("job_preferences").eq("user_id", user.id).maybeSingle();
    const current = ((profile as { job_preferences?: Record<string, unknown> } | null)?.job_preferences || {}) as Record<string, unknown>;
    await db().from("profiles").upsert({
      user_id: user.id,
      primary_resume_id: next.resumeId,
      job_preferences: {
        ...current,
        hands_off: {
          optimization: next.optimization,
          coverAuto: next.coverAuto,
          excludeInstructions: next.excludeInstructions,
          filters: next.filters,
          recipes: nextRecipes,
        },
      },
    });
    await db().from("user_job_prefs").upsert({
      user_id: user.id,
      auto_apply_enabled: next.enabled,
      agent_enabled: next.enabled,
      daily_apply_cap: next.dailyCap,
      auto_apply_min_fit_score: next.minMatch,
      review_mode: next.reviewBeforeSubmit ? "always" : "eligible_only",
    });
    for (const recipe of nextRecipes) {
      if (recipe.id === "default") continue;
      await db().from("apply_recipes").upsert({
        id: recipe.id,
        user_id: user.id,
        name: recipe.name,
        query: recipe.query,
        enabled: recipe.enabled,
      });
    }
    if (next.enabled) {
      await invokeFunction("career-agent-control", {
        action: "start",
        thresholds: { min_fit_score: next.minMatch, daily_cap: next.dailyCap },
      });
    } else {
      await invokeFunction("career-agent-control", { action: "stop" });
    }
    setState(next);
    setRecipes(nextRecipes);
    setSaving(false);
    return true;
  }, [user]);

  return { state, setState, recipes, setRecipes, runs, resumes, loading, saving, persist, reload: load };
}

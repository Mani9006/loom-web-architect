import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Prefs {
  target_roles: string[];
  negative_keywords: string[];
  excluded_companies: string[];
  locations: string[];
  target_countries: string[];
  work_modes: string[];
  employment_types: string[];
  seniority_levels: string[];
  remote_only: boolean;
  comp_target_usd_min: number | null;
  comp_target_usd_max: number | null;
  work_authorization: string | null;
  requires_sponsorship: boolean;
  require_salary_disclosure: boolean;
  max_stretch_years: number;
  min_years_experience: number | null;
  max_years_experience: number | null;
  review_mode: "always" | "low_confidence" | "eligible_only";
  auto_apply_enabled: boolean;
  auto_apply_min_score: number;
  auto_apply_min_fit_score: number;
  daily_apply_cap: number;
  auto_apply_portals: string[];
  agent_enabled: boolean;
  agent_max_actions_per_day: number;
}

const DEFAULT: Prefs = {
  target_roles: [],
  negative_keywords: [],
  excluded_companies: [],
  locations: [],
  target_countries: ["United States"],
  work_modes: ["remote", "hybrid", "onsite"],
  employment_types: ["full_time"],
  seniority_levels: ["entry", "mid", "senior"],
  remote_only: false,
  comp_target_usd_min: null,
  comp_target_usd_max: null,
  work_authorization: null,
  requires_sponsorship: false,
  require_salary_disclosure: false,
  max_stretch_years: 2,
  min_years_experience: null,
  max_years_experience: null,
  review_mode: "always",
  auto_apply_enabled: false,
  auto_apply_min_score: 4.5,
  auto_apply_min_fit_score: 82,
  daily_apply_cap: 5,
  auto_apply_portals: ["greenhouse"],
  agent_enabled: false,
  agent_max_actions_per_day: 20,
};

interface AgentRun {
  id: string;
  agent: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  iterations: number;
  summary: string | null;
  actions: Array<{ tool: string; input: unknown; result: unknown; ts: string }>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } }),
};

function TagEditor({ label, hint, values, onChange, placeholder }: {
  label: string; hint: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    onChange([...values, v]);
    setInput("");
  };
  return (
    <div className="space-y-3">
      {label || hint ? (
        <div>
          {label ? <p className="text-[14px] font-semibold text-foreground">{label}</p> : null}
          {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-2 h-8 pl-3 pr-2 rounded-full bg-foreground/5 text-[12px] text-foreground">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="w-4 h-4 rounded-full hover:bg-foreground/10 flex items-center justify-center text-muted-foreground"
              aria-label={`Remove ${v}`}
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/25"
        />
        <button
          type="button"
          onClick={add}
          className="h-10 px-4 rounded-full text-[12px] font-medium border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ChoiceChips({ label, hint, values, choices, onChange }: {
  label: string;
  hint: string;
  values: string[];
  choices: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      {label || hint ? (
        <div>
          {label ? <p className="text-[14px] font-semibold text-foreground">{label}</p> : null}
          {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const active = values.includes(choice.value);
          return (
            <button
              type="button"
              key={choice.value}
              aria-pressed={active}
              onClick={() => onChange(active ? values.filter((value) => value !== choice.value) : [...values, choice.value])}
              className={cn(
                "h-9 px-4 rounded-full text-[12px] font-medium transition-colors",
                active ? "bg-foreground text-background" : "border border-foreground/15 text-foreground hover:bg-foreground/5",
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CareerOpsPreferencesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<AgentRun[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [prefsRes, runsRes] = await Promise.all([
        supabase.from("user_job_prefs").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("agent_runs").select("*").eq("user_id", user.id)
          .order("started_at", { ascending: false }).limit(8),
      ]);
      if (prefsRes.data) setPrefs({ ...DEFAULT, ...(prefsRes.data as unknown as Prefs) });
      setRuns((runsRes.data || []).map((run) => ({
        ...run,
        actions: Array.isArray(run.actions) ? run.actions as unknown as AgentRun["actions"] : [],
      })));
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const normalized = {
      ...prefs,
      remote_only: prefs.work_modes.length === 1 && prefs.work_modes[0] === "remote",
    };
    const { error } = await supabase
      .from("user_job_prefs")
      .upsert({ user_id: user.id, ...normalized }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success("Preferences saved");
  };

  if (loading) {
    return <div className="px-6 lg:px-12 py-12 max-w-[960px] mx-auto"><div className="h-72 rounded-2xl bg-foreground/5 animate-pulse" /></div>;
  }

  return (
    <div className="px-6 lg:px-12 py-10 lg:py-12 max-w-[960px] mx-auto space-y-10">
      <motion.header initial="hidden" animate="visible" variants={fadeUp} custom={0}>
        <button onClick={() => navigate("/matches")} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-3">
          ← Matches
        </button>
        <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Preferences</p>
        <h1 className="text-[28px] sm:text-[32px] font-bold text-foreground tracking-tight leading-tight">
          Tune the shortlist
        </h1>
        <p className="mt-2 max-w-[64ch] text-[14px] text-muted-foreground leading-relaxed">
          These preferences control what the scanner surfaces, how the evaluator scores, and whether the auto-submitter engages.
        </p>
      </motion.header>

      {/* Targeting */}
      <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={1} className="glass-card p-8 space-y-8">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold text-foreground">Targeting</p>
        </div>
        <TagEditor
          label="Target roles"
          hint="Role families you can support with resume evidence; exact title wording is not required."
          values={prefs.target_roles}
          onChange={(target_roles) => setPrefs({ ...prefs, target_roles })}
          placeholder="Staff Engineer, Product Manager…"
        />
        <TagEditor
          label="Negative keywords"
          hint="Any title or description containing one of these is blocked."
          values={prefs.negative_keywords}
          onChange={(negative_keywords) => setPrefs({ ...prefs, negative_keywords })}
          placeholder="Intern, Sales…"
        />
        <TagEditor
          label="Excluded companies"
          hint="Companies you never want included in the shortlist."
          values={prefs.excluded_companies}
          onChange={(excluded_companies) => setPrefs({ ...prefs, excluded_companies })}
          placeholder="Company name…"
        />
        <TagEditor
          label="Preferred locations"
          hint="Cities or regions for hybrid and on-site work."
          values={prefs.locations}
          onChange={(locations) => setPrefs({ ...prefs, locations })}
          placeholder="Berlin, Remote EU…"
        />
        <TagEditor
          label="Countries"
          hint="Country eligibility is checked before a role can be prepared."
          values={prefs.target_countries}
          onChange={(target_countries) => setPrefs({ ...prefs, target_countries })}
          placeholder="United States, Canada…"
        />
        <ChoiceChips
          label="Work mode"
          hint="Choose every arrangement you will accept."
          values={prefs.work_modes}
          onChange={(work_modes) => setPrefs({ ...prefs, work_modes })}
          choices={[
            { value: "remote", label: "Remote" },
            { value: "hybrid", label: "Hybrid" },
            { value: "onsite", label: "On-site" },
          ]}
        />
        <ChoiceChips
          label="Seniority"
          hint="A role outside these levels is blocked, even if its keywords look similar."
          values={prefs.seniority_levels}
          onChange={(seniority_levels) => setPrefs({ ...prefs, seniority_levels })}
          choices={[
            { value: "entry", label: "Entry" },
            { value: "mid", label: "Mid" },
            { value: "senior", label: "Senior" },
            { value: "staff", label: "Staff / Principal" },
            { value: "manager", label: "Manager" },
            { value: "director", label: "Director" },
            { value: "executive", label: "Executive" },
          ]}
        />
        <ChoiceChips
          label="Employment type"
          hint="Only selected employment types can enter the application queue."
          values={prefs.employment_types}
          onChange={(employment_types) => setPrefs({ ...prefs, employment_types })}
          choices={[
            { value: "full_time", label: "Full-time" },
            { value: "contract", label: "Contract" },
            { value: "part_time", label: "Part-time" },
            { value: "internship", label: "Internship" },
          ]}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Work authorization</p>
            <input
              value={prefs.work_authorization ?? ""}
              onChange={(e) => setPrefs({ ...prefs, work_authorization: e.target.value || null })}
              placeholder="US citizen, H-1B, OPT…"
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Maximum experience stretch</p>
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={prefs.max_stretch_years}
              onChange={(e) => setPrefs({ ...prefs, max_stretch_years: Number(e.target.value) })}
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Block roles asking for more than this many extra years.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Minimum job experience level</p>
            <input
              type="number"
              min="0"
              max="40"
              step="0.5"
              value={prefs.min_years_experience ?? ""}
              onChange={(e) => setPrefs({ ...prefs, min_years_experience: e.target.value ? Number(e.target.value) : null })}
              placeholder="No minimum"
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Maximum job experience level</p>
            <input
              type="number"
              min="0"
              max="40"
              step="0.5"
              value={prefs.max_years_experience ?? ""}
              onChange={(e) => setPrefs({ ...prefs, max_years_experience: e.target.value ? Number(e.target.value) : null })}
              placeholder="No maximum"
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-[14px] font-semibold text-foreground">I need sponsorship</p>
            <p className="text-[12px] text-muted-foreground">Block postings that explicitly cannot sponsor.</p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs({ ...prefs, requires_sponsorship: !prefs.requires_sponsorship })}
            className={cn(
              "h-7 w-12 overflow-hidden rounded-full transition-colors relative",
              prefs.requires_sponsorship ? "bg-foreground" : "bg-foreground/10",
            )}
            aria-label="Toggle sponsorship requirement"
          >
            <span className={cn("absolute left-0.5 top-0.5 w-6 h-6 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out", prefs.requires_sponsorship ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Comp min (USD)</p>
            <input
              type="number"
              value={prefs.comp_target_usd_min ?? ""}
              onChange={(e) => setPrefs({ ...prefs, comp_target_usd_min: e.target.value ? Number(e.target.value) : null })}
              placeholder="120000"
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Comp max (USD)</p>
            <input
              type="number"
              value={prefs.comp_target_usd_max ?? ""}
              onChange={(e) => setPrefs({ ...prefs, comp_target_usd_max: e.target.value ? Number(e.target.value) : null })}
              placeholder="200000"
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-[14px] font-semibold text-foreground">Require a disclosed salary</p>
            <p className="text-[12px] text-muted-foreground">Block roles without a usable compensation range.</p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs({ ...prefs, require_salary_disclosure: !prefs.require_salary_disclosure })}
            className={cn(
              "h-7 w-12 overflow-hidden rounded-full transition-colors relative shrink-0",
              prefs.require_salary_disclosure ? "bg-foreground" : "bg-foreground/10",
            )}
            aria-label="Toggle salary disclosure requirement"
          >
            <span className={cn("absolute left-0.5 top-0.5 w-6 h-6 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out", prefs.require_salary_disclosure ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>
      </motion.section>

      {/* Auto-apply */}
      <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={2} className="glass-card p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Auto-submit</p>
            <p className="text-[14px] font-semibold text-foreground mt-2">
              Submit to Greenhouse portals <em className="italic font-normal">on your behalf.</em>
            </p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-[60ch]">
              When on, high-scoring drafts can be queued to the worker which POSTs to the Greenhouse application endpoint.
              Lever, Ashby, Workday, LinkedIn are intentionally excluded — account-flag risk outweighs convenience.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs({ ...prefs, auto_apply_enabled: !prefs.auto_apply_enabled })}
            className={cn(
              "h-7 w-12 overflow-hidden rounded-full transition-colors relative shrink-0",
              prefs.auto_apply_enabled ? "bg-foreground" : "bg-foreground/10",
            )}
            aria-label="Toggle auto-apply"
          >
            <span className={cn("absolute left-0.5 top-0.5 w-6 h-6 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out", prefs.auto_apply_enabled ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>

        <div className={cn("grid grid-cols-2 gap-6 pt-4 border-t border-foreground/10", !prefs.auto_apply_enabled && "opacity-50 pointer-events-none")}>
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Minimum career fit</p>
            <p className="text-[12px] text-muted-foreground mb-2">0–100 evidence-based gate. Hard filters still win.</p>
            <input
              type="number"
              min="0"
              max="100"
              value={prefs.auto_apply_min_fit_score}
              onChange={(e) => setPrefs({ ...prefs, auto_apply_min_fit_score: Number(e.target.value) })}
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Daily submit cap</p>
            <p className="text-[12px] text-muted-foreground mb-2">Hard limit to protect your applicant reputation.</p>
            <input
              type="number"
              min="0"
              max="50"
              value={prefs.daily_apply_cap}
              onChange={(e) => setPrefs({ ...prefs, daily_apply_cap: Number(e.target.value) })}
              className="w-full h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-foreground/10">
          <p className="text-[13px] font-semibold text-foreground mb-1">Review policy</p>
          <p className="text-[12px] text-muted-foreground mb-3">Controls the last human checkpoint; blocked jobs can never submit.</p>
          <ChoiceChips
            label=""
            hint=""
            values={[prefs.review_mode]}
            onChange={(values) => setPrefs({ ...prefs, review_mode: (values.at(-1) ?? "always") as Prefs["review_mode"] })}
            choices={[
              { value: "always", label: "Review every application" },
              { value: "low_confidence", label: "Review low confidence" },
              { value: "eligible_only", label: "Auto-send eligible only" },
            ]}
          />
        </div>

        {prefs.auto_apply_enabled && (
          <div className="pt-4 border-t border-foreground/10">
            <p className="text-[13px] font-semibold text-foreground mb-1">Enabled portals</p>
            <div className="flex gap-2 flex-wrap mt-2">
              {(["greenhouse", "ashby", "lever"] as const).map((p) => {
                const active = prefs.auto_apply_portals.includes(p);
                const available = p === "greenhouse";
                return (
                  <button
                    type="button"
                    key={p}
                    disabled={!available}
                    onClick={() => setPrefs({
                      ...prefs,
                      auto_apply_portals: active
                        ? prefs.auto_apply_portals.filter((x) => x !== p)
                        : [...prefs.auto_apply_portals, p],
                    })}
                    className={cn(
                      "h-9 px-4 rounded-full text-[12px] font-medium transition-colors capitalize",
                      !available && "bg-foreground/5 text-muted-foreground/50 cursor-not-allowed",
                      available && active && "bg-foreground text-background",
                      available && !active && "border border-foreground/15 text-foreground hover:bg-foreground/5",
                    )}
                  >
                    {p}{!available ? " · soon" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.section>

      {/* Auto-pilot agent */}
      <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={3} className="glass-card p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Auto-pilot</p>
            <p className="text-[14px] font-semibold text-foreground mt-2">
              Let the Job Hunter agent run for you.
            </p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-[60ch]">
              Every hour, an autonomous agent scans new matches against your prefs, scores them, and prepares the high-scoring ones — so you walk in to a queue of ready-to-review applications instead of doing it manually. It never submits without your approval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs({ ...prefs, agent_enabled: !prefs.agent_enabled })}
            className={cn(
              "h-7 w-12 overflow-hidden rounded-full transition-colors relative shrink-0",
              prefs.agent_enabled ? "bg-foreground" : "bg-foreground/10",
            )}
            aria-label="Toggle auto-pilot"
          >
            <span className={cn("absolute left-0.5 top-0.5 w-6 h-6 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out", prefs.agent_enabled ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>

        <div className={cn("pt-4 border-t border-foreground/10", !prefs.agent_enabled && "opacity-50 pointer-events-none")}>
          <p className="text-[13px] font-semibold text-foreground mb-1">Daily action budget</p>
          <p className="text-[12px] text-muted-foreground mb-2">Hard cap on how many score + prepare actions the agent can take in 24 hours.</p>
          <input
            type="number"
            min="0"
            max="100"
            value={prefs.agent_max_actions_per_day}
            onChange={(e) => setPrefs({ ...prefs, agent_max_actions_per_day: Number(e.target.value) })}
            className="w-full max-w-[200px] h-10 px-4 rounded-full bg-background/50 border border-foreground/10 text-[13px] focus:outline-none focus:border-foreground/25"
          />
        </div>

        {runs.length > 0 && (
          <div className="pt-4 border-t border-foreground/10">
            <p className="text-[13px] font-semibold text-foreground mb-3">Recent activity</p>
            <ul className="divide-y divide-foreground/10">
              {runs.map((r) => (
                <li key={r.id} className="grid grid-cols-[80px_1fr_auto] gap-3 items-start py-3">
                  <span className={cn(
                    "text-[10.5px] font-mono font-medium uppercase tracking-wider px-2 py-0.5 rounded inline-block w-fit",
                    r.status === "completed" ? "bg-emerald-100 text-emerald-700"
                      : r.status === "failed" ? "bg-rose-100 text-rose-700"
                      : r.status === "capped" ? "bg-amber-100 text-amber-700"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {r.status}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground leading-snug">{r.summary ?? "(no summary)"}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {r.actions.length} action{r.actions.length === 1 ? "" : "s"} · {r.iterations} iteration{r.iterations === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(r.started_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="h-11 px-6 rounded-full text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

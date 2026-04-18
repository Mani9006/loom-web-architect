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
  locations: string[];
  remote_only: boolean;
  comp_target_usd_min: number | null;
  comp_target_usd_max: number | null;
  auto_apply_enabled: boolean;
  auto_apply_min_score: number;
  daily_apply_cap: number;
  auto_apply_portals: string[];
}

const DEFAULT: Prefs = {
  target_roles: [],
  negative_keywords: [],
  locations: [],
  remote_only: false,
  comp_target_usd_min: null,
  comp_target_usd_max: null,
  auto_apply_enabled: false,
  auto_apply_min_score: 4.5,
  daily_apply_cap: 5,
  auto_apply_portals: ["greenhouse"],
};

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
      <div>
        <p className="text-[14px] font-semibold text-foreground">{label}</p>
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      </div>
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

export default function CareerOpsPreferencesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_job_prefs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPrefs({ ...DEFAULT, ...(data as Prefs) });
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_job_prefs")
      .upsert({ user_id: user.id, ...prefs }, { onConflict: "user_id" });
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
          hint="Keywords that must appear in the job title (e.g. 'AI', 'Staff', 'Platform')."
          values={prefs.target_roles}
          onChange={(target_roles) => setPrefs({ ...prefs, target_roles })}
          placeholder="Staff Engineer, Product Manager…"
        />
        <TagEditor
          label="Negative keywords"
          hint="Titles containing any of these are hidden."
          values={prefs.negative_keywords}
          onChange={(negative_keywords) => setPrefs({ ...prefs, negative_keywords })}
          placeholder="Intern, Sales…"
        />
        <TagEditor
          label="Preferred locations"
          hint="City or region. Leave empty to include all."
          values={prefs.locations}
          onChange={(locations) => setPrefs({ ...prefs, locations })}
          placeholder="Berlin, Remote EU…"
        />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold text-foreground">Remote only</p>
            <p className="text-[12px] text-muted-foreground">Hide on-site and hybrid roles.</p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs({ ...prefs, remote_only: !prefs.remote_only })}
            className={cn(
              "h-7 w-12 rounded-full transition-colors relative",
              prefs.remote_only ? "bg-foreground" : "bg-foreground/10",
            )}
          >
            <span className={cn("absolute top-0.5 w-6 h-6 rounded-full bg-background shadow-sm transition-transform", prefs.remote_only ? "translate-x-5" : "translate-x-0.5")} />
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
              "h-7 w-12 rounded-full transition-colors relative shrink-0",
              prefs.auto_apply_enabled ? "bg-foreground" : "bg-foreground/10",
            )}
            aria-label="Toggle auto-apply"
          >
            <span className={cn("absolute top-0.5 w-6 h-6 rounded-full bg-background shadow-sm transition-transform", prefs.auto_apply_enabled ? "translate-x-5" : "translate-x-0.5")} />
          </button>
        </div>

        <div className={cn("grid grid-cols-2 gap-6 pt-4 border-t border-foreground/10", !prefs.auto_apply_enabled && "opacity-50 pointer-events-none")}>
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Minimum score</p>
            <p className="text-[12px] text-muted-foreground mb-2">Only submit to roles scored ≥ this.</p>
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={prefs.auto_apply_min_score}
              onChange={(e) => setPrefs({ ...prefs, auto_apply_min_score: Number(e.target.value) })}
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

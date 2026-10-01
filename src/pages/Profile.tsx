/**
 * Profile — Editorial Prestige.
 *
 * Editorial two-column: a slim identity rail on the left, a long-form form
 * on the right, everything separated by hairline rules instead of card
 * boxes. Fields are indexed with 01/02 numerals like a print form.
 *
 * Data, saves and validation unchanged.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileText, Loader2, Save, ShieldCheck, ArrowUpRight } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";


interface ProfileState {
  full_name: string; email: string; phone: string; location: string; linkedin_url: string;
  target_role: string; years_of_experience: string; work_authorization: string;
  expected_salary: string; portfolio_url: string; notice_period: string;
  requires_sponsorship: boolean;
}
interface ResumeSummary { id: string; title: string; updated_at: string }

const emptyProfile: ProfileState = {
  full_name: "", email: "", phone: "", location: "", linkedin_url: "", target_role: "",
  years_of_experience: "", work_authorization: "", expected_salary: "", portfolio_url: "",
  notice_period: "", requires_sponsorship: false,
};

const WORK_AUTH_OPTIONS = [
  { value: "unspecified", label: "Select status" },
  { value: "us_citizen", label: "U.S. citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "ead", label: "Employment authorization" },
  { value: "h1b", label: "H-1B" },
  { value: "f1_opt", label: "F-1 OPT / CPT" },
  { value: "other", label: "Other" },
];

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState(emptyProfile);
  const [resume, setResume] = useState<ResumeSummary | null>(null);
  const [jobPreferences, setJobPreferences] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [profileResult, resumeResult] = await Promise.all([
      supabase.from("profiles").select("full_name,email,job_preferences").eq("user_id", user.id).maybeSingle(),
      supabase.from("resumes").select("id,title,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (profileResult.error) {
      toast({ title: "Couldn't load your profile", description: "Refresh to try again before editing.", variant: "destructive" });
      setLoading(false); return;
    }
    const row = profileResult.data;
    const preferences = (row?.job_preferences || {}) as Record<string, unknown>;
    const applypass = (preferences.applypass || {}) as Record<string, unknown>;
    const application = (applypass.profile || {}) as Record<string, unknown>;
    setJobPreferences(preferences);
    setProfile({
      full_name: row?.full_name || "",
      email: row?.email || user.email || "",
      phone: String(application.phone || ""),
      location: String(application.location || ""),
      linkedin_url: String(application.linkedinUrl || ""),
      target_role: String(application.currentTitle || ""),
      years_of_experience: String(application.yearsExperience || ""),
      work_authorization: String(application.workAuthorization || ""),
      expected_salary: String(application.expectedSalary || ""),
      portfolio_url: String(application.portfolioUrl || ""),
      notice_period: String(application.noticePeriod || ""),
      requires_sponsorship: application.requiresSponsorship === true,
    });
    setResume(resumeResult.data || null);
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { void load(); }, [load]);

  const completion = useMemo(() => {
    const values = [profile.full_name, profile.email, profile.phone, profile.location, profile.target_role, profile.years_of_experience, profile.work_authorization, profile.linkedin_url, resume?.id];
    return Math.round(values.filter(Boolean).length / values.length * 100);
  }, [profile, resume]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const oldApplypass = (jobPreferences.applypass || {}) as Record<string, unknown>;
    const oldApplicationProfile = (oldApplypass.profile || {}) as Record<string, unknown>;
    const applicationProfile = {
      ...oldApplicationProfile,
      fullName: profile.full_name.trim(), email: profile.email.trim(), phone: profile.phone.trim(), location: profile.location.trim(),
      currentTitle: profile.target_role.trim(), yearsExperience: profile.years_of_experience.trim(), linkedinUrl: profile.linkedin_url.trim(),
      portfolioUrl: profile.portfolio_url.trim(), expectedSalary: profile.expected_salary.trim(), workAuthorization: profile.work_authorization,
      noticePeriod: profile.notice_period.trim(),
      requiresSponsorship: profile.requires_sponsorship,
    };
    const profileResult = await supabase.from("profiles").upsert({
      user_id: user.id,
      full_name: profile.full_name.trim(), email: profile.email.trim(),
      job_preferences: { ...jobPreferences, applypass: { ...oldApplypass, profile: applicationProfile } },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    void supabase.from("user_job_prefs").upsert({
      user_id: user.id,
      requires_sponsorship: profile.requires_sponsorship,
      work_authorization: profile.work_authorization || null,
    }, { onConflict: "user_id" });
    setSaving(false);
    if (profileResult.error) {
      toast({ title: "Profile wasn't saved", description: "Your previous profile is unchanged. Try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Application profile saved", description: "Future matching, tailoring, and forms will use these verified details." });
  }

  if (loading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-rp-accent" /></div>;

  const initials = profile.full_name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || profile.email[0]?.toUpperCase() || "U";

  return (
    <div className="min-h-full bg-rp-canvas text-rp-ink">
      <div className="max-w-[1280px] mx-auto px-8 lg:px-12 pt-12 pb-24">
        <PageHeader
          title="Application profile."
          status={`profile · ${completion}% complete`}
          description="Your verified identity, experience level, contact details, and reusable application answers. ResumePreps uses this instead of guessing."
        />

        <div className="grid grid-cols-12 gap-10 lg:gap-14 mt-4">
          {/* ── Identity rail ─────────────────────────────────── */}
          <aside className="col-span-12 lg:col-span-4 space-y-10">
            <div>
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-rp-accent text-xs font-medium">00</span>
                <span className="text-rp-ink-2 text-xs font-medium">Identity</span>
                <span className="flex-1 h-px bg-rp-rule" />
              </div>
              <div className="flex items-center gap-4">
                <div
                  className="inline-flex items-center justify-center w-14 h-14 border border-rp-rule-2 text-rp-ink text-xl font-medium"
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-rp-ink text-xl font-medium">
                    {profile.full_name || "Your name"}
                  </p>
                  <p className="truncate text-rp-ink-3 font-mono text-xs">{user?.email}</p>
                </div>
              </div>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-rp-ink-3 text-xs font-medium">Completeness</span>
                <span className="text-rp-accent tabular-nums text-xl font-normal">{completion}%</span>
              </div>
              <div className="mt-2 h-[3px] w-full bg-rp-paper-2 overflow-hidden">
                <div className="h-full bg-rp-accent transition-[width] duration-700" style={{ width: `${completion}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-rp-accent text-xs font-medium">—</span>
                <span className="text-rp-ink-2 text-xs font-medium">Source résumé</span>
                <span className="flex-1 h-px bg-rp-rule" />
              </div>
              {resume ? (
                <div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-rp-accent shrink-0" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <p className="truncate text-rp-ink text-sm font-medium">{resume.title || "Untitled résumé"}</p>
                      <p className="mt-1 text-rp-ink-3 font-mono text-xs">
                        Updated {new Date(resume.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/resume-builder/${resume.id}`)}
                    className="mt-5 inline-flex items-center gap-2 border-b border-rp-rule-2 text-rp-ink hover:text-rp-accent hover:border-rp-accent transition-colors pb-1 text-xs font-semibold"
                  >
                    Review résumé <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-rp-ink-2 leading-relaxed text-meta font-normal">
                    Import a résumé before the Agent can match your full career story.
                  </p>
                  <button
                    onClick={() => navigate("/resume-builder")}
                    className="mt-5 inline-flex items-center gap-2 border-b border-rp-accent text-rp-accent hover:text-rp-accent-2 hover:border-rp-accent-2 transition-colors pb-1 text-xs font-semibold"
                  >
                    Import résumé <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-rp-rule">
              <div className="flex gap-3 pt-6">
                <ShieldCheck className="h-4 w-4 shrink-0 text-rp-accent mt-0.5" strokeWidth={1.75} />
                <div>
                  <p className="text-rp-ink text-meta font-semibold">Used with your approval</p>
                  <p className="mt-1.5 leading-relaxed text-rp-ink-2 text-xs font-normal">
                    Sensitive or missing answers are never guessed. They move the application to <em className="text-rp-accent not-italic">Needs attention</em>.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Long form ────────────────────────────────────── */}
          <main className="col-span-12 lg:col-span-8 space-y-14">
            <FormSection n="01" title="Identity & contact" description="Information employers receive on application forms.">
              <FormRow>
                <TextField label="Full name" value={profile.full_name} onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))} placeholder="First and last name" />
                <TextField label="Application email" type="email" value={profile.email} onChange={(v) => setProfile((p) => ({ ...p, email: v }))} />
              </FormRow>
              <FormRow>
                <TextField label="Phone" type="tel" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} placeholder="+1 555 123 4567" />
                <TextField label="Location" value={profile.location} onChange={(v) => setProfile((p) => ({ ...p, location: v }))} placeholder="City, State, Country" />
              </FormRow>
              <FormRow>
                <TextField label="LinkedIn URL" value={profile.linkedin_url} onChange={(v) => setProfile((p) => ({ ...p, linkedin_url: v }))} placeholder="https://linkedin.com/in/..." />
                <TextField label="Portfolio / website" value={profile.portfolio_url} onChange={(v) => setProfile((p) => ({ ...p, portfolio_url: v }))} placeholder="https://..." />
              </FormRow>
            </FormSection>

            <FormSection n="02" title="Experience & application defaults" description="These become hard filters and reusable form answers.">
              <FormRow>
                <TextField label="Current or target title" value={profile.target_role} onChange={(v) => setProfile((p) => ({ ...p, target_role: v }))} placeholder="Senior Data Engineer" />
                <TextField label="Years of experience" type="number" value={profile.years_of_experience} onChange={(v) => setProfile((p) => ({ ...p, years_of_experience: v }))} />
              </FormRow>
              <FormRow>
                <SelectField label="Work authorization" value={profile.work_authorization || "unspecified"} onChange={(v) => setProfile((p) => ({ ...p, work_authorization: v === "unspecified" ? "" : v }))} options={WORK_AUTH_OPTIONS} />
                <TextField label="Expected salary" value={profile.expected_salary} onChange={(v) => setProfile((p) => ({ ...p, expected_salary: v }))} placeholder="Example: $125,000 base" />
              </FormRow>
              <FormRow>
                <TextField label="Notice period / start date" value={profile.notice_period} onChange={(v) => setProfile((p) => ({ ...p, notice_period: v }))} placeholder="Two weeks" />
                <label className="flex items-start gap-3 mt-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.requires_sponsorship}
                    onChange={(event) => setProfile((v) => ({ ...v, requires_sponsorship: event.target.checked }))}
                    className="mt-1 h-4 w-4 accent-rp-accent"
                  />
                  <span>
                    <span className="block text-rp-ink text-meta font-medium">Requires visa sponsorship</span>
                    <span className="mt-1 block text-rp-ink-3 leading-relaxed text-xs font-normal">
                      Used as a hard match filter and a consistent application answer.
                    </span>
                  </span>
                </label>
              </FormRow>
            </FormSection>

            <div className="flex flex-wrap justify-between gap-4 pt-6 border-t border-rp-rule">
              <button
                onClick={() => navigate("/career-ops/preferences")}
                className="inline-flex items-center gap-2 border-b border-rp-rule-2 text-rp-ink-2 hover:text-rp-accent hover:border-rp-accent transition-colors pb-1 text-xs font-semibold"
              >
                Edit job match preferences <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-rp-accent text-rp-canvas hover:bg-rp-accent-2 transition-colors px-8 py-3 disabled:opacity-50 text-xs font-semibold"
              >
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save profile</>}
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ─── Editorial form primitives ────────────────────────────────────────

function FormSection({ n, title, description, children }: {
  n: string; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section>
      <header className="border-b border-rp-rule pb-4 mb-6">
        <div className="flex items-baseline gap-3">
          <span
            className="text-rp-accent tabular-nums text-xs font-medium"
          >
            {n}
          </span>
          <h2
            className="text-rp-ink text-xl font-normal"
          >
            {title}
          </h2>
        </div>
        {description && (
          <p className="mt-2 text-rp-ink-2 max-w-lg leading-relaxed text-meta font-normal">
            {description}
          </p>
        )}
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">{children}</div>;
}

function TextField({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span
        className="block text-rp-ink-2 mb-2 text-xs font-medium"
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("text-sm",
          "w-full bg-transparent border-0 border-b border-rp-rule-2 px-0 py-2 text-rp-ink placeholder:text-rp-ink-3/60",
          "focus:outline-none focus:border-rp-accent transition-colors",
        )}
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span
        className="block text-rp-ink-2 mb-2 text-xs font-medium"
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-0 border-b border-rp-rule-2 px-0 py-2 text-rp-ink focus:outline-none focus:border-rp-accent transition-colors text-sm"
      >
        {options.map((o) => <option key={o.value} value={o.value} className="bg-rp-canvas text-rp-ink">{o.label}</option>)}
      </select>
    </label>
  );
}

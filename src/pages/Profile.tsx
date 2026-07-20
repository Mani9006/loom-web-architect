import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BriefcaseBusiness, CheckCircle2, FileText, Loader2, Mail, MapPin, Phone, Save, ShieldCheck, User as UserIcon } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ProfileState {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  target_role: string;
  years_of_experience: string;
  work_authorization: string;
  expected_salary: string;
  portfolio_url: string;
  notice_period: string;
  requires_sponsorship: boolean;
}

interface ResumeSummary { id: string; title: string; updated_at: string }

const emptyProfile: ProfileState = {
  full_name: "", email: "", phone: "", location: "", linkedin_url: "", target_role: "",
  years_of_experience: "", work_authorization: "", expected_salary: "", portfolio_url: "",
  notice_period: "", requires_sponsorship: false,
};

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
      // Without this, a failed read renders as an empty editable form and the
      // next save can overwrite good data with blanks.
      toast({ title: "Couldn't load your profile", description: "Refresh to try again before editing.", variant: "destructive" });
      setLoading(false);
      return;
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
    const applicationProfile = {
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

    // Newer environments mirror these defaults into typed matching columns.
    // The JSON source of truth above keeps profile editing compatible while a
    // staged database migration is still rolling through preview/production.
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

  if (loading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  const initials = profile.full_name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || profile.email[0]?.toUpperCase() || "U";

  return (
    <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader title="Application profile." status={`${completion}% complete`} description="Your verified identity, experience level, contact details, and reusable application answers. ResumePreps uses this source of truth instead of guessing." />

      <div className="mt-7 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><Avatar className="h-16 w-16"><AvatarFallback className="bg-primary text-lg font-bold text-primary-foreground">{initials}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-semibold">{profile.full_name || "Your name"}</p><p className="truncate text-xs text-muted-foreground">{user?.email}</p></div></div><div className="mt-5 flex items-center justify-between text-xs"><span className="text-muted-foreground">Profile completeness</span><span className="font-semibold">{completion}%</span></div><Progress value={completion} className="mt-2 h-2" /></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" />Source résumé</CardTitle></CardHeader><CardContent>{resume ? <><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /><div className="min-w-0"><p className="truncate text-sm font-medium">{resume.title || "Untitled résumé"}</p><p className="mt-1 text-xs text-muted-foreground">Updated {new Date(resume.updated_at).toLocaleDateString()}</p></div></div><Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => navigate(`/resume-builder/${resume.id}`)}>Review résumé</Button></> : <><p className="text-xs leading-relaxed text-muted-foreground">Import a résumé before the Agent can match your full career story.</p><Button className="mt-4 w-full" size="sm" onClick={() => navigate("/resume-builder")}>Import résumé</Button></>}</CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Used with your approval</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Sensitive or missing questions are never guessed. They move the application to Needs attention.</p></div></div></CardContent></Card>
        </aside>

        <main className="space-y-5">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserIcon className="h-5 w-5 text-primary" />Identity and contact</CardTitle><CardDescription>Information employers receive on application forms.</CardDescription></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" icon={UserIcon}><Input value={profile.full_name} onChange={(event) => setProfile((value) => ({ ...value, full_name: event.target.value }))} placeholder="First and last name" /></Field>
            <Field label="Application email" icon={Mail}><Input type="email" value={profile.email} onChange={(event) => setProfile((value) => ({ ...value, email: event.target.value }))} /></Field>
            <Field label="Phone" icon={Phone}><Input type="tel" value={profile.phone} onChange={(event) => setProfile((value) => ({ ...value, phone: event.target.value }))} placeholder="+1 555 123 4567" /></Field>
            <Field label="Location" icon={MapPin}><Input value={profile.location} onChange={(event) => setProfile((value) => ({ ...value, location: event.target.value }))} placeholder="City, State, Country" /></Field>
            <div className="space-y-2"><Label>LinkedIn URL</Label><Input value={profile.linkedin_url} onChange={(event) => setProfile((value) => ({ ...value, linkedin_url: event.target.value }))} placeholder="https://linkedin.com/in/..." /></div>
            <div className="space-y-2"><Label>Portfolio or website</Label><Input value={profile.portfolio_url} onChange={(event) => setProfile((value) => ({ ...value, portfolio_url: event.target.value }))} placeholder="https://..." /></div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BriefcaseBusiness className="h-5 w-5 text-primary" />Experience and application defaults</CardTitle><CardDescription>These values become hard filters and reusable form answers.</CardDescription></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label>Current or target title</Label><Input value={profile.target_role} onChange={(event) => setProfile((value) => ({ ...value, target_role: event.target.value }))} placeholder="Senior Data Engineer" /></div>
            <div className="space-y-2"><Label>Total years of experience</Label><Input type="number" min="0" max="60" step="0.5" value={profile.years_of_experience} onChange={(event) => setProfile((value) => ({ ...value, years_of_experience: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Work authorization</Label><Select value={profile.work_authorization || "unspecified"} onValueChange={(value) => setProfile((current) => ({ ...current, work_authorization: value === "unspecified" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">Select status</SelectItem><SelectItem value="us_citizen">U.S. citizen</SelectItem><SelectItem value="permanent_resident">Permanent resident</SelectItem><SelectItem value="ead">Employment authorization document</SelectItem><SelectItem value="h1b">H-1B</SelectItem><SelectItem value="f1_opt">F-1 OPT/CPT</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Expected salary</Label><Input value={profile.expected_salary} onChange={(event) => setProfile((value) => ({ ...value, expected_salary: event.target.value }))} placeholder="Example: $125,000 base" /></div>
            <div className="space-y-2"><Label>Notice period / start date</Label><Input value={profile.notice_period} onChange={(event) => setProfile((value) => ({ ...value, notice_period: event.target.value }))} placeholder="Two weeks" /></div>
            <label className="flex items-start gap-3 border border-border p-4"><input type="checkbox" checked={profile.requires_sponsorship} onChange={(event) => setProfile((value) => ({ ...value, requires_sponsorship: event.target.checked }))} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-medium">I require present or future sponsorship</span><span className="mt-1 block text-xs text-muted-foreground">Used as a hard match filter and a consistent application answer.</span></span></label>
          </CardContent></Card>

          <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={() => navigate("/career-ops/preferences")}>Edit job match preferences</Button><Button onClick={save} disabled={saving} className="min-w-40">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save profile</>}</Button></div>
        </main>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof UserIcon; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label><div className="relative"><Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><div className="[&_input]:pl-10">{children}</div></div></div>;
}

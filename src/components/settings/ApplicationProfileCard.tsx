import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  buildApplypassPayload,
  computeCompleteness,
  COUNTRIES,
  EEO_LABELS,
  EEO_OPTIONS,
  emptyForm,
  formFromApplypass,
  prefillFromResume,
  WORK_AUTHORIZATION_OPTIONS,
  YEARS_EXPERIENCE_OPTIONS,
  type ApplicationProfileForm,
  type EeoAnswers,
} from "@/lib/application-profile";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

export function ApplicationProfileCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<ApplicationProfileForm>(emptyForm());
  const [storedProfile, setStoredProfile] = useState<UnknownRecord>({});
  const [storedApplypass, setStoredApplypass] = useState<UnknownRecord>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const completeness = useMemo(() => computeCompleteness(form), [form]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: profileRow }, { data: resume }] = await Promise.all([
      supabase.from("profiles").select("job_preferences").eq("user_id", user.id).maybeSingle(),
      supabase.from("resumes").select("personal_info,experience").eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const jobPreferences = record(profileRow?.job_preferences);
    const applypass = record(jobPreferences.applypass);
    const stored = record(applypass.profile);
    setStoredApplypass(applypass);
    setStoredProfile(stored);
    setForm(prefillFromResume(resume as UnknownRecord | null, formFromApplypass(applypass)));
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { data: profileRow } = await supabase.from("profiles").select("job_preferences").eq("user_id", user.id).maybeSingle();
    const current = record(profileRow?.job_preferences);
    const applypass = record(current.applypass);
    const mergedStoredProfile = { ...record(applypass.profile), ...storedProfile };
    const payload = buildApplypassPayload(form, mergedStoredProfile);
    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      job_preferences: {
        ...current,
        applypass: { ...applypass, ...storedApplypass, ...payload },
      } as Json,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Application answers weren't saved", description: "Your previous answers are unchanged. Try again.", variant: "destructive" });
      return;
    }
    setStoredApplypass((previous) => ({ ...previous, ...payload }));
    setStoredProfile((previous) => ({ ...previous, ...(payload.profile as UnknownRecord) }));
    toast({ title: "Application answers saved", description: "The agent will use these answers on every application." });
  }

  function set<K extends keyof ApplicationProfileForm>(key: K, value: ApplicationProfileForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function setEeo(key: keyof EeoAnswers, value: string) {
    setForm((previous) => ({ ...previous, eeo: { ...previous.eeo, [key]: value } }));
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" />Application answers</CardTitle>
          <CardDescription>We use these answers to fill application forms for you — set once, we handle the rest.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" />Application answers</CardTitle>
        <CardDescription>We use these answers to fill application forms for you — set once, we handle the rest.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2" data-testid="application-answers-completeness">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Your application answers are {completeness.percent}% complete</span>
            <span className="text-xs text-muted-foreground">{completeness.filled}/{completeness.total} key answers</span>
          </div>
          <Progress value={completeness.percent} />
          {completeness.percent < 100 && (
            <p className="text-xs text-muted-foreground">Missing answers pause auto-apply until a human fills them in.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ap-phone">Phone</Label>
            <Input id="ap-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+1 555 123 4567" />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={form.country} onValueChange={(value) => set("country", value)}>
              <SelectTrigger><SelectValue placeholder="United States" /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-city">City</Label>
            <Input id="ap-city" value={form.city} onChange={(event) => set("city", event.target.value)} placeholder="Austin" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-linkedin">LinkedIn URL</Label>
            <Input id="ap-linkedin" value={form.linkedinUrl} onChange={(event) => set("linkedinUrl", event.target.value)} placeholder="https://www.linkedin.com/in/you" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-company">Current / most-recent company</Label>
            <Input id="ap-company" value={form.currentCompany} onChange={(event) => set("currentCompany", event.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-title">Current title</Label>
            <Input id="ap-title" value={form.currentTitle} onChange={(event) => set("currentTitle", event.target.value)} placeholder="Senior Data Analyst" />
          </div>
          <div className="space-y-2">
            <Label>Years of experience</Label>
            <Select value={form.yearsExperience} onValueChange={(value) => set("yearsExperience", value)}>
              <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
              <SelectContent>{YEARS_EXPERIENCE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option} years</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Work authorization</Label>
            <Select value={form.workAuthorization} onValueChange={(value) => set("workAuthorization", value)}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>{WORK_AUTHORIZATION_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Will you now or in the future require sponsorship?</Label>
            <Select value={form.requiresSponsorship} onValueChange={(value: "yes" | "no") => set("requiresSponsorship", value)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-salary">Expected salary <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="ap-salary" value={form.expectedSalary} onChange={(event) => set("expectedSalary", event.target.value)} placeholder="$140,000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-discovery">Default “How did you hear about us?”</Label>
            <Input id="ap-discovery" value={form.discoverySource} onChange={(event) => set("discoverySource", event.target.value)} placeholder="Job board" />
          </div>
        </div>

        <div className="flex items-start gap-3 border border-border p-4">
          <Checkbox id="ap-consent" checked={form.privacyConsent} onCheckedChange={(checked) => set("privacyConsent", checked === true)} />
          <Label htmlFor="ap-consent" className="text-sm font-normal leading-relaxed">
            I agree my application data may be processed by employers when the agent applies for me.
          </Label>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Voluntary demographic answers</p>
            <p className="text-xs text-muted-foreground">Optional US EEO questions. Every answer defaults to “Decline to self identify” and is only shared when an employer asks.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(EEO_LABELS) as (keyof EeoAnswers)[]).map((key) => (
              <div className="space-y-2" key={key}>
                <Label>{EEO_LABELS[key]}</Label>
                <Select value={form.eeo[key]} onValueChange={(value) => setEeo(key, value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EEO_OPTIONS[key].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="min-w-36">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save answers</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

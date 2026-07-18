import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, CreditCard, FileCheck2, Inbox, Loader2, LogOut, Mail, Save, Settings2, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSubscription } from "@/components/SubscriptionGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type ReviewMode = "always" | "eligible_only";
type OptimizationMode = "off" | "honest" | "aggressive";

interface SettingsState {
  agent_enabled: boolean;
  auto_apply_enabled: boolean;
  review_mode: ReviewMode;
  auto_apply_min_fit_score: number;
  daily_apply_cap: number;
  optimization_mode: OptimizationMode;
  memory: string;
}

const defaults: SettingsState = {
  agent_enabled: false,
  auto_apply_enabled: false,
  review_mode: "always",
  auto_apply_min_fit_score: 82,
  daily_apply_cap: 10,
  optimization_mode: "honest",
  memory: "",
};

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { plan, hasAutoApply } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [prefsResult, profileResult] = await Promise.all([
      supabase.from("user_job_prefs").select("agent_enabled,auto_apply_enabled,review_mode,auto_apply_min_fit_score,daily_apply_cap").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("job_preferences").eq("user_id", user.id).maybeSingle(),
    ]);
    const jobPreferences = (profileResult.data?.job_preferences || {}) as Record<string, unknown>;
    const application = (jobPreferences.application || {}) as Record<string, unknown>;
    const storedPolicy = (application.policy || {}) as Record<string, unknown>;
    setSettings({
      ...defaults,
      agent_enabled: storedPolicy.agent_enabled === true,
      auto_apply_enabled: storedPolicy.auto_apply_enabled === true,
      auto_apply_min_fit_score: Number(storedPolicy.auto_apply_min_fit_score || defaults.auto_apply_min_fit_score),
      daily_apply_cap: Number(storedPolicy.daily_apply_cap || defaults.daily_apply_cap),
      ...(prefsResult.data || {}),
      review_mode: prefsResult.data?.review_mode === "eligible_only" || (!prefsResult.data && storedPolicy.review_mode === "eligible_only") ? "eligible_only" : "always",
      optimization_mode: ["off", "honest", "aggressive"].includes(String(application.optimization_mode)) ? application.optimization_mode as OptimizationMode : "honest",
      memory: typeof application.memory === "string" ? application.memory : "",
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { data: profile } = await supabase.from("profiles").select("job_preferences").eq("user_id", user.id).maybeSingle();
    const current = (profile?.job_preferences || {}) as Record<string, unknown>;
    const profileResult = await supabase.from("profiles").upsert({
        user_id: user.id,
        job_preferences: {
          ...current,
          application: {
            optimization_mode: settings.optimization_mode,
            memory: settings.memory.trim(),
            policy: {
              agent_enabled: hasAutoApply ? settings.agent_enabled : false,
              auto_apply_enabled: hasAutoApply ? settings.auto_apply_enabled : false,
              review_mode: settings.review_mode,
              auto_apply_min_fit_score: Math.min(100, Math.max(50, settings.auto_apply_min_fit_score)),
              daily_apply_cap: Math.min(25, Math.max(1, settings.daily_apply_cap)),
            },
          },
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    void supabase.from("user_job_prefs").upsert({
        user_id: user.id,
        agent_enabled: hasAutoApply ? settings.agent_enabled : false,
        auto_apply_enabled: hasAutoApply ? settings.auto_apply_enabled : false,
        review_mode: settings.review_mode,
        auto_apply_min_fit_score: Math.min(100, Math.max(50, settings.auto_apply_min_fit_score)),
        daily_apply_cap: Math.min(25, Math.max(1, settings.daily_apply_cap)),
        auto_apply_portals: ["greenhouse"],
      }, { onConflict: "user_id" });
    setSaving(false);
    if (profileResult.error) {
      toast({ title: "Settings weren't saved", description: "Your previous settings are unchanged. Try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Settings saved", description: "New applications will follow this policy." });
  }

  if (loading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  const planLabel = plan === "autopilot" ? "Autopilot" : plan === "pro" ? "Pro" : "Free";
  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader title="Settings." status={`${planLabel.toLowerCase()} plan`} description="Control how ResumePreps matches, tailors, reviews, applies, and handles application email." />

      <div className="mt-7 space-y-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-primary" />Application policy</CardTitle><CardDescription>Choose how much work happens automatically and where you keep final control.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => setSettings((value) => ({ ...value, review_mode: "always", auto_apply_enabled: true }))} className={`border p-4 text-left ${settings.review_mode === "always" ? "border-primary bg-primary/5" : "border-border"}`}><ShieldCheck className="h-4 w-4 text-primary" /><p className="mt-3 text-sm font-semibold">Ask before submit</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Prepare the résumé, ATS check, cover note, and answers. You approve submission.</p></button>
              <button onClick={() => hasAutoApply ? setSettings((value) => ({ ...value, review_mode: "eligible_only", auto_apply_enabled: true, agent_enabled: true })) : navigate("/pricing")} className={`border p-4 text-left ${settings.review_mode === "eligible_only" ? "border-primary bg-primary/5" : "border-border"}`}><Bot className="h-4 w-4 text-primary" /><p className="mt-3 text-sm font-semibold">Apply strong matches automatically</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Queue supported jobs above your threshold. Missing or sensitive answers require review.</p></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Minimum career fit</Label><Input type="number" min={50} max={100} value={settings.auto_apply_min_fit_score} onChange={(event) => setSettings((value) => ({ ...value, auto_apply_min_fit_score: Number(event.target.value) }))} /></div>
              <div className="space-y-2"><Label>Daily submission limit</Label><Input type="number" min={1} max={25} value={settings.daily_apply_cap} onChange={(event) => setSettings((value) => ({ ...value, daily_apply_cap: Number(event.target.value) }))} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-primary" />Résumé optimization</CardTitle><CardDescription>All modes remain grounded in your real experience. ResumePreps never invents employers, dates, skills, or outcomes.</CardDescription></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-[240px_1fr]">
            <div className="space-y-2"><Label>Tailoring strength</Label><Select value={settings.optimization_mode} onValueChange={(value: OptimizationMode) => setSettings((current) => ({ ...current, optimization_mode: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Keep source wording</SelectItem><SelectItem value="honest">Truthful optimization</SelectItem><SelectItem value="aggressive">Maximum truthful alignment</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="memory">What the Agent should always remember</Label><textarea id="memory" value={settings.memory} onChange={(event) => setSettings((value) => ({ ...value, memory: event.target.value }))} placeholder="Example: Never apply to staffing agencies. Prefer healthcare data roles. Always ask before answering clearance questions." className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /><p className="text-xs text-muted-foreground">Use durable “always” and “never” rules. Job-specific choices still appear in the application record.</p></div>
          </CardContent>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4 text-primary" />Match preferences</CardTitle><CardDescription>Roles, locations, work modes, experience range, sponsorship, salary, and exclusions.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => navigate("/career-ops/preferences")}>Open match preferences</Button></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4 text-primary" />Application inbox</CardTitle><CardDescription>Manage read-only Gmail connection, verification codes, and employer updates.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => navigate("/inbox")}><Mail className="mr-2 h-4 w-4" />Open inbox settings</Button></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" />Plan and billing</CardTitle><CardDescription>{planLabel} plan. Usage limits are enforced before work is queued.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => navigate("/pricing")}>Review plans</Button></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LogOut className="h-4 w-4 text-primary" />Account</CardTitle><CardDescription>Signed in as {user?.email}</CardDescription></CardHeader><CardContent><Button variant="outline" className="text-destructive" onClick={async () => { await signOut(); navigate("/auth"); }}>Sign out</Button></CardContent></Card>
        </div>

        <div className="flex justify-end"><Button onClick={save} disabled={saving} className="min-w-36">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save settings</>}</Button></div>
      </div>
    </div>
  );
}

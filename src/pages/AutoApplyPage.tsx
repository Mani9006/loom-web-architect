import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap, Settings, BarChart3, Play, Pause, Loader2, Save,
  Briefcase, MapPin, DollarSign, Shield, ClipboardList, TrendingUp,
  CheckCircle2, Clock, XCircle, Mail,
} from "lucide-react";

interface UserPreferences {
  target_roles: string;
  target_locations: string;
  remote_preference: string;
  salary_min: string;
  salary_max: string;
  visa_status: string;
  sponsorship_needed: string;
  work_authorization: string;
  security_clearance: string;
  veteran_status: string;
  disability_disclosure: string;
  auto_apply_enabled: boolean;
  applications_per_week: string;
  excluded_companies: string;
}

interface ApplicationStat {
  status: string;
  count: number;
}

const defaultPreferences: UserPreferences = {
  target_roles: "",
  target_locations: "",
  remote_preference: "any",
  salary_min: "",
  salary_max: "",
  visa_status: "us_citizen",
  sponsorship_needed: "no",
  work_authorization: "yes",
  security_clearance: "none",
  veteran_status: "no",
  disability_disclosure: "prefer_not",
  auto_apply_enabled: false,
  applications_per_week: "50",
  excluded_companies: "",
};

export default function AutoApplyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ApplicationStat[]>([]);
  const [totalApplied, setTotalApplied] = useState(0);
  const [recentApplications, setRecentApplications] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadPreferences();
      loadStats();
    }
  }, [user]);

  const loadPreferences = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("job_preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.job_preferences && typeof data.job_preferences === "object") {
        setPreferences({ ...defaultPreferences, ...(data.job_preferences as any) });
      }
    } catch (err) {
      console.error("Failed to load preferences:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("tracked_jobs")
        .select("status")
        .eq("user_id", user.id);

      if (data) {
        const grouped = data.reduce((acc: Record<string, number>, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {});
        setStats(Object.entries(grouped).map(([status, count]) => ({ status, count })));
        setTotalApplied(data.length);
      }

      // Load recent applications
      const { data: recent } = await supabase
        .from("tracked_jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (recent) setRecentApplications(recent);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const savePreferences = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          job_preferences: preferences as any,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;
      toast({ title: "Preferences saved", description: "Your AutoApply settings have been updated." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "applied": return <Clock className="w-4 h-4 text-blue-500" />;
      case "interviewing": return <TrendingUp className="w-4 h-4 text-amber-500" />;
      case "offer": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "rejected": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <ClipboardList className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "applied": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "interviewing": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "offer": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" />
              AutoApply
            </h1>
            <p className="text-muted-foreground mt-1">
              Automatically apply to matching jobs while you sleep
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={preferences.auto_apply_enabled}
                onCheckedChange={(checked) =>
                  setPreferences((p) => ({ ...p, auto_apply_enabled: checked }))
                }
              />
              <span className="text-sm font-medium">
                {preferences.auto_apply_enabled ? (
                  <span className="text-green-600 flex items-center gap-1"><Play className="w-3.5 h-3.5" /> Active</span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1"><Pause className="w-3.5 h-3.5" /> Paused</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{totalApplied}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Applied</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-500">
                {stats.find((s) => s.status === "Interviewing")?.count || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Interviewing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-500">
                {stats.find((s) => s.status === "Offer")?.count || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Offers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-muted-foreground">
                {preferences.applications_per_week || 50}/wk
              </p>
              <p className="text-xs text-muted-foreground mt-1">Target Rate</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings" className="gap-2"><Settings className="w-4 h-4" /> Settings</TabsTrigger>
            <TabsTrigger value="activity" className="gap-2"><ClipboardList className="w-4 h-4" /> Activity</TabsTrigger>
            <TabsTrigger value="stats" className="gap-2"><BarChart3 className="w-4 h-4" /> Insights</TabsTrigger>
          </TabsList>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-6">
            {/* Job Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Briefcase className="w-5 h-5 text-primary" />
                  Job Preferences
                </CardTitle>
                <CardDescription>What kind of jobs should we apply to?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>Target Roles (comma separated)</Label>
                    <Input
                      placeholder="Software Engineer, Full Stack Developer, React Developer"
                      value={preferences.target_roles}
                      onChange={(e) => setPreferences((p) => ({ ...p, target_roles: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Locations (comma separated)</Label>
                    <Input
                      placeholder="San Francisco, New York, Remote"
                      value={preferences.target_locations}
                      onChange={(e) => setPreferences((p) => ({ ...p, target_locations: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Work Preference</Label>
                    <Select value={preferences.remote_preference} onValueChange={(v) => setPreferences((p) => ({ ...p, remote_preference: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any (Remote, Hybrid, Onsite)</SelectItem>
                        <SelectItem value="remote">Remote Only</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="onsite">Onsite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Applications Per Week</Label>
                    <Select value={preferences.applications_per_week} onValueChange={(v) => setPreferences((p) => ({ ...p, applications_per_week: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25 per week</SelectItem>
                        <SelectItem value="50">50 per week</SelectItem>
                        <SelectItem value="100">100 per week</SelectItem>
                        <SelectItem value="200">200 per week</SelectItem>
                        <SelectItem value="400">400 per week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>Minimum Salary ($)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        placeholder="80000"
                        className="pl-10"
                        value={preferences.salary_min}
                        onChange={(e) => setPreferences((p) => ({ ...p, salary_min: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum Salary ($)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        placeholder="150000"
                        className="pl-10"
                        value={preferences.salary_max}
                        onChange={(e) => setPreferences((p) => ({ ...p, salary_max: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Excluded Companies (comma separated)</Label>
                  <Input
                    placeholder="Company A, Company B"
                    value={preferences.excluded_companies}
                    onChange={(e) => setPreferences((p) => ({ ...p, excluded_companies: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Visa & Immigration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="w-5 h-5 text-primary" />
                  Visa & Immigration
                </CardTitle>
                <CardDescription>These answers auto-fill on job applications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>Visa Status</Label>
                    <Select value={preferences.visa_status} onValueChange={(v) => setPreferences((p) => ({ ...p, visa_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us_citizen">US Citizen</SelectItem>
                        <SelectItem value="green_card">Green Card Holder</SelectItem>
                        <SelectItem value="ead">EAD / Work Permit</SelectItem>
                        <SelectItem value="h1b">H-1B Visa</SelectItem>
                        <SelectItem value="opt">OPT / CPT</SelectItem>
                        <SelectItem value="tn">TN Visa</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Authorized to work in the US?</Label>
                    <Select value={preferences.work_authorization} onValueChange={(v) => setPreferences((p) => ({ ...p, work_authorization: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Require sponsorship now or in future?</Label>
                    <Select value={preferences.sponsorship_needed} onValueChange={(v) => setPreferences((p) => ({ ...p, sponsorship_needed: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes_now">Yes, now</SelectItem>
                        <SelectItem value="yes_future">Yes, in the future</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Security Clearance</Label>
                    <Select value={preferences.security_clearance} onValueChange={(v) => setPreferences((p) => ({ ...p, security_clearance: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="confidential">Confidential</SelectItem>
                        <SelectItem value="secret">Secret</SelectItem>
                        <SelectItem value="top_secret">Top Secret</SelectItem>
                        <SelectItem value="ts_sci">TS/SCI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Veteran Status</Label>
                    <Select value={preferences.veteran_status} onValueChange={(v) => setPreferences((p) => ({ ...p, veteran_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">Not a veteran</SelectItem>
                        <SelectItem value="yes">Yes, I am a veteran</SelectItem>
                        <SelectItem value="prefer_not">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Disability Disclosure</Label>
                    <Select value={preferences.disability_disclosure} onValueChange={(v) => setPreferences((p) => ({ ...p, disability_disclosure: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No disability</SelectItem>
                        <SelectItem value="yes">Yes, I have a disability</SelectItem>
                        <SelectItem value="prefer_not">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mail className="w-5 h-5 text-primary" />
                  Application Email Tracking
                </CardTitle>
                <CardDescription>Track application confirmations automatically</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-xl bg-muted/50 border border-dashed">
                  <p className="text-sm text-muted-foreground">
                    Email alias tracking is coming soon. We'll create a unique forwarding alias
                    (e.g., you+apply@resumepreps.com) that routes confirmation emails to your inbox
                    and auto-updates your application dashboard.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={savePreferences} disabled={saving} size="lg" className="gap-2 px-8">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save All Settings
              </Button>
            </div>
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Applications</CardTitle>
                <CardDescription>Jobs applied to via AutoApply and manual tracking</CardDescription>
              </CardHeader>
              <CardContent>
                {recentApplications.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No applications yet</p>
                    <p className="text-sm mt-1">Applications will appear here as they're submitted</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentApplications.map((app) => (
                      <div key={app.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(app.status)}
                          <div>
                            <p className="font-medium text-sm">{app.title}</p>
                            <p className="text-xs text-muted-foreground">{app.company}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={getStatusColor(app.status)}>
                            {app.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(app.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* STATS TAB */}
          <TabsContent value="stats" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Application Insights</CardTitle>
                <CardDescription>Track your application pipeline performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {["Saved", "Applied", "Interviewing", "Offer", "Rejected"].map((status) => {
                    const count = stats.find((s) => s.status === status)?.count || 0;
                    return (
                      <div key={status} className="text-center p-4 rounded-xl bg-muted/30">
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground mt-1">{status}</p>
                      </div>
                    );
                  })}
                </div>
                {totalApplied > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
                    <h4 className="font-medium text-sm mb-2">Conversion Rates</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Interview Rate: </span>
                        <span className="font-medium">
                          {((stats.find((s) => s.status === "Interviewing")?.count || 0) / Math.max(totalApplied, 1) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Offer Rate: </span>
                        <span className="font-medium">
                          {((stats.find((s) => s.status === "Offer")?.count || 0) / Math.max(totalApplied, 1) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

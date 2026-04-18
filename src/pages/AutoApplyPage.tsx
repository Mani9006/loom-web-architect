import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isOwnerEmail } from "@/lib/admin";
import { useToast } from "@/hooks/use-toast";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap, Settings, BarChart3, Loader2, Save, Upload,
  Briefcase, MapPin, DollarSign, Shield, ClipboardList, TrendingUp,
  CheckCircle2, Clock, XCircle, FileText, User, GraduationCap,
  Wrench, AlertCircle, Building2, Sparkles, Send, ChevronRight, Crown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSubscription } from "@/components/SubscriptionGate";
import { cn } from "@/lib/utils";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { JOB_ROLES, COMMON_SKILLS } from "@/data/job-roles";

// ─── Types ───
interface ProfileData {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  target_role: string;
  desired_roles: string[];
  seniority_level: string;
  years_of_experience: number;
  skills: string[];
  education_level: string;
  preferred_work_type: string;
  desired_locations: string[];
  salary_expectations: any;
  work_authorization: string;
  languages_spoken: string[];
  blacklisted_companies: string[];
  profile_completeness: number;
  profile_setup_completed: boolean;
  resume_json: any;
}

interface ResumeScore {
  score: number;
  issues: { type: string; message: string; severity: string }[];
  suggestions: string[];
}

interface MatchedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  match_score: number;
  match_reasons: any;
  applied?: boolean;
}

// ─── Component ───
export default function AutoApplyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isPremium, loading: subLoading } = useSubscription();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = usePersistedState("autoApply.activeTab", "setup", "sessionStorage");
  const [setupStep, setSetupStep] = useState(0);
  const [profileComplete, setProfileComplete] = useState(false);

  // Profile fields
  const [profile, setProfile] = useState<Partial<ProfileData>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeScore, setResumeScore] = useState<ResumeScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // Skills input
  const [skillInput, setSkillInput] = useState("");
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false);

  // Role/skill suggestions
  const filteredRoleSuggestions = useMemo(() => {
    if (!profile.target_role?.trim()) return [];
    const lower = profile.target_role.toLowerCase();
    return JOB_ROLES.filter((r) => r.toLowerCase().includes(lower)).slice(0, 10);
  }, [profile.target_role]);

  const filteredSkillSuggestions = useMemo(() => {
    if (!skillInput.trim()) return [];
    const lower = skillInput.toLowerCase();
    const existing = new Set((profile.skills || []).map((s) => s.toLowerCase()));
    return COMMON_SKILLS.filter(
      (s) => s.toLowerCase().includes(lower) && !existing.has(s.toLowerCase())
    ).slice(0, 10);
  }, [skillInput, profile.skills]);

  // Jobs
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<MatchedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: user.email || "",
          phone: (data as any).phone || "",
          location: (data as any).location || "",
          linkedin_url: (data as any).linkedin_url || "",
          target_role: data.target_role || "",
          desired_roles: (data as any).desired_roles || [],
          seniority_level: (data as any).seniority_level || "mid",
          years_of_experience: (data as any).years_of_experience || 0,
          skills: (data as any).skills || [],
          education_level: (data as any).education_level || "",
          preferred_work_type: (data as any).preferred_work_type || "any",
          desired_locations: (data as any).desired_locations || [],
          salary_expectations: (data as any).salary_expectations || {},
          work_authorization: (data as any).work_authorization || "us_citizen",
          languages_spoken: (data as any).languages_spoken || ["English"],
          blacklisted_companies: (data as any).blacklisted_companies || [],
          profile_completeness: (data as any).profile_completeness || 0,
          profile_setup_completed: (data as any).profile_setup_completed || false,
          resume_json: (data as any).resume_json || null,
        });
        setProfileComplete(!!(data as any).profile_setup_completed);

        if ((data as any).profile_setup_completed) {
          setActiveTab("jobs");
          loadJobs();
          loadApplied();
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Resume Upload + Parse ───
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setResumeParsing(true);

    try {
      // Read file as text
      const text = await file.text();

      // Call parse-document edge function
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({ text, type: "resume" }),
        }
      );

      if (response.ok) {
        const parsed = await response.json();
        // Auto-fill profile from parsed resume
        if (parsed.personal_info) {
          setProfile((prev) => ({
            ...prev,
            full_name: parsed.personal_info.name || prev.full_name,
            email: parsed.personal_info.email || prev.email,
            phone: parsed.personal_info.phone || prev.phone,
            location: parsed.personal_info.location || prev.location,
            linkedin_url: parsed.personal_info.linkedin || prev.linkedin_url,
            target_role: parsed.personal_info.jobTitle || prev.target_role,
          }));
        }
        if (parsed.skills && Array.isArray(parsed.skills)) {
          const allSkills = parsed.skills.flatMap((s: any) =>
            typeof s === "string" ? [s] : s.items || []
          );
          setProfile((prev) => ({ ...prev, skills: [...new Set([...(prev.skills || []), ...allSkills])] }));
        }
        if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
          const edu = parsed.education[0];
          setProfile((prev) => ({ ...prev, education_level: edu.degree || prev.education_level }));
        }
        setProfile((prev) => ({ ...prev, resume_json: parsed }));
        toast({ title: "Resume parsed!", description: "Profile fields auto-filled from your resume" });
      } else {
        // Fallback: just store raw text
        setProfile((prev) => ({ ...prev, resume_json: { raw_text: text } }));
        toast({ title: "Resume uploaded", description: "Could not auto-parse. Please fill in fields manually." });
      }
    } catch (err) {
      console.error("Resume parse error:", err);
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    } finally {
      setResumeParsing(false);
    }
  };

  // ─── Validation ───
  const validateProfile = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!profile.full_name?.trim()) newErrors.full_name = "Full name is required";
    if (!profile.email?.trim()) newErrors.email = "Email is required";
    if (!profile.target_role?.trim()) newErrors.target_role = "Target role is required";
    if (!profile.skills || profile.skills.length === 0) newErrors.skills = "Add at least one skill";
    if (!profile.location?.trim()) newErrors.location = "Location is required";
    if (!profile.work_authorization) newErrors.work_authorization = "Work authorization is required";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast({ title: "Missing required fields", description: "Please fill in all highlighted fields", variant: "destructive" });
      return false;
    }
    return true;
  };

  // ─── Save Profile ───
  const saveProfile = async (markComplete = false) => {
    if (!user) return;
    if (markComplete && !validateProfile()) return;

    setSaving(true);
    try {
      const completeness = calculateCompleteness();
      const { error } = await (supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          location: profile.location,
          target_role: profile.target_role,
          desired_roles: profile.desired_roles as any,
          seniority_level: profile.seniority_level as any,
          years_of_experience: profile.years_of_experience as any,
          skills: profile.skills as any,
          education_level: profile.education_level as any,
          preferred_work_type: profile.preferred_work_type as any,
          desired_locations: profile.desired_locations as any,
          salary_expectations: profile.salary_expectations as any,
          work_authorization: profile.work_authorization as any,
          languages_spoken: profile.languages_spoken as any,
          blacklisted_companies: profile.blacklisted_companies as any,
          linkedin_url: profile.linkedin_url as any,
          resume_json: profile.resume_json as any,
          profile_completeness: completeness as any,
          profile_setup_completed: markComplete || profile.profile_setup_completed as any,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("user_id", user.id) as any);

      if (error) throw error;

      if (markComplete) {
        setProfileComplete(true);
        setActiveTab("jobs");
        toast({ title: "Profile complete!", description: "Loading matching jobs..." });
        loadJobs();
      } else {
        toast({ title: "Saved" });
      }
    } catch (err) {
      console.error("Save error:", err);
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const calculateCompleteness = () => {
    let score = 0;
    if (profile.full_name) score += 10;
    if (profile.email) score += 5;
    if (profile.location) score += 10;
    if (profile.target_role) score += 15;
    if (profile.skills && profile.skills.length > 0) score += 15;
    if (profile.education_level) score += 10;
    if (profile.years_of_experience) score += 10;
    if (profile.work_authorization) score += 10;
    if (profile.resume_json) score += 15;
    return Math.min(score, 100);
  };

  // ─── Resume Score ───
  const computeResumeScore = async () => {
    if (!user || !profile.resume_json) return;
    setScoreLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-score`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({ resumeData: profile.resume_json, targetRole: profile.target_role }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setResumeScore(data);
      }
    } catch (err) {
      console.error("Score error:", err);
    } finally {
      setScoreLoading(false);
    }
  };

  // ─── Load Jobs ───
  const loadJobs = async () => {
    if (!user) return;
    setJobsLoading(true);
    try {
      // First try to trigger match computation
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || anonKey}` },
          body: JSON.stringify({ user_id: user.id }),
        }
      ).catch(() => {});

      // Load matched jobs
      const { data: matches } = await supabase
        .from("job_matches")
        .select(`match_score, match_reasons, job_id, dismissed, jobs (*)`)
        .eq("user_id", user.id)
        .eq("dismissed", false)
        .order("match_score", { ascending: false })
        .limit(100);

      if (matches) {
        const mapped = (matches as any[])
          .filter((m) => m.jobs)
          .map((m) => ({
            id: m.jobs.id,
            title: m.jobs.title,
            company: m.jobs.company,
            location: m.jobs.location || "Unknown",
            description: m.jobs.description || "",
            match_score: m.match_score,
            match_reasons: m.match_reasons,
            applied: false,
          }));
        setMatchedJobs(mapped);
      }
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setJobsLoading(false);
    }
  };

  const loadApplied = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("job_applications")
      .select("job_id, title, company, status, applied_at")
      .eq("user_id", user.id)
      .order("applied_at", { ascending: false })
      .limit(50);

    if (data) {
      setAppliedJobs(data.map((a: any) => ({
        id: a.job_id || a.id,
        title: a.title,
        company: a.company,
        location: "",
        description: "",
        match_score: 0,
        match_reasons: null,
        applied: true,
        status: a.status,
        applied_at: a.applied_at,
      })) as any[]);
    }
  };

  // ─── Auto Apply ───
  const handleAutoApply = async (job: MatchedJob) => {
    if (!user) return;
    setApplyingJobId(job.id);
    try {
      // Record the application
      await supabase.from("job_applications").upsert({
        user_id: user.id,
        job_id: job.id,
        title: job.title,
        company: job.company,
        status: "applied",
        applied_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,job_id" });

      // Move job from available to applied
      setMatchedJobs((prev) => prev.filter((j) => j.id !== job.id));
      setAppliedJobs((prev) => [{ ...job, applied: true }, ...prev]);

      toast({ title: "Application submitted!", description: `Applied to ${job.title} at ${job.company}` });
    } catch (err) {
      console.error("Apply error:", err);
      toast({ title: "Application failed", variant: "destructive" });
    } finally {
      setApplyingJobId(null);
    }
  };

  // ─── Skills Management ───
  const addSkill = () => {
    if (!skillInput.trim()) return;
    setProfile((prev) => ({
      ...prev,
      skills: [...new Set([...(prev.skills || []), skillInput.trim()])],
    }));
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setProfile((prev) => ({
      ...prev,
      skills: (prev.skills || []).filter((s) => s !== skill),
    }));
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Owner + admin bypass: always open for the account owner so we can test
  // Auto-Apply end-to-end without a paid subscription.
  const isOwnerOrAdmin = isOwnerEmail(user?.email) || (user as { isAdmin?: boolean } | null)?.isAdmin;

  // Premium gate for Auto Apply
  if (!subLoading && !isPremium && !isOwnerOrAdmin) {
    return (
      <div className="bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto p-4 sm:p-6">
          <Card className="border-2 border-amber-200 bg-amber-50">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <Crown className="w-6 h-6 text-amber-600" />
                <CardTitle className="text-2xl text-amber-900">Premium Feature</CardTitle>
              </div>
              <CardDescription className="text-amber-800 text-base">
                Auto-Apply automatically submits applications to matched jobs on your behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-white rounded-lg p-4 space-y-3">
                <p className="font-semibold text-sm text-gray-700">What you get:</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    AI-optimized applications
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    Apply to 50+ jobs per day
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    Smart targeting based on your profile
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Link to="/pricing" className="flex-1">
                  <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" size="lg">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Premium — $120/mo
                  </Button>
                </Link>
              </div>

              <p className="text-sm text-gray-600 text-center">
                Currently on Free plan · Manual apply is always available
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Auto Apply
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {profileComplete
              ? "AI-matched jobs ready for automatic application"
              : "Complete your profile to start auto-applying"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup" className="gap-1.5"><User className="w-4 h-4" /> Profile</TabsTrigger>
            <TabsTrigger value="score" className="gap-1.5" disabled={!profile.resume_json}><FileText className="w-4 h-4" /> Resume Score</TabsTrigger>
            <TabsTrigger value="jobs" className="gap-1.5" disabled={!profileComplete}><Briefcase className="w-4 h-4" /> Available Jobs</TabsTrigger>
            <TabsTrigger value="applied" className="gap-1.5" disabled={!profileComplete}><ClipboardList className="w-4 h-4" /> Applied</TabsTrigger>
          </TabsList>

          {/* ═══ PROFILE SETUP TAB ═══ */}
          <TabsContent value="setup" className="space-y-5 mt-4">
            {/* Step 1: Resume Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="w-5 h-5 text-primary" />
                  Step 1: Upload Resume
                </CardTitle>
                <CardDescription>Upload your resume to auto-fill profile fields</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleResumeUpload} disabled={resumeParsing} className="flex-1" />
                  {resumeParsing && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                  {profile.resume_json && !resumeParsing && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Parsed</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Personal Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="w-5 h-5 text-primary" />
                  Step 2: Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className={errors.full_name ? "text-destructive" : ""}>Full Name *</Label>
                    <Input value={profile.full_name || ""} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} className={errors.full_name ? "border-destructive" : ""} />
                    {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input value={profile.email || ""} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={profile.phone || ""} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={errors.location ? "text-destructive" : ""}>Location *</Label>
                    <LocationAutocomplete
                      value={profile.location || ""}
                      onChange={(v) => setProfile((p) => ({ ...p, location: v }))}
                      placeholder="City, State (US only)"
                      error={!!errors.location}
                    />
                    {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>LinkedIn URL</Label>
                    <Input value={profile.linkedin_url || ""} onChange={(e) => setProfile((p) => ({ ...p, linkedin_url: e.target.value }))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Job Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Briefcase className="w-5 h-5 text-primary" />
                  Step 3: Job Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 relative">
                    <Label className={errors.target_role ? "text-destructive" : ""}>Target Role *</Label>
                    <Input
                      placeholder="e.g. Software Engineer"
                      value={profile.target_role || ""}
                      onChange={(e) => { setProfile((p) => ({ ...p, target_role: e.target.value })); setShowRoleSuggestions(true); }}
                      onFocus={() => { if (profile.target_role) setShowRoleSuggestions(true); }}
                      onBlur={() => { setTimeout(() => setShowRoleSuggestions(false), 150); }}
                      className={errors.target_role ? "border-destructive" : ""}
                      autoComplete="off"
                    />
                    {showRoleSuggestions && filteredRoleSuggestions.length > 0 && (
                      <ul className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                        {filteredRoleSuggestions.map((role) => (
                          <li
                            key={role}
                            onMouseDown={(e) => { e.preventDefault(); setProfile((p) => ({ ...p, target_role: role })); setShowRoleSuggestions(false); }}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            {role}
                          </li>
                        ))}
                      </ul>
                    )}
                    {errors.target_role && <p className="text-xs text-destructive">{errors.target_role}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Seniority Level</Label>
                    <Select value={profile.seniority_level || "mid"} onValueChange={(v) => setProfile((p) => ({ ...p, seniority_level: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="intern">Intern</SelectItem>
                        <SelectItem value="junior">Junior</SelectItem>
                        <SelectItem value="mid">Mid-Level</SelectItem>
                        <SelectItem value="senior">Senior</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="director">Director</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Years of Experience</Label>
                    <Input type="number" value={profile.years_of_experience || ""} onChange={(e) => setProfile((p) => ({ ...p, years_of_experience: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Work Type</Label>
                    <Select value={profile.preferred_work_type || "any"} onValueChange={(v) => setProfile((p) => ({ ...p, preferred_work_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="onsite">Onsite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Min Salary ($)</Label>
                    <Input type="number" placeholder="80000" value={profile.salary_expectations?.min || ""} onChange={(e) => setProfile((p) => ({ ...p, salary_expectations: { ...p.salary_expectations, min: parseInt(e.target.value) || 0 } }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Salary ($)</Label>
                    <Input type="number" placeholder="150000" value={profile.salary_expectations?.max || ""} onChange={(e) => setProfile((p) => ({ ...p, salary_expectations: { ...p.salary_expectations, max: parseInt(e.target.value) || 0 } }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Education</Label>
                  <Select value={profile.education_level || ""} onValueChange={(v) => setProfile((p) => ({ ...p, education_level: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select education level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high_school">High School</SelectItem>
                      <SelectItem value="associate">Associate's</SelectItem>
                      <SelectItem value="bachelor">Bachelor's</SelectItem>
                      <SelectItem value="master">Master's</SelectItem>
                      <SelectItem value="phd">PhD</SelectItem>
                      <SelectItem value="bootcamp">Bootcamp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Step 4: Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wrench className="w-5 h-5 text-primary" />
                  Step 4: Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 relative">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Type to search skills..."
                      value={skillInput}
                      onChange={(e) => { setSkillInput(e.target.value); setShowSkillSuggestions(true); }}
                      onFocus={() => { if (skillInput) setShowSkillSuggestions(true); }}
                      onBlur={() => { setTimeout(() => setShowSkillSuggestions(false), 150); }}
                      onKeyDown={(e) => { if (e.key === "Enter") addSkill(); }}
                      className={errors.skills ? "border-destructive" : ""}
                      autoComplete="off"
                    />
                    {showSkillSuggestions && filteredSkillSuggestions.length > 0 && (
                      <ul className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                        {filteredSkillSuggestions.map((skill) => (
                          <li
                            key={skill}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setProfile((prev) => ({ ...prev, skills: [...new Set([...(prev.skills || []), skill])] }));
                              setSkillInput("");
                              setShowSkillSuggestions(false);
                            }}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            {skill}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button onClick={addSkill} size="sm">Add</Button>
                </div>
                {errors.skills && <p className="text-xs text-destructive">{errors.skills}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {(profile.skills || []).map((skill) => (
                    <Badge key={skill} variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => removeSkill(skill)}>
                      {skill} <XCircle className="w-3 h-3" />
                    </Badge>
                  ))}
                  {(profile.skills || []).length === 0 && <p className="text-xs text-muted-foreground">No skills added yet — type to search or add custom skills</p>}
                </div>
                {/* Quick add popular skills */}
                {(profile.skills || []).length < 5 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Quick add:</p>
                    <div className="flex flex-wrap gap-1">
                      {["JavaScript", "Python", "React", "SQL", "AWS", "TypeScript", "Java", "Node.js", "Docker", "Git", "Agile", "Communication"].filter((s) => !(profile.skills || []).includes(s)).slice(0, 8).map((skill) => (
                        <Badge
                          key={skill}
                          variant="outline"
                          className="text-xs cursor-pointer hover:bg-primary/10"
                          onClick={() => setProfile((prev) => ({ ...prev, skills: [...new Set([...(prev.skills || []), skill])] }))}
                        >
                          + {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 5: Work Authorization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="w-5 h-5 text-primary" />
                  Step 5: Work Authorization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className={errors.work_authorization ? "text-destructive" : ""}>Authorization *</Label>
                    <Select value={profile.work_authorization || ""} onValueChange={(v) => setProfile((p) => ({ ...p, work_authorization: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us_citizen">US Citizen</SelectItem>
                        <SelectItem value="green_card">Green Card</SelectItem>
                        <SelectItem value="h1b">H-1B Visa</SelectItem>
                        <SelectItem value="opt">OPT / CPT</SelectItem>
                        <SelectItem value="ead">EAD / Work Permit</SelectItem>
                        <SelectItem value="tn">TN Visa</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Completeness + Save */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Profile Completeness</span>
                  <span className="text-sm font-bold">{calculateCompleteness()}%</span>
                </div>
                <Progress value={calculateCompleteness()} className="h-2" />
                <div className="flex gap-3 mt-4">
                  <Button onClick={() => saveProfile(false)} disabled={saving} variant="outline" className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Draft
                  </Button>
                  <Button onClick={() => saveProfile(true)} disabled={saving} className="gap-2 flex-1">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Complete Profile & Find Jobs
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ RESUME SCORE TAB ═══ */}
          <TabsContent value="score" className="space-y-5 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Resume Score Analysis
                </CardTitle>
                <CardDescription>See how your resume scores against ATS systems</CardDescription>
              </CardHeader>
              <CardContent>
                {!resumeScore && (
                  <div className="text-center py-8">
                    <Button onClick={computeResumeScore} disabled={scoreLoading || !profile.resume_json} className="gap-2">
                      {scoreLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                      Analyze Resume
                    </Button>
                    {!profile.resume_json && <p className="text-xs text-muted-foreground mt-2">Upload a resume first</p>}
                  </div>
                )}
                {resumeScore && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className={cn("text-5xl font-bold", scoreColor(resumeScore.score))}>{resumeScore.score}</p>
                      <p className="text-sm text-muted-foreground mt-1">out of 100</p>
                    </div>
                    {resumeScore.issues && resumeScore.issues.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Issues Found</h4>
                        {resumeScore.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                            <AlertCircle className={cn("w-4 h-4 mt-0.5 shrink-0", issue.severity === "critical" ? "text-red-500" : issue.severity === "warning" ? "text-amber-500" : "text-blue-500")} />
                            <p className="text-sm">{issue.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {resumeScore.suggestions && resumeScore.suggestions.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Suggestions</h4>
                        {resumeScore.suggestions.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-primary/5">
                            <Sparkles className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                            <p className="text-sm">{s}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Edit your resume in the Resume Builder to improve your score.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ AVAILABLE JOBS TAB ═══ */}
          <TabsContent value="jobs" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{matchedJobs.length} matching jobs</h3>
              <Button variant="outline" size="sm" onClick={loadJobs} disabled={jobsLoading} className="gap-1.5">
                {jobsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Refresh Matches
              </Button>
            </div>

            {jobsLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}><CardContent className="p-4"><div className="flex gap-3"><Skeleton className="w-12 h-12 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-full" /></div></div></CardContent></Card>
                ))}
              </div>
            )}

            {!jobsLoading && matchedJobs.length === 0 && (
              <div className="text-center py-12">
                <Briefcase className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <h4 className="font-medium">No matching jobs yet</h4>
                <p className="text-sm text-muted-foreground mt-1">Make sure your profile is complete, then click "Refresh Matches"</p>
              </div>
            )}

            {!jobsLoading && matchedJobs.map((job) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className={cn("w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0", scoreColor(job.match_score), "bg-muted")}>
                      <span className="text-lg font-bold">{job.match_score}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold">{job.title}</h4>
                          <p className="text-sm text-muted-foreground">{job.company}</p>
                        </div>
                        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => handleAutoApply(job)} disabled={applyingJobId === job.id}>
                          {applyingJobId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Apply Automatically
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge variant="secondary" className="text-xs gap-1"><MapPin className="w-3 h-3" /> {job.location}</Badge>
                      </div>
                      {job.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
                      )}
                      {job.match_reasons?.details && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {job.match_reasons.details.slice(0, 3).map((r: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] gap-1"><Sparkles className="w-2.5 h-2.5" /> {r}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ═══ APPLIED JOBS TAB ═══ */}
          <TabsContent value="applied" className="space-y-4 mt-4">
            <h3 className="font-medium">{appliedJobs.length} applications submitted</h3>

            {appliedJobs.length === 0 && (
              <div className="text-center py-12">
                <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <h4 className="font-medium">No applications yet</h4>
                <p className="text-sm text-muted-foreground mt-1">Go to Available Jobs and click "Apply Automatically"</p>
              </div>
            )}

            {appliedJobs.map((job: any) => (
              <Card key={job.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{job.title}</h4>
                      <p className="text-sm text-muted-foreground">{job.company}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> {job.status || "Applied"}
                      </Badge>
                      {job.applied_at && (
                        <span className="text-xs text-muted-foreground">{new Date(job.applied_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

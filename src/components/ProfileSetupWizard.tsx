import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import {
  User, Target, Zap, MapPin, Shield, GraduationCap, Briefcase,
  FileText, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, Plus, X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const STEPS = [
  { icon: User, label: "General Info", desc: "Your basic profile" },
  { icon: Target, label: "Target Roles", desc: "What roles are you pursuing?" },
  { icon: Zap, label: "Skills", desc: "Your technical & soft skills" },
  { icon: MapPin, label: "Work Preferences", desc: "Location, type & salary" },
  { icon: Shield, label: "Work Authorization", desc: "Visa & work status" },
  { icon: GraduationCap, label: "Education", desc: "Degrees & certs" },
  { icon: Briefcase, label: "Experience", desc: "Your career summary" },
  { icon: FileText, label: "Resume & Score", desc: "Upload & analyze" },
];

const SENIORITY_LEVELS = ["Entry Level", "Mid Level", "Senior", "Lead", "Staff", "Principal", "Executive"];
const WORK_TYPES = ["Remote", "Hybrid", "On-site"];
const EDUCATION_LEVELS = ["High School", "Associate's", "Bachelor's", "Master's", "PhD", "Bootcamp", "Self-taught"];
const WORK_AUTH_OPTIONS = ["US Citizen", "Green Card", "H1B Visa", "OPT/CPT", "L1 Visa", "TN Visa", "Other Visa", "No Authorization"];
const COMMON_SKILLS = [
  "JavaScript", "TypeScript", "Python", "React", "Node.js", "SQL", "AWS", "Docker",
  "Java", "C++", "Go", "Rust", "Kubernetes", "GraphQL", "MongoDB", "PostgreSQL",
  "Machine Learning", "Data Analysis", "Product Management", "UI/UX Design",
  "Agile/Scrum", "Leadership", "Communication", "Problem Solving",
];

export function ProfileSetupWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);

  // Form state
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin_url: "",
    // Roles
    desired_roles: [] as string[],
    seniority_level: "",
    years_of_experience: 0,
    // Skills
    skills: [] as string[],
    // Work prefs
    preferred_work_type: [] as string[],
    desired_locations: [] as string[],
    salary_min: 0,
    salary_max: 0,
    // Auth
    work_authorization: "",
    // Education
    education_level: "",
    // Experience
    experience_summary: "",
    // Blacklist
    blacklisted_companies: [] as string[],
  });

  const [newRole, setNewRole] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newBlacklist, setNewBlacklist] = useState("");

  // Load existing profile
  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setProfile((p) => ({
        ...p,
        full_name: data.full_name || "",
        email: data.email || "",
        phone: data.phone || "",
        location: data.location || "",
        linkedin_url: (data as any).linkedin_url || "",
        desired_roles: (data as any).desired_roles || [],
        seniority_level: (data as any).seniority_level || "",
        years_of_experience: (data as any).years_of_experience || 0,
        skills: (data as any).skills || [],
        preferred_work_type: (data as any).preferred_work_type || [],
        desired_locations: (data as any).desired_locations || [],
        salary_min: (data as any).salary_expectations?.min || 0,
        salary_max: (data as any).salary_expectations?.max || 0,
        work_authorization: (data as any).work_authorization || "",
        education_level: (data as any).education_level || "",
        blacklisted_companies: (data as any).blacklisted_companies || [],
      }));
    }
  };

  const calcCompleteness = () => {
    let score = 0;
    if (profile.full_name) score += 10;
    if (profile.email) score += 5;
    if (profile.phone) score += 5;
    if (profile.location) score += 10;
    if (profile.desired_roles.length > 0) score += 15;
    if (profile.seniority_level) score += 5;
    if (profile.skills.length > 0) score += 15;
    if (profile.preferred_work_type.length > 0) score += 10;
    if (profile.work_authorization) score += 5;
    if (profile.education_level) score += 5;
    if (profile.years_of_experience > 0) score += 5;
    if (resumeUploaded) score += 10;
    return Math.min(score, 100);
  };

  const saveStep = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const completeness = calcCompleteness();
      await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          target_role: profile.desired_roles[0] || null,
          job_preferences: {
            location: profile.desired_locations[0] || "",
            jobTypes: profile.preferred_work_type,
            experienceLevel: profile.seniority_level,
            salary_min: profile.salary_min,
            salary_max: profile.salary_max,
          } as any,
          linkedin_url: profile.linkedin_url,
          desired_roles: profile.desired_roles,
          seniority_level: profile.seniority_level,
          years_of_experience: profile.years_of_experience,
          skills: profile.skills,
          preferred_work_type: profile.preferred_work_type,
          desired_locations: profile.desired_locations,
          salary_expectations: { min: profile.salary_min, max: profile.salary_max, currency: "USD" },
          work_authorization: profile.work_authorization,
          education_level: profile.education_level,
          blacklisted_companies: profile.blacklisted_companies,
          profile_completeness: completeness,
        } as any)
        .eq("user_id", user.id);

      toast({ title: "Saved", description: `Step ${step + 1} saved successfully.` });
    } catch (err) {
      console.error("Save error:", err);
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    await saveStep();
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .update({
          profile_setup_completed: true,
          profile_completeness: calcCompleteness(),
          onboarding_completed: true,
        } as any)
        .eq("user_id", user.id);

      toast({ title: "Profile Complete!", description: "Your profile is ready. Let's find your perfect job!" });
      navigate("/job-search");
    } catch {
      toast({ title: "Error", description: "Failed to complete setup", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addToList = (field: keyof typeof profile, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const arr = profile[field] as string[];
    if (!arr.includes(value.trim())) {
      setProfile((p) => ({ ...p, [field]: [...arr, value.trim()] }));
    }
    setter("");
  };

  const removeFromList = (field: keyof typeof profile, value: string) => {
    setProfile((p) => ({ ...p, [field]: (p[field] as string[]).filter((v) => v !== value) }));
  };

  const toggleInList = (field: keyof typeof profile, value: string) => {
    const arr = profile[field] as string[];
    if (arr.includes(value)) {
      setProfile((p) => ({ ...p, [field]: arr.filter((v) => v !== value) }));
    } else {
      setProfile((p) => ({ ...p, [field]: [...arr, value] }));
    }
  };

  const handleResumeUpload = async (text: string, _fileName: string) => {
    setResumeUploaded(true);
    // Auto-extract info if possible
    toast({ title: "Resume uploaded", description: "Analyzing your resume..." });
  };

  const runAtsScore = async () => {
    if (!user) return;
    setAtsLoading(true);
    try {
      const { data: resume } = await supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!resume) {
        toast({ title: "No resume found", description: "Upload a resume first" });
        return;
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt8F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://woxtbyotydxorcdhhivr.supabase.co"}/functions/v1/ats-score`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({
            resumeId: resume.id,
            targetRole: profile.desired_roles[0] || "Software Engineer",
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAtsScore(data.overall_score || data.score || 0);
      }
    } catch (err) {
      console.error("ATS score error:", err);
    } finally {
      setAtsLoading(false);
    }
  };

  const completeness = calcCompleteness();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" />
          Complete Your Profile
        </h1>
        <p className="text-muted-foreground mt-2">The more you fill, the better your job matches</p>
        <div className="mt-4 max-w-md mx-auto">
          <div className="flex justify-between text-sm mb-1">
            <span>Profile Completeness</span>
            <span className="font-semibold text-primary">{completeness}%</span>
          </div>
          <Progress value={completeness} className="h-2" />
        </div>
      </div>

      {/* Step Navigation */}
      <div className="flex overflow-x-auto gap-1 pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={() => { saveStep(); setStep(i); }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all min-w-fit",
                i === step
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : i < step
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {i < step ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => { const Icon = STEPS[step].icon; return <Icon className="w-5 h-5 text-primary" />; })()}
            {STEPS[step].label}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{STEPS[step].desc}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 0: General Info */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={profile.full_name} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} placeholder="john@example.com" type="email" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={profile.location} onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))} placeholder="San Francisco, CA" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>LinkedIn URL</Label>
                <Input value={profile.linkedin_url} onChange={(e) => setProfile((p) => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/yourname" />
              </div>
            </div>
          )}

          {/* Step 1: Target Roles */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Job Roles</Label>
                <div className="flex gap-2">
                  <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Software Engineer" onKeyDown={(e) => e.key === "Enter" && addToList("desired_roles", newRole, setNewRole)} />
                  <Button onClick={() => addToList("desired_roles", newRole, setNewRole)} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.desired_roles.map((role) => (
                    <Badge key={role} variant="default" className="gap-1 cursor-pointer" onClick={() => removeFromList("desired_roles", role)}>
                      {role} <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seniority Level</Label>
                  <div className="flex flex-wrap gap-2">
                    {SENIORITY_LEVELS.map((level) => (
                      <Badge key={level} variant={profile.seniority_level === level ? "default" : "outline"} className="cursor-pointer" onClick={() => setProfile((p) => ({ ...p, seniority_level: level }))}>
                        {level}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Years of Experience</Label>
                  <Input type="number" min={0} max={50} value={profile.years_of_experience} onChange={(e) => setProfile((p) => ({ ...p, years_of_experience: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Skills */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Your Skills</Label>
                <div className="flex gap-2">
                  <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add a skill..." onKeyDown={(e) => e.key === "Enter" && addToList("skills", newSkill, setNewSkill)} />
                  <Button onClick={() => addToList("skills", newSkill, setNewSkill)} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.skills.map((skill) => (
                    <Badge key={skill} variant="default" className="gap-1 cursor-pointer" onClick={() => removeFromList("skills", skill)}>
                      {skill} <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Quick add popular skills:</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SKILLS.filter((s) => !profile.skills.includes(s)).map((skill) => (
                    <Badge key={skill} variant="outline" className="cursor-pointer text-xs hover:bg-primary/10" onClick={() => toggleInList("skills", skill)}>
                      + {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Work Preferences */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Work Type</Label>
                <div className="flex flex-wrap gap-2">
                  {WORK_TYPES.map((type) => (
                    <Badge key={type} variant={profile.preferred_work_type.includes(type) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleInList("preferred_work_type", type)}>
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Preferred Locations</Label>
                <div className="flex gap-2">
                  <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. New York, Remote" onKeyDown={(e) => e.key === "Enter" && addToList("desired_locations", newLocation, setNewLocation)} />
                  <Button onClick={() => addToList("desired_locations", newLocation, setNewLocation)} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.desired_locations.map((loc) => (
                    <Badge key={loc} variant="default" className="gap-1 cursor-pointer" onClick={() => removeFromList("desired_locations", loc)}>
                      {loc} <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Salary (USD/yr)</Label>
                  <Input type="number" min={0} step={5000} value={profile.salary_min || ""} onChange={(e) => setProfile((p) => ({ ...p, salary_min: parseInt(e.target.value) || 0 }))} placeholder="50000" />
                </div>
                <div className="space-y-2">
                  <Label>Max Salary (USD/yr)</Label>
                  <Input type="number" min={0} step={5000} value={profile.salary_max || ""} onChange={(e) => setProfile((p) => ({ ...p, salary_max: parseInt(e.target.value) || 0 }))} placeholder="150000" />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Work Authorization */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Work Authorization Status</Label>
                <div className="flex flex-wrap gap-2">
                  {WORK_AUTH_OPTIONS.map((opt) => (
                    <Badge key={opt} variant={profile.work_authorization === opt ? "default" : "outline"} className="cursor-pointer" onClick={() => setProfile((p) => ({ ...p, work_authorization: opt }))}>
                      {opt}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Blacklisted Companies (optional)</Label>
                <p className="text-xs text-muted-foreground">Companies you don't want to apply to</p>
                <div className="flex gap-2">
                  <Input value={newBlacklist} onChange={(e) => setNewBlacklist(e.target.value)} placeholder="Company name" onKeyDown={(e) => e.key === "Enter" && addToList("blacklisted_companies", newBlacklist, setNewBlacklist)} />
                  <Button onClick={() => addToList("blacklisted_companies", newBlacklist, setNewBlacklist)} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.blacklisted_companies.map((c) => (
                    <Badge key={c} variant="destructive" className="gap-1 cursor-pointer" onClick={() => removeFromList("blacklisted_companies", c)}>
                      {c} <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Education */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Highest Education Level</Label>
                <div className="flex flex-wrap gap-2">
                  {EDUCATION_LEVELS.map((level) => (
                    <Badge key={level} variant={profile.education_level === level ? "default" : "outline"} className="cursor-pointer" onClick={() => setProfile((p) => ({ ...p, education_level: level }))}>
                      {level}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Detailed education info is pulled from your resume. You can edit it in the Resume Builder.
              </p>
            </div>
          )}

          {/* Step 6: Experience Summary */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Experience Summary</Label>
                <p className="text-xs text-muted-foreground">Brief summary of your career highlights. This helps AI match you to better roles.</p>
                <Textarea
                  rows={6}
                  value={profile.experience_summary}
                  onChange={(e) => setProfile((p) => ({ ...p, experience_summary: e.target.value }))}
                  placeholder="e.g. 5+ years as a full-stack engineer building scalable web applications with React, Node.js, and AWS. Led a team of 4 engineers at a Series B startup..."
                />
              </div>
            </div>
          )}

          {/* Step 7: Resume Upload & Score */}
          {step === 7 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Upload Resume</Label>
                <DocumentUpload onTextExtracted={handleResumeUpload} label="Drop your resume here (PDF, DOCX)" />
                {resumeUploaded && (
                  <div className="flex items-center gap-2 text-sm text-primary font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Resume uploaded!
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-6 text-center">
                <h3 className="font-semibold mb-2">Resume ATS Score</h3>
                {atsScore !== null ? (
                  <div>
                    <div className={cn(
                      "text-5xl font-bold mb-2",
                      atsScore >= 80 ? "text-green-500" : atsScore >= 60 ? "text-yellow-500" : "text-red-500"
                    )}>
                      {atsScore}
                    </div>
                    <p className="text-sm text-muted-foreground">out of 100</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {atsScore >= 80 ? "Great resume! Ready for applications." : atsScore >= 60 ? "Good resume. Some improvements possible." : "Needs work. Use the Resume Builder to improve."}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground text-sm mb-3">Check how ATS-friendly your resume is</p>
                    <Button onClick={runAtsScore} disabled={atsLoading}>
                      {atsLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing...</> : "Analyze Resume"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => { if (step > 0) setStep(step - 1); }} disabled={step === 0} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/job-search")}>
            Skip for now
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save & Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Complete Setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import {
  FileText, Target, MapPin, Briefcase, ArrowRight, ArrowLeft,
  CheckCircle2, Sparkles, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const STEPS = [
  { icon: Upload, label: "Upload Resume", desc: "Let AI extract your experience" },
  { icon: Target, label: "Target Role", desc: "What role are you pursuing?" },
  { icon: MapPin, label: "Preferences", desc: "Where and how do you want to work?" },
];

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Remote"];
const EXPERIENCE_LEVELS = ["Entry Level", "Mid Level", "Senior", "Lead", "Executive"];

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [preferences, setPreferences] = useState({
    location: "",
    jobTypes: [] as string[],
    experienceLevel: "",
  });
  const [saving, setSaving] = useState(false);

  const handleResumeImported = (_text: string, _fileName: string) => {
    setResumeUploaded(true);
  };

  const toggleJobType = (type: string) => {
    setPreferences((p) => ({
      ...p,
      jobTypes: p.jobTypes.includes(type)
        ? p.jobTypes.filter((t) => t !== type)
        : [...p.jobTypes, type],
    }));
  };

  const handleComplete = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          target_role: targetRole,
          job_preferences: preferences as any,
        } as any)
        .eq("user_id", user.id);
      onComplete();
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const canProceed = step === 0 ? true : step === 1 ? targetRole.trim().length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-primary" />
            Welcome to ResumePreps
          </DialogTitle>
          <DialogDescription>
            Let's set up your profile in 3 quick steps
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 my-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                i < step ? "bg-primary text-primary-foreground" :
                i === step ? "bg-primary/15 text-primary ring-2 ring-primary" :
                "bg-muted text-muted-foreground"
              )}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-0.5 flex-1 rounded", i < step ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        <div className="min-h-[240px] py-4">
          {/* Step 0: Upload Resume */}
          {step === 0 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center mb-4">
                <FileText className="w-10 h-10 mx-auto text-primary/60 mb-2" />
                <h3 className="font-semibold text-foreground">Upload your resume</h3>
                <p className="text-sm text-muted-foreground">We'll extract your details to personalize your experience</p>
              </div>
              <DocumentUpload onTextExtracted={handleResumeImported} label="Drop your resume here" />
              {resumeUploaded && (
                <div className="flex items-center gap-2 text-sm text-primary font-medium justify-center">
                  <CheckCircle2 className="w-4 h-4" /> Resume uploaded successfully!
                </div>
              )}
              <p className="text-xs text-center text-muted-foreground">
                You can skip this step and upload later
              </p>
            </div>
          )}

          {/* Step 1: Target Role */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center mb-4">
                <Target className="w-10 h-10 mx-auto text-primary/60 mb-2" />
                <h3 className="font-semibold text-foreground">What role are you targeting?</h3>
                <p className="text-sm text-muted-foreground">This helps us tailor job recommendations</p>
              </div>
              <div className="space-y-2">
                <Label>Target Job Title</Label>
                <Input
                  placeholder="e.g. Senior Software Engineer"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Experience Level</Label>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_LEVELS.map((level) => (
                    <Badge
                      key={level}
                      variant={preferences.experienceLevel === level ? "default" : "outline"}
                      className="cursor-pointer transition-all hover:scale-105"
                      onClick={() => setPreferences((p) => ({ ...p, experienceLevel: level }))}
                    >
                      {level}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Job Preferences */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center mb-4">
                <Briefcase className="w-10 h-10 mx-auto text-primary/60 mb-2" />
                <h3 className="font-semibold text-foreground">Job preferences</h3>
                <p className="text-sm text-muted-foreground">Help us find the right opportunities</p>
              </div>
              <div className="space-y-2">
                <Label>Preferred Location</Label>
                <Input
                  placeholder="e.g. San Francisco, CA or Remote"
                  value={preferences.location}
                  onChange={(e) => setPreferences((p) => ({ ...p, location: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Job Type</Label>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPES.map((type) => (
                    <Badge
                      key={type}
                      variant={preferences.jobTypes.includes(type) ? "default" : "outline"}
                      className="cursor-pointer transition-all hover:scale-105"
                      onClick={() => toggleJobType(type)}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed} className="gap-2">
              {step === 0 ? (resumeUploaded ? "Next" : "Skip") : "Next"} <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={saving} className="gap-2">
              {saving ? "Setting up..." : "Get Started"} <Sparkles className="w-4 h-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

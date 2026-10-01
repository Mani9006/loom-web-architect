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
import { FileText, Target, MapPin, Briefcase, ArrowLeft, CheckCircle2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const STEPS = [
  { icon: Upload, label: "Upload resume", desc: "We read your experience from it" },
  { icon: Target, label: "Target role", desc: "What role are you pursuing?" },
  { icon: MapPin, label: "Preferences", desc: "Where and how do you want to work?" },
];

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Remote"];
const EXPERIENCE_LEVELS = ["Entry level", "Mid level", "Senior", "Lead", "Executive"];

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  /**
   * Persist the answers so far and mark onboarding done. Skipping uses the
   * same flag as finishing, so the modal does not come back on every load;
   * empty answers are left out rather than overwriting existing values.
   */
  const persist = async () => {
    if (!user) return;
    const update: Record<string, unknown> = { onboarding_completed: true };
    if (targetRole.trim()) update.target_role = targetRole.trim();
    if (preferences.location || preferences.jobTypes.length || preferences.experienceLevel) {
      update.job_preferences = preferences;
    }
    await supabase
      .from("profiles")
      .update(update as never)
      .eq("user_id", user.id);
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await persist();
      onComplete();
      navigate("/profile-setup");
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    onComplete();
    try {
      await persist();
    } catch {
      /* Closing should never be blocked by a failed save. */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void handleSkip(); }}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl">Set up ResumePreps</DialogTitle>
          <DialogDescription>
            Three optional steps. Skip any of them and finish later in Profile.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 my-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-state",
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
                  <CheckCircle2 className="w-4 h-4" /> Resume uploaded
                </div>
              )}
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
                <Label>Target job title</Label>
                <Input
                  placeholder="e.g. Senior Software Engineer"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Experience level</Label>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_LEVELS.map((level) => (
                    <Badge
                      key={level}
                      variant={preferences.experienceLevel === level ? "default" : "outline"}
                      className="cursor-pointer pressable hover:border-rp-rule-2"
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
                <Label>Preferred location</Label>
                <Input
                  placeholder="e.g. San Francisco, CA or Remote"
                  value={preferences.location}
                  onChange={(e) => setPreferences((p) => ({ ...p, location: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Job type</Label>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPES.map((type) => (
                    <Badge
                      key={type}
                      variant={preferences.jobTypes.includes(type) ? "default" : "outline"}
                      className="cursor-pointer pressable hover:border-rp-rule-2"
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
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleSkip} disabled={saving}>
              Skip for now
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={handleComplete} disabled={saving}>
                {saving ? "Saving" : "Finish setup"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

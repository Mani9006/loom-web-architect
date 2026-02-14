import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ArrowRight, FileText, Briefcase, Target,
  Mic2, Sparkles, ChevronRight
} from "lucide-react";

interface Stats {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
}

const progressSteps = [
  { label: "Application Materials", key: "materials" },
  { label: "Jobs", key: "jobs" },
  { label: "Networking", key: "networking" },
  { label: "Interviews", key: "interviews" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [stats, setStats] = useState<Stats>({ saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  const [completedSteps, setCompletedSteps] = useState<string[]>(["materials"]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      setDisplayName(profile?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there");

      // Get conversation stats to determine progress
      const { data: convs } = await supabase
        .from("conversations")
        .select("chat_mode")
        .eq("user_id", user.id);

      const modes = new Set(convs?.map((c) => c.chat_mode) || []);
      const steps: string[] = ["materials"];
      if (modes.has("cover-letter") || modes.has("ats-check")) steps.push("materials");
      if (modes.has("job-search")) steps.push("jobs");
      if (modes.has("interview-prep")) steps.push("interviews");
      setCompletedSteps([...new Set(steps)]);

      // Cover letters as "saved" count
      const { count: clCount } = await supabase
        .from("cover_letters")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      setStats((prev) => ({ ...prev, saved: clCount || 0 }));
    };
    load();
  }, []);

  const currentStepIndex = Math.min(completedSteps.length, progressSteps.length - 1);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Welcome */}
      <div className="text-center space-y-2 pt-4">
        <h1 className="text-3xl font-bold">Hi, {displayName}</h1>
        <p className="text-muted-foreground">Here's an impactful action plan for your dream job hunt</p>
      </div>

      {/* Progress Stepper */}
      <div className="flex items-center justify-center gap-2">
        {progressSteps.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = i === currentStepIndex;
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-12 h-0.5 ${isCompleted ? "bg-primary" : "bg-border"}`} />
              )}
              <div className="flex items-center gap-1.5">
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <div className={`w-5 h-5 rounded-full border-2 ${isCurrent ? "border-primary" : "border-muted-foreground/30"}`} />
                )}
                <span className={`text-xs font-medium ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Card + Next Step */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Your Progress</h3>
              <span className="text-sm text-primary font-bold">
                {completedSteps.length}/{progressSteps.length}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-4">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(completedSteps.length / progressSteps.length) * 100}%` }}
              />
            </div>
            <div className="space-y-3">
              {["Add a Job", "Tailor Your Resume", "Create a Cover Letter", "Apply for a Job"].map(
                (label, i) => (
                  <div key={label} className="flex items-center gap-2.5">
                    {i < completedSteps.length ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : i === completedSteps.length ? (
                      <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                        <ChevronRight className="w-3 h-3 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span className="text-sm">{label}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div>
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">Jobs</span>
              <h3 className="text-lg font-bold mt-3">Send Out Your First Job Application</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Take the leap! 80% of jobs are filled through networking, but you have to start somewhere.
              </p>
            </div>
            <Button onClick={() => navigate("/jobs")} className="mt-4 gap-2 w-fit">
              <Sparkles className="w-4 h-4" /> Apply Now
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Explore Banner */}
      <Card className="border-dashed">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">You've Taken the First Step — Let's Go Further</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You've already started your journey. Now explore all the AI-powered tools designed to help you land your dream job.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/chat")} className="gap-2 shrink-0">
            Explore All Features <ArrowRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div>
        <h3 className="text-lg font-bold mb-4">Quick Stats</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Jobs Tracker</h4>
                <Button variant="ghost" size="icon" onClick={() => navigate("/job-tracker")}>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "Saved", value: stats.saved },
                  { label: "Applied", value: stats.applied },
                  { label: "Interviewing", value: stats.interviewing },
                  { label: "Offer", value: stats.offer },
                  { label: "Rejected", value: stats.rejected },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h4 className="font-semibold mb-3">Quick Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Resume Builder", icon: FileText, path: "/resume-builder" },
                  { label: "Job Search", icon: Briefcase, path: "/jobs" },
                  { label: "Job Tracker", icon: Target, path: "/job-tracker" },
                  { label: "Mock Interview", icon: Mic2, path: "/mock-interviews" },
                ].map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    className="h-auto py-3 flex-col gap-1.5 text-xs"
                    onClick={() => navigate(action.path)}
                  >
                    <action.icon className="w-4 h-4 text-primary" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

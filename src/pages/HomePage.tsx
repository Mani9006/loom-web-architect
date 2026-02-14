import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ArrowRight, FileText, Briefcase, Target,
  Mic2, Sparkles, ChevronRight, TrendingUp, Brain, Zap, Mail
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

const quickActions = [
  { label: "Resume Builder", icon: FileText, path: "/resume-builder", desc: "AI-optimized resumes", color: "text-primary" },
  { label: "Job Search", icon: Briefcase, path: "/jobs", desc: "AI-matched jobs", color: "text-accent" },
  { label: "Job Tracker", icon: Target, path: "/job-tracker", desc: "Kanban pipeline", color: "text-primary" },
  { label: "Mock Interview", icon: Mic2, path: "/mock-interviews", desc: "Voice practice", color: "text-accent" },
  { label: "Cover Letter", icon: Mail, path: "/cover-letters", desc: "Tailored letters", color: "text-primary" },
  { label: "AI Toolbox", icon: Brain, path: "/ai-toolbox", desc: "6 career tools", color: "text-accent" },
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
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Welcome */}
      <div className="space-y-1 pt-2">
        <h1 className="text-2xl font-bold">Welcome back, {displayName} 👋</h1>
        <p className="text-muted-foreground text-sm">Here's your personalized action plan</p>
      </div>

      {/* Progress Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {progressSteps.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = i === currentStepIndex;
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-10 h-0.5 ${isCompleted ? "bg-accent" : "bg-border"}`} />
              )}
              <div className="flex items-center gap-1.5">
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                ) : (
                  <div className={`w-5 h-5 rounded-full border-2 ${isCurrent ? "border-primary" : "border-muted-foreground/30"}`} />
                )}
                <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Card */}
        <Card className="lg:col-span-1">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent" /> Progress
              </h3>
              <span className="text-sm text-accent font-bold">
                {completedSteps.length}/{progressSteps.length}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-4">
              <div
                className="bg-accent h-2 rounded-full transition-all"
                style={{ width: `${(completedSteps.length / progressSteps.length) * 100}%` }}
              />
            </div>
            <div className="space-y-3">
              {["Add a Job", "Tailor Your Resume", "Create a Cover Letter", "Apply for a Job"].map(
                (label, i) => (
                  <div key={label} className="flex items-center gap-2.5">
                    {i < completedSteps.length ? (
                      <CheckCircle2 className="w-5 h-5 text-accent" />
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

        {/* Next Step Card */}
        <Card className="lg:col-span-2 border-primary/20 bg-primary/5">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Recommended</span>
              </div>
              <h3 className="text-xl font-bold mb-2">Send Out Your First Application</h3>
              <p className="text-sm text-muted-foreground max-w-lg">
                You've built your materials — now take the leap. Use AI Job Search to find matching roles, then apply with your optimized resume and tailored cover letter.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => navigate("/jobs")} className="gap-2">
                <Sparkles className="w-4 h-4" /> Find Matching Jobs
              </Button>
              <Button variant="outline" onClick={() => navigate("/resume-builder")} className="gap-2">
                <FileText className="w-4 h-4" /> Review Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Grid */}
      <div>
        <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Card
              key={action.label}
              className="cursor-pointer hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:border-primary/20 group"
              onClick={() => navigate(action.path)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <action.icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <p className="text-xs font-semibold">{action.label}</p>
                <p className="text-[10px] text-muted-foreground">{action.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div>
        <h3 className="text-lg font-bold mb-4">Job Pipeline</h3>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Saved", value: stats.saved, color: "bg-muted" },
            { label: "Applied", value: stats.applied, color: "bg-primary/10" },
            { label: "Interviewing", value: stats.interviewing, color: "bg-accent/10" },
            { label: "Offers", value: stats.offer, color: "bg-accent/20" },
            { label: "Rejected", value: stats.rejected, color: "bg-destructive/10" },
          ].map((item) => (
            <Card key={item.label} className="cursor-pointer hover:shadow-[var(--shadow-card-hover)] transition-all" onClick={() => navigate("/job-tracker")}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

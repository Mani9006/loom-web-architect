import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ArrowRight, FileEdit, Search, KanbanSquare,
  Headphones, Sparkles, ChevronRight, TrendingUp, Zap, Mail,
  Rocket, BookmarkCheck, Send, MessageSquareMore, Trophy, XCircle,
  ArrowUpRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Stats {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
}

const progressSteps = [
  { label: "Materials", key: "materials" },
  { label: "Jobs", key: "jobs" },
  { label: "Network", key: "networking" },
  { label: "Interviews", key: "interviews" },
];

const quickActions = [
  { label: "Resume Builder", icon: FileEdit, path: "/resume-builder", desc: "AI-optimized resumes" },
  { label: "Job Search", icon: Search, path: "/jobs", desc: "AI-matched jobs" },
  { label: "Job Tracker", icon: KanbanSquare, path: "/job-tracker", desc: "Kanban pipeline" },
  { label: "Mock Interview", icon: Headphones, path: "/mock-interviews", desc: "Voice practice" },
  { label: "Cover Letter", icon: Mail, path: "/cover-letters", desc: "Tailored letters" },
  { label: "AI Toolbox", icon: Sparkles, path: "/ai-toolbox", desc: "6 career tools" },
];

const pipelineItems = [
  { label: "Saved", key: "saved" as const, icon: BookmarkCheck, color: "text-muted-foreground" },
  { label: "Applied", key: "applied" as const, icon: Send, color: "text-primary" },
  { label: "Interviewing", key: "interviewing" as const, icon: MessageSquareMore, color: "text-primary" },
  { label: "Offers", key: "offer" as const, icon: Trophy, color: "text-primary" },
  { label: "Rejected", key: "rejected" as const, icon: XCircle, color: "text-destructive" },
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
        .from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      setDisplayName(profile?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there");

      const { data: convs } = await supabase
        .from("conversations").select("chat_mode").eq("user_id", user.id);
      const modes = new Set(convs?.map((c) => c.chat_mode) || []);
      const steps: string[] = ["materials"];
      if (modes.has("cover-letter") || modes.has("ats-check")) steps.push("materials");
      if (modes.has("job-search")) steps.push("jobs");
      if (modes.has("interview-prep")) steps.push("interviews");
      setCompletedSteps([...new Set(steps)]);

      const { count: clCount } = await supabase
        .from("cover_letters").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setStats((prev) => ({ ...prev, saved: clCount || 0 }));
    };
    load();
  }, []);

  const currentStepIndex = Math.min(completedSteps.length, progressSteps.length - 1);
  const progressPercent = (completedSteps.length / progressSteps.length) * 100;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">
          Welcome back, {displayName}
        </h1>
        <p className="text-muted-foreground text-sm">Your career dashboard — here's what needs attention.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {progressSteps.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = i === currentStepIndex;
          return (
            <div key={step.key} className="flex items-center gap-1 flex-1">
              {i > 0 && (
                <div className={`flex-1 h-[2px] rounded-full ${isCompleted ? "bg-primary" : "bg-border"}`} />
              )}
              <div className="flex items-center gap-1.5">
                {isCompleted ? (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                ) : (
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2",
                    isCurrent ? "border-primary" : "border-border"
                  )} />
                )}
                <span className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCompleted ? "text-foreground" : isCurrent ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Progress Card */}
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Progress
              </h3>
              <Badge variant="secondary" className="text-[10px] font-bold">
                {completedSteps.length}/{progressSteps.length}
              </Badge>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5 mb-5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="space-y-2.5">
              {["Add a Job", "Tailor Your Resume", "Create a Cover Letter", "Apply for a Job"].map(
                (label, i) => (
                  <div key={label} className="flex items-center gap-2.5">
                    {i < completedSteps.length ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : i === completedSteps.length ? (
                      <div className="w-4 h-4 rounded-[4px] bg-primary flex items-center justify-center">
                        <ChevronRight className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-[1.5px] border-border" />
                    )}
                    <span className={cn(
                      "text-[13px]",
                      i < completedSteps.length ? "text-muted-foreground line-through" : "text-foreground"
                    )}>{label}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* CTA Card */}
        <Card className="lg:col-span-3 shadow-sm border-primary/10 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-primary/[0.06]" />
          <CardContent className="p-5 flex flex-col justify-between h-full relative">
            <div>
              <Badge className="mb-3 text-[10px] font-bold gap-1 bg-primary text-primary-foreground">
                <Rocket className="w-3 h-3" /> Recommended
              </Badge>
              <h3 className="text-lg font-bold text-foreground mb-1.5">Send Your First Application</h3>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Use AI to find matching roles, then apply with your optimized resume and tailored cover letter.
              </p>
            </div>
            <div className="flex gap-2.5 mt-5">
              <Button onClick={() => navigate("/jobs")} size="sm" className="gap-1.5 shadow-sm">
                <Zap className="w-3.5 h-3.5" /> Find Jobs
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/resume-builder")} className="gap-1.5">
                <FileEdit className="w-3.5 h-3.5" /> Review Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="group flex flex-col items-center gap-2.5 p-4 rounded-lg border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all duration-200 text-center"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/[0.06] flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <action.icon className="w-[18px] h-[18px] text-primary" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground">{action.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Job Pipeline</h3>
          <button onClick={() => navigate("/job-tracker")} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
            View tracker <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {pipelineItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => navigate("/job-tracker")}
                className="flex flex-col items-center gap-1 p-4 rounded-lg border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all duration-200"
              >
                <Icon className={cn("w-4 h-4 mb-1", item.color)} />
                <span className="text-xl font-bold text-foreground">{stats[item.key]}</span>
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

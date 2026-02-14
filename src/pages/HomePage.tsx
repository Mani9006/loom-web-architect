import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ArrowRight, FileText, Search, Columns3,
  Mic, Wand2, ChevronRight, TrendingUp, Zap, Mail,
  Rocket, Bookmark, Send, MessageCircle, Trophy, XCircle,
  ArrowUpRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  { label: "Resume Builder", icon: FileText, path: "/resume-builder", desc: "AI-optimized resumes" },
  { label: "Job Search", icon: Search, path: "/jobs", desc: "AI-matched jobs" },
  { label: "Job Tracker", icon: Columns3, path: "/job-tracker", desc: "Kanban pipeline" },
  { label: "Mock Interview", icon: Mic, path: "/mock-interviews", desc: "Voice practice" },
  { label: "Cover Letter", icon: Mail, path: "/cover-letters", desc: "Tailored letters" },
  { label: "AI Toolbox", icon: Wand2, path: "/ai-toolbox", desc: "6 career tools" },
];

const pipelineItems = [
  { label: "Saved", key: "saved" as const, icon: Bookmark, color: "text-muted-foreground" },
  { label: "Applied", key: "applied" as const, icon: Send, color: "text-primary" },
  { label: "Interviewing", key: "interviewing" as const, icon: MessageCircle, color: "text-accent" },
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

  const progressPercent = (completedSteps.length / progressSteps.length) * 100;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Welcome back, {displayName} 👋
        </h1>
        <p className="text-muted-foreground">Your career dashboard — here's what needs attention.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {progressSteps.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = i === Math.min(completedSteps.length, progressSteps.length - 1);
          return (
            <div key={step.key} className="flex items-center gap-1 flex-1">
              {i > 0 && (
                <div className={`flex-1 h-[2px] rounded-full ${isCompleted ? "bg-primary" : "bg-border"}`} />
              )}
              <div className="flex items-center gap-1.5">
                {isCompleted ? (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                  </div>
                ) : (
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2",
                    isCurrent ? "border-primary" : "border-border"
                  )} />
                )}
                <span className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
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
        <Card className="lg:col-span-2 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Progress
              </h3>
              <Badge variant="secondary" className="text-[11px] font-bold rounded-lg">
                {completedSteps.length}/{progressSteps.length}
              </Badge>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 mb-6">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="space-y-3">
              {["Add a Job", "Tailor Your Resume", "Create a Cover Letter", "Apply for a Job"].map(
                (label, i) => (
                  <div key={label} className="flex items-center gap-3">
                    {i < completedSteps.length ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : i === completedSteps.length ? (
                      <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
                        <ChevronRight className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-border" />
                    )}
                    <span className={cn(
                      "text-sm",
                      i < completedSteps.length ? "text-muted-foreground line-through" : "text-foreground"
                    )}>{label}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* CTA Card */}
        <Card className="lg:col-span-3 rounded-2xl overflow-hidden relative border-primary/10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.06]" />
          <CardContent className="p-6 flex flex-col justify-between h-full relative">
            <div>
              <Badge className="mb-4 font-bold gap-1.5 bg-primary text-primary-foreground rounded-lg">
                <Rocket className="w-3.5 h-3.5" /> Recommended
              </Badge>
              <h3 className="text-xl font-bold text-foreground mb-2">Send Your First Application</h3>
              <p className="text-muted-foreground max-w-md leading-relaxed">
                Use AI to find matching roles, then apply with your optimized resume and tailored cover letter.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => navigate("/jobs")} className="gap-2 rounded-xl shadow-md shadow-primary/15">
                <Zap className="w-4 h-4" /> Find Jobs
              </Button>
              <Button variant="outline" onClick={() => navigate("/resume-builder")} className="gap-2 rounded-xl">
                <FileText className="w-4 h-4" /> Review Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-200 text-center"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/[0.07] flex items-center justify-center group-hover:bg-primary/[0.12] transition-colors">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">{action.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Job Pipeline</h3>
          <button onClick={() => navigate("/job-tracker")} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
            View tracker <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {pipelineItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => navigate("/job-tracker")}
                className="flex flex-col items-center gap-1.5 p-5 rounded-2xl border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-200"
              >
                <Icon className={cn("w-5 h-5 mb-1", item.color)} />
                <span className="text-2xl font-bold text-foreground">{stats[item.key]}</span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

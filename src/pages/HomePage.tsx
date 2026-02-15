import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  CheckCircle2, ArrowRight, FileText, Search, Columns3,
  Mic, Wand2, ChevronRight, TrendingUp, Zap, Mail,
  Rocket, Bookmark, Send, MessageCircle, Trophy, XCircle,
  ArrowUpRight, Sparkles, Target
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

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } }),
};

const quickActions = [
  { label: "Resume Builder", icon: FileText, path: "/chat?mode=resume-form", desc: "AI-optimized resumes", gradient: "from-primary/10 to-accent/5" },
  { label: "Job Search", icon: Search, path: "/chat?mode=job-search", desc: "AI-matched roles", gradient: "from-accent/10 to-primary/5" },
  { label: "Job Tracker", icon: Columns3, path: "/job-tracker", desc: "Kanban pipeline", gradient: "from-primary/10 to-accent/5" },
  { label: "Mock Interview", icon: Mic, path: "/chat?mode=interview-prep", desc: "Voice practice", gradient: "from-accent/10 to-primary/5" },
  { label: "Cover Letter", icon: Mail, path: "/chat?mode=cover-letter", desc: "Tailored letters", gradient: "from-primary/10 to-accent/5" },
  { label: "AI Toolbox", icon: Wand2, path: "/ai-toolbox", desc: "6 career tools", gradient: "from-accent/10 to-primary/5" },
];

const pipelineItems = [
  { label: "Saved", key: "saved" as const, icon: Bookmark, color: "text-muted-foreground", bg: "bg-muted" },
  { label: "Applied", key: "applied" as const, icon: Send, color: "text-primary", bg: "bg-primary/10" },
  { label: "Interviewing", key: "interviewing" as const, icon: MessageCircle, color: "text-accent", bg: "bg-accent/10" },
  { label: "Offers", key: "offer" as const, icon: Trophy, color: "text-primary", bg: "bg-primary/10" },
  { label: "Rejected", key: "rejected" as const, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
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

  const totalSteps = 4;
  const progressPercent = (completedSteps.length / totalSteps) * 100;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Welcome */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          {greeting}, {displayName} 👋
        </h1>
        <p className="text-muted-foreground text-lg">Here's what's happening with your job search.</p>
      </motion.div>

      {/* Bento top row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hero CTA card */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1}
          className="lg:col-span-2 bento-card relative overflow-hidden bg-gradient-to-br from-primary/[0.06] via-card to-accent/[0.04]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/[0.05] rounded-full blur-3xl -mr-10 -mt-10" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" /> AI Recommended
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Launch your job search</h2>
            <p className="text-muted-foreground max-w-md leading-relaxed mb-6">
              Use AI to find matching roles, optimize your resume, and apply with a tailored cover letter — all in under 5 minutes.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => navigate("/jobs")} className="gap-2 rounded-2xl shadow-lg shadow-primary/15 h-11">
                <Zap className="w-4 h-4" /> Find Jobs
              </Button>
              <Button variant="outline" onClick={() => navigate("/chat?mode=resume-form")} className="gap-2 rounded-2xl h-11 glass-card border-border/50">
                <FileText className="w-4 h-4" /> Build Resume
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Progress card */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="bento-card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
              Progress
            </h3>
            <Badge variant="secondary" className="text-[11px] font-bold rounded-full px-3">
              {completedSteps.length}/{totalSteps}
            </Badge>
          </div>

          {/* Circular progress */}
          <div className="flex items-center justify-center mb-5">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="hsl(var(--secondary))" strokeWidth="8" fill="none" />
                <circle cx="50" cy="50" r="42" stroke="hsl(var(--primary))" strokeWidth="8" fill="none"
                  strokeDasharray={`${progressPercent * 2.64} 264`} strokeLinecap="round" className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-extrabold text-foreground">{Math.round(progressPercent)}%</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {["Add a Job", "Tailor Resume", "Cover Letter", "Apply"].map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                {i < completedSteps.length ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : i === completedSteps.length ? (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <ChevronRight className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-border" />
                )}
                <span className={cn(
                  "text-sm",
                  i < completedSteps.length ? "text-muted-foreground line-through" : "text-foreground font-medium"
                )}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="font-bold text-foreground mb-4 text-lg">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {quickActions.map((action, i) => (
            <motion.button
              key={action.label}
              initial="hidden" animate="visible" variants={fadeUp} custom={i + 3}
              onClick={() => navigate(action.path)}
              className={cn(
                "group flex flex-col items-center gap-3 p-5 rounded-3xl border border-border/40 bg-gradient-to-br transition-all duration-300 text-center hover:shadow-lg hover:-translate-y-1",
                action.gradient
              )}
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-foreground">{action.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{action.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground text-lg">Job Pipeline</h3>
          <button onClick={() => navigate("/job-tracker")} className="text-sm text-primary font-semibold flex items-center gap-1 hover:underline">
            View tracker <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {pipelineItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.label}
                initial="hidden" animate="visible" variants={fadeUp} custom={i + 9}
                onClick={() => navigate("/job-tracker")}
                className="bento-card flex flex-col items-center gap-2 !p-5"
              >
                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", item.bg)}>
                  <Icon className={cn("w-5 h-5", item.color)} />
                </div>
                <span className="text-3xl font-extrabold text-foreground">{stats[item.key]}</span>
                <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

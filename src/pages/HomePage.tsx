import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { OnboardingModal } from "@/components/OnboardingModal";

interface Stats {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
}

interface ProgressData {
  hasResume: boolean;
  hasApplied: boolean;
  hasCoverLetter: boolean;
  hasInterviewPrep: boolean;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } }),
};

type Activity = { num: string; title: string; meta: string; when: string };

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [stats, setStats] = useState<Stats>({ saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  const [progress, setProgress] = useState<ProgressData>({ hasResume: false, hasApplied: false, hasCoverLetter: false, hasInterviewPrep: false });
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [profileRes, resumesRes, jobsRes, clRes, convsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, onboarding_completed").eq("user_id", user.id).maybeSingle(),
        supabase.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("tracked_jobs").select("id, status").eq("user_id", user.id),
        supabase.from("cover_letters").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("conversations").select("chat_mode").eq("user_id", user.id),
      ]);
      const profile = profileRes.data as { full_name?: string; onboarding_completed?: boolean } | null;
      setDisplayName(profile?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there");
      if (profile && !profile.onboarding_completed) setShowOnboarding(true);

      const jobs = (jobsRes.data || []) as Array<{ status: string }>;
      const hasApplied = jobs.some((j) => j.status !== "Saved");
      const convModes = new Set(((convsRes.data || []) as Array<{ chat_mode: string }>).map((c) => c.chat_mode));

      setProgress({
        hasResume: (resumesRes.count || 0) > 0,
        hasApplied,
        hasCoverLetter: (clRes.count || 0) > 0,
        hasInterviewPrep: convModes.has("interview-prep"),
      });

      const counts: Record<string, number> = { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
      jobs.forEach((j) => {
        const key = j.status.toLowerCase();
        if (key in counts) counts[key]++;
      });
      setStats(counts as unknown as Stats);
      setLoading(false);
    };
    load();
  }, [user]);

  const completedCount =
    (progress.hasResume ? 1 : 0) +
    (progress.hasApplied ? 1 : 0) +
    (progress.hasCoverLetter ? 1 : 0) +
    (progress.hasInterviewPrep ? 1 : 0);

  // Score (illustrative) — keywords/format/brevity/verbs driven by progress for now.
  const score = Math.max(60, Math.min(99, 70 + completedCount * 7));
  const subScores = {
    keywords: Math.min(99, score + 0),
    format: Math.min(99, score + 4),
    brevity: Math.max(50, score - 7),
    verbs: Math.min(99, score + 1),
  };

  const interviewing = stats.interviewing;
  const offers = stats.offer;
  const applied = stats.applied;

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  const activity: Activity[] = [
    { num: "01", title: 'Voice session · "Checkout redesign story"', meta: "STAR 88 · 04:23", when: "4 min ago" },
    { num: "02", title: "Resume rewritten for Stripe · Senior PM", meta: "+12 keywords · ATS 94", when: "28 min ago" },
    { num: "03", title: "Cover letter · Linear · Product Lead", meta: "tuned · 218 words", when: "2 h ago" },
    { num: "04", title: "New match · Figma · Staff Product Designer", meta: "compat. 97%", when: "yesterday" },
  ];

  if (loading) {
    return (
      <div className="p-6 lg:p-12 max-w-[1280px] mx-auto space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20 w-[70%]" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 lg:col-span-2 rounded-[20px]" />
          <Skeleton className="h-72 rounded-[20px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <OnboardingModal open={showOnboarding} onComplete={() => setShowOnboarding(false)} />

      <div className="px-6 lg:px-12 py-10 lg:py-12 max-w-[1280px] mx-auto space-y-10">
        {/* Editorial header */}
        <motion.header initial="hidden" animate="visible" variants={fadeUp} custom={0} className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {greeting}, {displayName || "Friend"}
          </p>
          <h1 className="font-display text-[54px] sm:text-[68px] lg:text-[84px] leading-[0.98] -tracking-[0.03em] text-foreground font-semibold">
            Today&rsquo;s composition.
          </h1>
        </motion.header>

        {/* Top bento row: Score card (wide) + Pipeline (ink panel) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Score card */}
          <motion.section
            initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="glass-card lg:col-span-2 p-8 sm:p-10 relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Active resume <span className="opacity-50">·</span> Figma <span className="opacity-50">·</span> Growth
              </p>
              <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-background/60 border border-foreground/10 text-[11px] text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Drafting
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 sm:gap-10">
              <div className="font-display text-[120px] sm:text-[144px] leading-none font-semibold tabular-nums -tracking-[0.04em] text-foreground">
                {score}
              </div>
              <div className="flex-1 pb-4">
                <p className="text-[18px] sm:text-[20px] text-foreground leading-snug">
                  Exceptional — ready to submit.
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-2">
                  +7 vs cohort <span className="opacity-50">·</span> last edited 4 min ago
                </p>
              </div>
              {/* Trend spark */}
              <svg className="w-32 h-16 text-foreground/70 shrink-0 hidden sm:block" viewBox="0 0 200 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M4 66 C 40 58, 80 44, 120 30 S 180 14, 196 10" />
              </svg>
            </div>

            <div className="mt-12 grid grid-cols-4 gap-6 border-t border-foreground/10 pt-6">
              {([
                ["Keywords", subScores.keywords],
                ["Format", subScores.format],
                ["Brevity", subScores.brevity],
                ["Verbs", subScores.verbs],
              ] as const).map(([label, val]) => (
                <div key={label}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
                  <div className="font-display text-[44px] sm:text-[52px] leading-tight font-semibold tabular-nums -tracking-[0.03em] text-foreground">
                    {val}
                  </div>
                  <div className="h-px w-full bg-foreground/15 mt-2" />
                </div>
              ))}
            </div>
          </motion.section>

          {/* Ink pipeline panel */}
          <motion.section
            initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="ink-panel p-8 sm:p-10 relative overflow-hidden"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-background/55">
              Pipeline <span className="opacity-60">·</span> Today
            </p>
            <p className="mt-6 text-[22px] sm:text-[24px] leading-snug text-background/95 font-medium">
              {applied || 3} application{applied === 1 ? "" : "s"} drafted.<br />
              {interviewing || 2} interview{interviewing === 1 ? "" : "s"} scheduled.<br />
              {offers || 1} offer{offers === 1 ? "" : "s"} anticipated.
            </p>

            <div className="my-10 h-px bg-background/15" />

            <div className="grid grid-cols-3 gap-6">
              {([
                [stats.applied || 28, "Applied"],
                [stats.interviewing || 7, "Call"],
                [offers || 3, "Onsite"],
              ] as const).map(([n, label]) => (
                <div key={label}>
                  <div className="font-display text-[44px] sm:text-[52px] leading-none font-semibold tabular-nums -tracking-[0.03em] text-background">{n}</div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-background/55 mt-3">{label}</p>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* Recent activity */}
        <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={3} className="glass-card p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Recent activity</p>
            <button
              onClick={() => navigate("/job-tracker")}
              className="text-[12px] text-foreground border-b border-foreground/30 hover:border-foreground transition-colors"
            >
              View all
            </button>
          </div>
          <ul className="divide-y divide-foreground/10">
            {activity.map((a) => (
              <li key={a.num} className="grid grid-cols-[40px_1fr_auto_80px] items-center gap-4 py-4 text-[14px]">
                <span className="font-mono text-[11px] text-muted-foreground">{a.num}</span>
                <span className="text-foreground truncate">{a.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground hidden sm:inline">{a.meta}</span>
                <span className="font-mono text-[11px] text-muted-foreground text-right">{a.when}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Landing / Dashboard pill (decorative — signals active surface) */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-background/60 border border-foreground/10 backdrop-blur-md">
            <button
              onClick={() => navigate("/")}
              className="h-8 px-5 rounded-full text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Landing
            </button>
            <button
              className={cn(
                "h-8 px-5 rounded-full text-[12px] font-medium bg-foreground text-background",
              )}
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

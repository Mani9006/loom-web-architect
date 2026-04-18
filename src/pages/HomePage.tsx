import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { OnboardingModal } from "@/components/OnboardingModal";
import {
  FileText, Search, Target, Mail, Mic, ArrowUpRight, Sparkles, Columns3,
} from "lucide-react";

interface Stats {
  saved: number; applied: number; interviewing: number; offer: number; rejected: number;
}

interface TopMatch {
  evaluation_id: string;
  score: number;
  tier: string;
  summary: string | null;
  title: string;
  company: string;
  apply_url: string;
}

const tiles: Array<{
  label: string;
  desc: string;
  icon: React.ElementType;
  accent: string;
  path: string;
}> = [
  { label: "Resume Builder", desc: "Draft and edit", icon: FileText, accent: "from-indigo-500 to-indigo-600", path: "/resume-builder" },
  { label: "ATS Checker", desc: "Score and fix", icon: Target, accent: "from-emerald-500 to-emerald-600", path: "/ats-checker" },
  { label: "Job Search", desc: "Find matches", icon: Search, accent: "from-violet-500 to-violet-600", path: "/job-search" },
  { label: "Matches", desc: "Pre-scored roles", icon: Sparkles, accent: "from-amber-500 to-orange-500", path: "/matches" },
  { label: "Cover Letters", desc: "Tailor per job", icon: Mail, accent: "from-rose-500 to-pink-500", path: "/cover-letters" },
  { label: "Interview Prep", desc: "Rehearse with AI", icon: Mic, accent: "from-sky-500 to-cyan-500", path: "/interview-prep" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [stats, setStats] = useState<Stats>({ saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [topMatches, setTopMatches] = useState<TopMatch[]>([]);
  const [recentResumes, setRecentResumes] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, jobsRes, resumesRes, matchesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, onboarding_completed").eq("user_id", user.id).maybeSingle(),
        supabase.from("tracked_jobs").select("status").eq("user_id", user.id),
        supabase.from("resumes").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(4),
        supabase
          .from("job_evaluations")
          .select("id,score,tier,summary,scanned_job_id,scanned_jobs(title,apply_url,company:scan_companies(name))")
          .eq("user_id", user.id)
          .order("score", { ascending: false })
          .limit(3),
      ]);

      const profile = profileRes.data as { full_name?: string; onboarding_completed?: boolean } | null;
      setDisplayName(profile?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there");
      if (profile && !profile.onboarding_completed) setShowOnboarding(true);

      const jobs = (jobsRes.data || []) as Array<{ status: string }>;
      const counts: Record<string, number> = { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
      jobs.forEach((j) => {
        const key = (j.status || "").toLowerCase();
        if (key in counts) counts[key]++;
      });
      setStats(counts as unknown as Stats);

      setRecentResumes((resumesRes.data || []) as Array<{ id: string; title: string; updated_at: string }>);

      const matches: TopMatch[] = ((matchesRes.data || []) as any[])
        .filter((m) => m.scanned_jobs)
        .map((m) => ({
          evaluation_id: m.id,
          score: Number(m.score),
          tier: m.tier,
          summary: m.summary,
          title: m.scanned_jobs.title,
          company: m.scanned_jobs.company?.name ?? "—",
          apply_url: m.scanned_jobs.apply_url,
        }));
      setTopMatches(matches);

      setLoading(false);
    })();
  }, [user]);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div className="px-6 lg:px-10 pt-10 pb-16 max-w-[1200px] mx-auto">
        <div className="h-8 w-64 bg-muted rounded-md animate-pulse mb-3" />
        <div className="h-10 w-96 bg-muted rounded-md animate-pulse mb-10" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-[136px] bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <OnboardingModal open={showOnboarding} onComplete={() => setShowOnboarding(false)} />
      <div className="px-6 lg:px-10 pt-10 pb-16 max-w-[1200px] mx-auto">
        <div className="mb-10">
          <p className="text-[12px] text-muted-foreground mb-1">My Workspace</p>
          <h1 className="text-[32px] sm:text-[36px] font-bold text-foreground tracking-tight leading-tight">
            {greeting}, {displayName}
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-14">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className="feature-tile group flex flex-col items-start gap-4 p-4 text-left"
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br", t.accent)}>
                  <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-[13.5px] font-semibold text-foreground leading-tight">{t.label}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-1 truncate">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-10">
          <section>
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight mb-4">
              Latest in your workspace
            </h2>
            {recentResumes.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <div className="w-10 h-10 mx-auto rounded-xl bg-muted flex items-center justify-center mb-3">
                  <FileText className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <p className="text-[14px] font-medium text-foreground">No resumes yet</p>
                <p className="text-[12.5px] text-muted-foreground mt-1 mb-4">Create your first to get started.</p>
                <button
                  onClick={() => navigate("/resume-builder")}
                  className="inline-flex items-center h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  Create resume
                </button>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {recentResumes.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => navigate(`/resume-builder/${r.id}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-indigo-600" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{r.title || "Untitled resume"}</p>
                        <p className="text-[11.5px] text-muted-foreground mt-0.5">
                          Updated {new Date(r.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => navigate("/documents")}
              className="mt-3 inline-flex items-center h-9 px-4 rounded-md text-[12.5px] text-foreground border border-border hover:bg-muted/70 transition-colors"
            >
              Browse all documents
            </button>
          </section>

          <section>
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight mb-4">
              Create or discover
            </h2>
            <div className="space-y-2.5">
              <button
                onClick={() => navigate("/resume-builder")}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-[13.5px] font-semibold text-foreground">New resume</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Start from a blank template</p>
                </div>
              </button>
              <button
                onClick={() => navigate("/matches")}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-[13.5px] font-semibold text-foreground">Find matches</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">AI-scored roles across tracked portals</p>
                </div>
              </button>
              <button
                onClick={() => navigate("/job-tracker")}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0">
                  <Columns3 className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-[13.5px] font-semibold text-foreground">Open pipeline</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {stats.applied + stats.interviewing + stats.offer} active · {stats.saved} saved
                  </p>
                </div>
              </button>
            </div>
          </section>
        </div>

        {topMatches.length > 0 && (
          <section className="mt-14">
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight mb-4">
              Top matches today
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topMatches.map((m) => (
                <a
                  key={m.evaluation_id}
                  href={m.apply_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="glass-card p-5 block hover:-translate-y-0.5 transition-transform no-underline"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <span className="text-[13px] font-bold text-amber-600 tabular-nums">{m.score.toFixed(1)}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{m.tier}</span>
                  </div>
                  <p className="text-[14px] font-semibold text-foreground leading-tight line-clamp-2">{m.title}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">{m.company}</p>
                  {m.summary && (
                    <p className="text-[12px] text-muted-foreground mt-3 line-clamp-2 leading-relaxed">{m.summary}</p>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * Home — Product-first mission control.
 *
 * Linear/Vercel language: neutral canvas, one indigo accent, hairlines,
 * tight components. Three stacked zones: Today (priority action + agent
 * status), Pipeline (4 inline stats), Recent (applications + matches).
 *
 * Data wiring is unchanged from the prior version.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CornerDownLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { OnboardingModal } from "@/components/OnboardingModal";

// ─── Types ─────────────────────────────────────────────────────────────

interface Stats {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
}
interface TopMatch {
  evaluation_id: string;
  score: number;
  tier: string;
  summary: string | null;
  title: string;
  company: string;
  location: string;
  dimensions: Array<{ key: string; label: string; score: number }>;
}
interface RecentApplication {
  id: string;
  title: string;
  company: string;
  status: string;
  tailoredResumeId: string | null;
  updated_at: string;
}
interface AgentSummary {
  runs24h: number;
  lastSummary: string | null;
  lastAt: string | null;
}

// ─── Static content ────────────────────────────────────────────────────

const workspace: Array<{ label: string; path: string; desc: string; shortcut?: string }> = [
  { label: "Job Search",   path: "/job-search",     desc: "Search live openings" },
  { label: "Matches",      path: "/matches",        desc: "Ranked for your resume" },
  { label: "Applications", path: "/job-tracker",    desc: "Pipeline and status" },
  { label: "Agent",        path: "/agent",          desc: "Auto tailor and apply" },
  { label: "Resume",       path: "/resume-builder", desc: "Edit and export" },
  { label: "ATS Checker",  path: "/ats-checker",    desc: "Score against a job" },
];

// ─── Helpers ───────────────────────────────────────────────────────────

function relativeDays(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
function applicationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft", ready: "Ready", queued: "Queued",
    submitted: "Submitted", failed: "Needs attention", skipped: "Skipped",
  };
  return labels[status.toLowerCase()] ?? "In progress";
}
function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "submitted") return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (s === "failed") return "text-red-500 bg-red-500/10 border-red-500/20";
  if (s === "queued" || s === "ready") return "text-rp-accent bg-rp-accent/10 border-rp-accent/20";
  return "text-rp-ink-2 bg-rp-paper-2 border-rp-rule";
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [stats, setStats] = useState<Stats>({ saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [topMatches, setTopMatches] = useState<TopMatch[]>([]);
  const [hasResume, setHasResume] = useState(false);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [agentSummary, setAgentSummary] = useState<AgentSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, jobsRes, resumesRes, applicationsRes, matchesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, onboarding_completed").eq("user_id", user.id).maybeSingle(),
        supabase.from("tracked_jobs").select("status").eq("user_id", user.id),
        supabase.from("resumes").select("id").eq("user_id", user.id).limit(1),
        supabase
          .from("draft_applications")
          .select("id,status,tailored_resume_id,updated_at,submitted_at,evaluation:job_evaluations(scanned_job:scanned_jobs(title,company:scan_companies(name)))")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(5),
        supabase
          .from("job_evaluations")
          .select("id,score,fit_score,tier,summary,dimension_scores,scanned_job_id,scanned_jobs(title,location,apply_url,company:scan_companies(name))")
          .eq("user_id", user.id)
          .eq("eligible", true)
          .order("fit_score", { ascending: false })
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

      setHasResume((resumesRes.data || []).length > 0);
      const applications = ((applicationsRes.data || []) as unknown as Array<Record<string, unknown>>).flatMap((row) => {
        const evaluation = row.evaluation as { scanned_job?: { title?: string; company?: { name?: string } } } | null;
        const job = evaluation?.scanned_job;
        if (!job?.title) return [];
        return [{
          id: String(row.id),
          title: job.title,
          company: job.company?.name ?? "Company not listed",
          status: String(row.status ?? "ready"),
          tailoredResumeId: typeof row.tailored_resume_id === "string" ? row.tailored_resume_id : null,
          updated_at: String(row.submitted_at ?? row.updated_at),
        }];
      });
      setRecentApplications(applications);

      const matches: TopMatch[] = ((matchesRes.data || []) as Array<Record<string, unknown>>)
        .filter((m) => m.scanned_jobs)
        .map((m) => {
          const sj = m.scanned_jobs as { title: string; location?: string; apply_url: string; company?: { name?: string } };
          return {
            evaluation_id: String(m.id),
            score: Math.round(Number(m.fit_score ?? Number(m.score) * 20)),
            tier: String(m.tier ?? ""),
            summary: (m.summary as string | null) ?? null,
            title: sj.title,
            company: sj.company?.name ?? "Company not listed",
            location: sj.location ?? "Location not listed",
            dimensions: Array.isArray(m.dimension_scores)
              ? (m.dimension_scores as Array<{ key: string; label: string; score: number }>)
              : [],
          };
        });
      setTopMatches(matches);

      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const sb = supabase as unknown as { from: (t: string) => { select: (s: string) => unknown } };
      try {
        const chain = sb.from("agent_runs") as unknown as {
          select: (s: string) => {
            eq: (k: string, v: string) => {
              eq: (k: string, v: string) => {
                gte: (k: string, v: string) => {
                  order: (k: string, o: object) => Promise<{ data: Array<{ id: string; summary: string | null; started_at: string }> | null }>;
                };
              };
            };
          };
        };
        const { data: runs } = await chain.select("id, summary, started_at, status")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .gte("started_at", since)
          .order("started_at", { ascending: false });
        const list = runs ?? [];
        if (list.length > 0) {
          setAgentSummary({ runs24h: list.length, lastSummary: list[0].summary, lastAt: list[0].started_at });
        }
      } catch { /* agent_runs may 404 for users without the feature */ }
    })()
      .catch((err) => {
        console.error("Home load failed:", err);
        toast({ title: "Couldn't load your home page", description: "Refresh to try again.", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [user, toast]);

  const now = useMemo(() => new Date(), []);
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  // Priority action, kept from the previous logic.
  const lede = useMemo(() => {
    if (!hasResume) {
      return {
        eyebrow: "Get started",
        headline: "Add your resume",
        body: "Upload a PDF or start fresh. Everything downstream (matches, tailoring, auto-apply) needs a resume on file.",
        cta: "Open builder",
        href: "/resume-builder",
      };
    }
    if (topMatches.length > 0) {
      return {
        eyebrow: "Priority",
        headline: `Tailor for ${topMatches[0].title} at ${topMatches[0].company}`,
        body: topMatches[0].summary ?? `A ${topMatches[0].score}% career-fit role. Review the tailored draft before it ships.`,
        cta: "Tailor resume",
        href: "/matches",
      };
    }
    if (stats.applied + stats.interviewing > 0) {
      return {
        eyebrow: "Follow up",
        headline: "Check on jobs in flight",
        body: `${stats.applied} applied, ${stats.interviewing} interviewing. A short, polite nudge often reopens the conversation.`,
        cta: "Open pipeline",
        href: "/job-tracker",
      };
    }
    return {
      eyebrow: "Try this",
      headline: "Score your resume against a job",
      body: "See which keywords ATS parsers miss on your latest draft. Two minutes, pasteable feedback.",
      cta: "Run ATS check",
      href: "/ats-checker",
    };
  }, [hasResume, topMatches, stats]);

  if (loading) {
    return (
      <div className="min-h-full bg-rp-canvas">
        <div className="max-w-[1120px] mx-auto px-6 lg:px-10 pt-8 pb-16">
          <div className="h-3 w-40 bg-rp-paper-2 rounded animate-pulse mb-3" />
          <div className="h-6 w-64 bg-rp-paper-2 rounded animate-pulse mb-8" />
          <div className="h-24 w-full bg-rp-paper-2 rounded-[10px] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <>
      <OnboardingModal open={showOnboarding} onComplete={() => setShowOnboarding(false)} />

      <div className="min-h-full bg-rp-canvas text-rp-ink">
        <div className="max-w-[1120px] mx-auto px-6 lg:px-10 pt-8 pb-16 space-y-10">

          {/* ── Header ─────────────────────────────────────────────── */}
          <header>
            <p className="text-[11px] uppercase tracking-[0.14em] text-rp-ink-3 font-mono mb-2">
              {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <h1
              className="text-rp-ink font-semibold tracking-[-0.015em]"
              style={{ fontSize: "22px", lineHeight: "28px" }}
            >
              {greeting}, {displayName}.
            </h1>
            <p className="text-rp-ink-2 mt-1" style={{ fontSize: "13px" }}>
              Here's what's worth your attention today.
            </p>
          </header>

          {/* ── Today: priority action ────────────────────────────── */}
          <section>
            <div className="border border-rp-rule rounded-[10px] bg-rp-paper overflow-hidden">
              <div className="flex items-start gap-6 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rp-accent" aria-hidden />
                    <span className="text-[11px] uppercase tracking-[0.12em] text-rp-accent font-medium">
                      {lede.eyebrow}
                    </span>
                  </div>
                  <h2
                    className="text-rp-ink font-semibold tracking-[-0.01em]"
                    style={{ fontSize: "17px", lineHeight: "24px" }}
                  >
                    {lede.headline}
                  </h2>
                  <p className="text-rp-ink-2 mt-1 max-w-2xl" style={{ fontSize: "13px", lineHeight: "20px" }}>
                    {lede.body}
                  </p>
                </div>
                <button
                  onClick={() => navigate(lede.href)}
                  className="shrink-0 inline-flex items-center gap-2 h-8 px-3 rounded-md bg-rp-ink text-rp-canvas hover:opacity-90 transition-opacity text-[12.5px] font-medium"
                >
                  {lede.cta}
                  <CornerDownLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
              {agentSummary && (
                <div className="border-t border-rp-rule px-5 py-3 bg-rp-paper-2/40 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Agent active
                  </span>
                  <span className="text-[12px] text-rp-ink-2 truncate">
                    {agentSummary.lastSummary || `Ran ${agentSummary.runs24h} time${agentSummary.runs24h === 1 ? "" : "s"} in the last 24h.`}
                  </span>
                  <button
                    onClick={() => navigate("/agent")}
                    className="ml-auto text-[11.5px] text-rp-ink-2 hover:text-rp-ink transition-colors"
                  >
                    Open agent →
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── Pipeline: 4 inline stats ──────────────────────────── */}
          <section>
            <SectionHead title="Pipeline" href="/job-tracker" hrefLabel="View all" />
            <div className="grid grid-cols-2 sm:grid-cols-4 border border-rp-rule rounded-[10px] bg-rp-paper divide-x divide-y sm:divide-y-0 divide-rp-rule overflow-hidden">
              <Stat label="Saved"        value={stats.saved}        onClick={() => navigate("/job-tracker?tab=saved")} />
              <Stat label="Applied"      value={stats.applied}      onClick={() => navigate("/job-tracker?tab=applied")} />
              <Stat label="Interviewing" value={stats.interviewing} onClick={() => navigate("/job-tracker?tab=interviewing")} accent />
              <Stat label="Offer"        value={stats.offer}        onClick={() => navigate("/job-tracker?tab=offer")} success />
            </div>
          </section>

          {/* ── Recent applications ───────────────────────────────── */}
          <section>
            <SectionHead title="Recent applications" href="/job-tracker" hrefLabel="View all" />
            {recentApplications.length === 0 ? (
              <EmptyState
                title="No applications yet"
                body="When you tailor a resume for a match, it lands here with status and receipts attached."
                cta="Browse matches"
                onClick={() => navigate("/matches")}
              />
            ) : (
              <div className="border border-rp-rule rounded-[10px] bg-rp-paper overflow-hidden">
                <div className="grid grid-cols-[1fr_180px_120px_80px] items-center px-4 py-2 border-b border-rp-rule text-[11px] uppercase tracking-[0.1em] text-rp-ink-3 font-medium">
                  <div>Role · Company</div>
                  <div>Status</div>
                  <div>Updated</div>
                  <div className="text-right">Open</div>
                </div>
                <ul className="divide-y divide-rp-rule">
                  {recentApplications.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => navigate(`/applications/${a.id}`)}
                        className="w-full grid grid-cols-[1fr_180px_120px_80px] items-center px-4 py-3 text-left hover:bg-rp-paper-2/60 transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="text-rp-ink truncate" style={{ fontSize: "14px", fontWeight: 500 }}>
                            {a.title}
                          </div>
                          <div className="text-rp-ink-2 truncate" style={{ fontSize: "12.5px" }}>
                            {a.company}
                          </div>
                        </div>
                        <div>
                          <span className={`inline-flex items-center h-5 px-2 rounded-full border text-[11px] font-medium ${statusTone(a.status)}`}>
                            {applicationStatusLabel(a.status)}
                          </span>
                        </div>
                        <div className="text-rp-ink-2 tabular-nums" style={{ fontSize: "12.5px" }}>
                          {relativeDays(a.updated_at)}
                        </div>
                        <div className="text-right">
                          <ArrowUpRight className="inline w-4 h-4 text-rp-ink-3 group-hover:text-rp-accent transition-colors" strokeWidth={1.75} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* ── Top matches ───────────────────────────────────────── */}
          {topMatches.length > 0 && (
            <section>
              <SectionHead title="Top matches" href="/matches" hrefLabel="View all" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {topMatches.map((m) => {
                  const band =
                    m.score >= 80 ? { label: "Strong match", tone: "text-emerald-500" } :
                    m.score >= 60 ? { label: "Good match",   tone: "text-rp-accent"    } :
                                    { label: "Possible match", tone: "text-rp-ink-2"    };
                  return (
                    <button
                      key={m.evaluation_id}
                      onClick={() => navigate("/matches")}
                      className="text-left border border-rp-rule rounded-[10px] bg-rp-paper p-4 hover:border-rp-rule-2 transition-colors"
                    >
                      <div className={`text-[11.5px] font-medium ${band.tone} mb-1`}>
                        {band.label}
                      </div>
                      <div className="text-rp-ink" style={{ fontSize: "14.5px", fontWeight: 500, lineHeight: "20px" }}>
                        {m.title}
                      </div>
                      <div className="text-rp-ink-2 truncate" style={{ fontSize: "12.5px" }}>
                        {m.company} · {m.location}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-rp-ink-3 tabular-nums">
                        <span>{m.score}%</span>
                        {m.dimensions?.length > 0 && <span>· {m.dimensions.length} signals</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Workspace shortcuts ───────────────────────────────── */}
          <section>
            <SectionHead title="Jump to" />
            <div className="border border-rp-rule rounded-[10px] bg-rp-paper overflow-hidden">
              <ul className="divide-y divide-rp-rule">
                {workspace.map((w) => (
                  <li key={w.path}>
                    <button
                      onClick={() => navigate(w.path)}
                      className="w-full grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 hover:bg-rp-paper-2/60 transition-colors group text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-rp-ink group-hover:text-rp-accent transition-colors" style={{ fontSize: "14px", fontWeight: 500 }}>
                          {w.label}
                        </div>
                        <div className="text-rp-ink-2" style={{ fontSize: "12.5px" }}>
                          {w.desc}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-rp-ink-3 group-hover:text-rp-accent group-hover:translate-x-0.5 transition-all" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}

// ─── Small primitives ──────────────────────────────────────────────────

function SectionHead({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2
        className="text-rp-ink font-semibold"
        style={{ fontSize: "13px", lineHeight: "20px", letterSpacing: "-0.005em" }}
      >
        {title}
      </h2>
      {href && hrefLabel && (
        <button
          onClick={() => navigate(href)}
          className="text-[12px] text-rp-ink-2 hover:text-rp-ink transition-colors"
        >
          {hrefLabel} →
        </button>
      )}
    </div>
  );
}

function Stat({
  label, value, onClick, accent, success,
}: {
  label: string;
  value: number;
  onClick: () => void;
  accent?: boolean;
  success?: boolean;
}) {
  const tone = success ? "text-emerald-500" : accent ? "text-rp-accent" : "text-rp-ink";
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-4 hover:bg-rp-paper-2/60 transition-colors"
    >
      <div className="text-[11px] uppercase tracking-[0.12em] text-rp-ink-3 font-medium mb-1">
        {label}
      </div>
      <div className={`tabular-nums ${tone} font-semibold`} style={{ fontSize: "24px", lineHeight: "28px", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </button>
  );
}

function EmptyState({ title, body, cta, onClick }: { title: string; body: string; cta: string; onClick: () => void }) {
  return (
    <div className="border border-rp-rule rounded-[10px] bg-rp-paper px-5 py-8 text-center">
      <p className="text-rp-ink font-medium" style={{ fontSize: "14px" }}>{title}</p>
      <p className="text-rp-ink-2 mt-1 mx-auto max-w-md" style={{ fontSize: "12.5px", lineHeight: "18px" }}>{body}</p>
      <button
        onClick={onClick}
        className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-rp-ink text-rp-canvas hover:opacity-90 transition-opacity text-[12.5px] font-medium"
      >
        {cta}
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/**
 * Home — Editorial Prestige.
 *
 * A noir-and-gold masthead for your career today.
 *
 *   Header    : date eyebrow · greeting · profile-strength readout
 *   01 / Priority Action  (8 cols, gold ember glow)
 *   02 / Pipeline Stats   (4 cols, 2x2 numeric tiles)
 *   03 / Workspace        (6 col hairline grid)
 *   04 / Recent Activity  (12 col table rows, hairline dividers)
 *
 * Data wiring is unchanged: same queries, same shape. Only the surface
 * treatment changed. Urbanist for numerals and titles, Epilogue for body,
 * a single gold accent used sparingly.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight, Search, Target, Bot, Sparkles, FileText, Columns3,
} from "lucide-react";

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

const workspace: Array<{ label: string; glyph: string; path: string; desc: string }> = [
  { label: "Job Search",   glyph: "◎", path: "/job-search",      desc: "Direct openings" },
  { label: "Matches",      glyph: "✦", path: "/matches",         desc: "Scored for you" },
  { label: "Agent",        glyph: "⬡", path: "/agent",           desc: "Auto tailor" },
  { label: "Resume",       glyph: "▥", path: "/resume-builder",  desc: "Edit and export" },
  { label: "ATS Preview",  glyph: "⚖", path: "/ats-checker",     desc: "Score a job" },
  { label: "Applications", glyph: "☷", path: "/job-tracker",     desc: "Status & receipts" },
];

// ─── Helpers ───────────────────────────────────────────────────────────

function pad2(n: number): string { return n.toString().padStart(2, "0"); }
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
    draft: "Preparing", ready: "Ready", queued: "Queued",
    submitted: "Submitted", failed: "Needs attention", skipped: "Skipped",
  };
  return labels[status.toLowerCase()] ?? "In progress";
}

// ─── Typography helper classes ─────────────────────────────────────────

const URBAN = { fontFamily: '"Urbanist", "Manrope", system-ui, sans-serif' } as const;
const EPI   = { fontFamily: '"Epilogue", "Inter", system-ui, sans-serif' } as const;
const MONO  = { fontFamily: '"JetBrains Mono", ui-monospace, monospace' } as const;

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
            company: sj.company?.name ?? ".",
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

  // Profile strength: honest, based on available signals.
  const profileStrength = useMemo(() => {
    let score = 20;
    if (hasResume) score += 40;
    if (stats.applied + stats.interviewing > 0) score += 20;
    if (topMatches.length > 0) score += 20;
    return Math.min(100, score);
  }, [hasResume, stats, topMatches]);

  // Today's priority action.
  const lede = useMemo(() => {
    if (!hasResume) {
      return {
        eyebrow: "Get set up",
        headline: <>Start your first <span className="text-rp-accent-2">résumé</span>.</>,
        body: "Upload a PDF and we'll parse every section, or build from scratch. The AI tailor turns it into a job-specific application in seconds.",
        cta: "Open the builder",
        href: "/resume-builder",
      };
    }
    if (topMatches.length > 0) {
      return {
        eyebrow: "Priority action",
        headline: <>Tailor for <span className="text-rp-accent-2">{topMatches[0].title}</span> at {topMatches[0].company}.</>,
        body: topMatches[0].summary ?? `A ${topMatches[0].score}% career-fit role. Review the tailored draft before anything ships.`,
        cta: "Auto-tailor résumé",
        href: "/matches",
      };
    }
    if (stats.applied + stats.interviewing > 0) {
      return {
        eyebrow: "Follow up",
        headline: <>Check on jobs you've <span className="text-rp-accent-2">applied to</span>.</>,
        body: `${stats.applied} applied, ${stats.interviewing} interviewing. A short, polite nudge often re-opens the conversation.`,
        cta: "Open pipeline",
        href: "/job-tracker",
      };
    }
    return {
      eyebrow: "Score it",
      headline: <>Run your résumé through <span className="text-rp-accent-2">ATS</span>.</>,
      body: "See exactly which keywords ATS systems miss when they parse your most recent draft. Two minutes; pasteable feedback.",
      cta: "Run ATS check",
      href: "/ats-checker",
    };
  }, [hasResume, topMatches, stats]);

  if (loading) {
    return (
      <div className="min-h-full bg-rp-canvas">
        <div className="max-w-[1280px] mx-auto px-8 lg:px-12 pt-12 pb-24">
          <div className="h-3 w-56 bg-rp-paper rounded-sm animate-pulse mb-4" />
          <div className="h-14 w-[32rem] bg-rp-paper rounded-sm animate-pulse mb-4" />
          <div className="h-40 w-full bg-rp-paper rounded-sm animate-pulse" />
        </div>
      </div>
    );
  }

  const dateEyebrow = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Prefer real recent applications; fall back to a single row hint.
  const activityRows = recentApplications;

  return (
    <>
      <OnboardingModal open={showOnboarding} onComplete={() => setShowOnboarding(false)} />

      <div className="min-h-full bg-rp-canvas text-rp-ink">
        <div className="max-w-[1280px] mx-auto px-8 lg:px-12 pt-12 pb-24">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="flex flex-wrap justify-between items-end gap-6 mb-16">
            <div className="min-w-0">
              <p
                className="text-rp-accent uppercase mb-3"
                style={{ ...URBAN, fontSize: "11px", letterSpacing: "0.22em", fontWeight: 600 }}
              >
                {dateEyebrow}
              </p>
              <h1
                className="text-rp-ink"
                style={{
                  ...URBAN,
                  fontSize: "clamp(40px, 5.4vw, 60px)",
                  lineHeight: 1.04,
                  letterSpacing: "-0.02em",
                  fontWeight: 200,
                }}
              >
                {greeting}, <span style={{ fontWeight: 600 }}>{displayName}.</span>
              </h1>
            </div>
            <div className="text-right">
              <div className="text-rp-ink-2" style={{ ...EPI, fontSize: "12px", letterSpacing: "0.02em" }}>
                Profile strength
              </div>
              <div
                className="text-rp-accent-2 tabular-nums mt-1"
                style={{ ...URBAN, fontSize: "26px", fontWeight: 300, letterSpacing: "-0.01em" }}
              >
                {profileStrength}%
              </div>
              <div className="mt-2 h-[3px] w-40 bg-rp-paper-2 overflow-hidden">
                <div
                  className="h-full bg-rp-accent transition-[width] duration-700"
                  style={{ width: `${profileStrength}%` }}
                />
              </div>
            </div>
          </header>

          {/* ── Grid ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-8">

            {/* 01 / Priority Action — no card, just typography + a rule */}
            <section className="col-span-12 lg:col-span-8 space-y-6 relative">
              <SectionLabel n="01" title="Priority Action" />
              <div className="relative pr-8">
                {/* faint gold wash, no border */}
                <div
                  aria-hidden
                  className="absolute -top-10 -left-10 w-[420px] h-[280px] rounded-full blur-3xl pointer-events-none"
                  style={{ background: "hsl(var(--rp-accent) / 0.07)" }}
                />
                <div
                  aria-hidden
                  className="absolute right-0 -top-6 select-none text-rp-ink/[0.05] pointer-events-none"
                  style={{ ...URBAN, fontSize: "220px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.05em" }}
                >
                  01
                </div>
                <div className="relative z-10">
                  <p
                    className="text-rp-accent mb-5"
                    style={{ ...URBAN, fontSize: "10.5px", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    — {lede.eyebrow}
                  </p>
                  <h3
                    className="text-rp-ink max-w-2xl mb-5"
                    style={{ ...URBAN, fontSize: "clamp(30px, 3.4vw, 44px)", lineHeight: 1.08, fontWeight: 400, letterSpacing: "-0.02em" }}
                  >
                    {lede.headline}
                  </h3>
                  <p className="text-rp-ink-2 max-w-lg mb-8 leading-relaxed" style={{ ...EPI, fontSize: "15px", fontWeight: 300 }}>
                    {lede.body}
                  </p>
                  <button
                    onClick={() => navigate(lede.href)}
                    className="group inline-flex items-center gap-3 border-b border-rp-accent pb-1 text-rp-accent hover:text-rp-accent-2 hover:border-rp-accent-2 transition-colors"
                    style={{ ...URBAN, fontSize: "12px", fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase" }}
                  >
                    {lede.cta}
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            </section>

            {/* 02 / Pipeline — no boxes, a small ledger */}
            <section className="col-span-12 lg:col-span-4 space-y-6">
              <SectionLabel n="02" title="Pipeline" />
              <dl className="divide-y divide-rp-rule">
                <LedgerRow label="Applied" value={stats.applied} tone="ink" onClick={() => navigate("/job-tracker")} />
                <LedgerRow label="Interviewing" value={stats.interviewing} tone="accent" onClick={() => navigate("/job-tracker")} />
                <LedgerRow label="Offer" value={stats.offer} tone="highlight" onClick={() => navigate("/job-tracker")} />
                <LedgerRow label="Saved" value={stats.saved} tone="muted" onClick={() => navigate("/job-tracker")} />
              </dl>
            </section>

            {/* 03 / Workspace */}
            <section className="col-span-12 pt-8 space-y-6">
              <SectionLabel n="03" title="Workspace" trailing="Quick access modules" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-rp-rule border border-rp-rule">
                {workspace.map((w) => (
                  <button
                    key={w.path}
                    onClick={() => navigate(w.path)}
                    className="bg-rp-canvas p-6 lg:p-8 text-left hover:bg-rp-paper transition-colors group relative"
                  >
                    <div
                      className="text-rp-accent mb-4 opacity-60 group-hover:opacity-100 transition-opacity"
                      style={{ ...URBAN, fontSize: "22px", lineHeight: 1 }}
                    >
                      {w.glyph}
                    </div>
                    <div
                      className="text-rp-ink mb-1"
                      style={{ ...URBAN, fontSize: "11.5px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                    >
                      {w.label}
                    </div>
                    <div className="text-rp-ink-3" style={{ ...EPI, fontSize: "11.5px", fontWeight: 300 }}>
                      {w.desc}
                    </div>
                    <ArrowUpRight
                      className="w-3.5 h-3.5 absolute top-4 right-4 text-rp-ink-3 opacity-0 group-hover:opacity-100 group-hover:text-rp-accent transition-opacity"
                      strokeWidth={1.6}
                    />
                  </button>
                ))}
              </div>
            </section>

            {/* 04 / Recent Activity */}
            <section className="col-span-12 pt-8 space-y-4">
              <SectionLabel n="04" title="Recent Activity" trailing={
                <button
                  onClick={() => navigate("/job-tracker")}
                  className="text-rp-ink-2 hover:text-rp-accent transition-colors inline-flex items-center gap-1"
                  style={{ ...URBAN, fontSize: "10.5px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  Browse all <ArrowUpRight className="w-3 h-3" strokeWidth={2} />
                </button>
              } />

              {activityRows.length === 0 ? (
                <EmptyActivity onBrowse={() => navigate("/matches")} />
              ) : (
                <div className="space-y-px bg-rp-rule border border-rp-rule">
                  {activityRows.map((a, i) => (
                    <div
                      key={a.id}
                      className="bg-rp-paper grid grid-cols-12 items-center px-6 py-5 hover:bg-rp-paper-2/60 transition-colors group"
                    >
                      <div className="col-span-1">
                        <span className="text-rp-ink-3 tabular-nums" style={{ ...MONO, fontSize: "11px", letterSpacing: "0.06em" }}>
                          {pad2(i + 1)}
                        </span>
                      </div>
                      <button
                        onClick={() => navigate(`/applications/${a.id}`)}
                        className="col-span-4 text-left"
                      >
                        <p className="text-rp-ink-3 mb-1" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                          Company
                        </p>
                        <p className="text-rp-ink group-hover:text-rp-accent transition-colors" style={{ ...URBAN, fontSize: "15px", fontWeight: 500, letterSpacing: "-0.005em" }}>
                          {a.company}
                        </p>
                      </button>
                      <div className="col-span-3">
                        <p className="text-rp-ink-3 mb-1" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                          Role
                        </p>
                        <p className="text-rp-ink-2 truncate" style={{ ...EPI, fontSize: "13.5px" }}>
                          {a.title}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-rp-ink-3 mb-1" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                          Stage
                        </p>
                        <span
                          className="inline-block px-2 py-1 border border-rp-rule text-rp-ink-2"
                          style={{ ...MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}
                        >
                          {applicationStatusLabel(a.status)}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <p className="text-rp-ink-3 mb-1" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                          When
                        </p>
                        <p className="text-rp-ink-2 tabular-nums" style={{ ...MONO, fontSize: "12px" }}>
                          {relativeDays(a.updated_at)}
                        </p>
                      </div>
                      <div className="col-span-1 text-right">
                        {a.tailoredResumeId ? (
                          <button
                            onClick={() => navigate(`/resume-builder/${a.tailoredResumeId}`)}
                            className="inline-flex items-center gap-1 text-rp-accent hover:text-rp-accent-2 transition-colors"
                            style={{ ...URBAN, fontSize: "10.5px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                            title="Open tailored résumé"
                          >
                            Résumé <ArrowUpRight className="w-3 h-3" strokeWidth={2} />
                          </button>
                        ) : (
                          <span className="text-rp-accent" style={{ fontSize: "18px" }}>→</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 05 / Top Matches, if present */}
            {topMatches.length > 0 && (
              <section className="col-span-12 pt-8 space-y-4">
                <SectionLabel n="05" title="Top Matches" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rp-rule border border-rp-rule">
                  {topMatches.map((m) => (
                    <button
                      key={m.evaluation_id}
                      onClick={() => navigate("/matches")}
                      className="bg-rp-paper text-left p-6 hover:bg-rp-paper-2/60 transition-colors group"
                    >
                      <div className="flex items-baseline justify-between mb-4">
                        <span className="text-rp-ink-3" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                          {m.tier ? `Tier ${m.tier}` : "Match"}
                        </span>
                        <span className="text-rp-accent-2 tabular-nums" style={{ ...URBAN, fontSize: "18px", fontWeight: 300 }}>
                          {m.score}%
                        </span>
                      </div>
                      <h3
                        className="text-rp-ink group-hover:text-rp-accent transition-colors mb-1"
                        style={{ ...URBAN, fontSize: "18px", lineHeight: 1.2, fontWeight: 500, letterSpacing: "-0.005em" }}
                      >
                        {m.title}
                      </h3>
                      <p className="text-rp-ink-2" style={{ ...EPI, fontSize: "13px" }}>{m.company}</p>
                      <p className="text-rp-ink-3 mt-0.5" style={{ ...MONO, fontSize: "10.5px", letterSpacing: "0.06em" }}>{m.location}</p>
                      {m.summary && (
                        <p className="text-rp-ink-2 mt-4 line-clamp-3" style={{ ...EPI, fontSize: "13px", lineHeight: 1.55, fontWeight: 300 }}>
                          {m.summary}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Agent activity strip */}
            {agentSummary && (
              <section className="col-span-12 pt-8">
                <SectionLabel n="06" title="Agent Activity" />
                <div className="mt-4 border border-rp-rule bg-rp-paper p-6 flex items-start gap-6">
                  <div className="shrink-0">
                    <div
                      className="w-2 h-2 rounded-full bg-rp-accent mb-1"
                      style={{ boxShadow: "0 0 12px hsl(var(--rp-accent) / 0.7)" }}
                    />
                    <span className="text-rp-accent" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                      Active
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-rp-ink" style={{ ...URBAN, fontSize: "18px", lineHeight: 1.45, fontWeight: 400, letterSpacing: "-0.005em" }}>
                      {agentSummary.lastSummary || `Auto-pilot ran ${agentSummary.runs24h} time${agentSummary.runs24h === 1 ? "" : "s"} in the last 24 hours.`}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-rp-ink-3" style={{ ...MONO, fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      <span>Last run · {agentSummary.lastAt ? new Date(agentSummary.lastAt).toLocaleString() : "-"}</span>
                      <button onClick={() => navigate("/career-ops/preferences")} className="hover:text-rp-accent transition-colors">
                        Tune preferences →
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Section label ────────────────────────────────────────────────────
function SectionLabel({ n, title, trailing }: { n: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rp-rule pb-3">
      <div className="flex items-center gap-3">
        <span
          className="border border-rp-accent/30 text-rp-accent px-2 py-0.5"
          style={{ ...URBAN, fontSize: "10.5px", letterSpacing: "0.14em", fontWeight: 600 }}
        >
          {n}
        </span>
        <h2
          className="text-rp-ink-2"
          style={{ ...URBAN, fontSize: "11px", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 500 }}
        >
          {title}
        </h2>
      </div>
      {trailing && (
        <div className="text-rp-ink-3" style={{ ...URBAN, fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {trailing}
        </div>
      )}
    </div>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────
function StatTile({
  label, value, tone, onClick,
}: {
  label: string;
  value: number;
  tone: "ink" | "accent" | "highlight" | "muted";
  onClick: () => void;
}) {
  const color =
    tone === "accent" ? "text-rp-accent" :
    tone === "highlight" ? "text-rp-accent-2" :
    tone === "muted" ? "text-rp-ink-3" : "text-rp-ink";
  return (
    <button
      onClick={onClick}
      className="bg-rp-paper border border-rp-rule p-6 flex flex-col justify-between h-32 text-left hover:border-rp-accent/40 transition-colors group"
    >
      <p className="text-rp-ink-3 uppercase" style={{ ...MONO, fontSize: "10px", letterSpacing: "0.18em" }}>
        {label}
      </p>
      <p
        className={`${color} tabular-nums`}
        style={{ ...URBAN, fontSize: "40px", lineHeight: 1, fontWeight: 300, letterSpacing: "-0.02em" }}
      >
        {String(value).padStart(2, "0")}
      </p>
    </button>
  );
}

// ─── Empty activity ────────────────────────────────────────────────────
function EmptyActivity({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="border border-rp-rule bg-rp-paper p-10">
      <p className="text-rp-ink" style={{ ...URBAN, fontSize: "20px", fontWeight: 500, letterSpacing: "-0.005em" }}>
        No application packets yet.
      </p>
      <p className="text-rp-ink-2 mt-2 max-w-md leading-relaxed" style={{ ...EPI, fontSize: "13.5px", fontWeight: 300 }}>
        Open a résumé-aligned match and prepare it. The exact job-specific résumé will stay attached to that application here.
      </p>
      <button
        onClick={onBrowse}
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-rp-accent text-rp-canvas hover:bg-rp-accent-2 transition-colors"
        style={{ ...URBAN, fontSize: "11px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" }}
      >
        Browse your matches
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.2} />
      </button>
    </div>
  );
}

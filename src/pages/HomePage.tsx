/**
 * Home — editorial redesign.
 *
 * Conceit: open the app, see the front page of YOUR career today. A
 * masthead (Volume / Issue / Date), a one-line lede, a single brief
 * to anchor the day, and dense recent-work columns below.
 *
 * Everything below the masthead is restrained — no gradient tiles, no
 * gradient cards, no shadow stacking. Borders are hairlines. The only
 * accent is the warm amber rp-accent, used once on the lede.
 *
 * Data wiring is unchanged from the prior version — same queries, same
 * state shape — only the surface treatment is new.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  FileText,
  Search,
  Target,
  Bot,
  Sparkles,
  Columns3,
  Quote,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { OnboardingModal } from "@/components/OnboardingModal";
import { TerminalText } from "@/components/Terminal";

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

const quickActions: Array<{ label: string; desc: string; icon: React.ElementType; path: string }> = [
  { label: "Job Search",   desc: "Direct company openings",     icon: Search,      path: "/job-search" },
  { label: "Matches",      desc: "Resume-scored opportunities", icon: Sparkles,    path: "/matches" },
  { label: "Agent",        desc: "Match, tailor, check, queue",  icon: Bot,         path: "/agent" },
  { label: "Resume",       desc: "Edit, tailor, export",         icon: FileText,    path: "/resume-builder" },
  { label: "ATS Preview",  desc: "Score against a job",         icon: Target,      path: "/ats-checker" },
  { label: "Applications", desc: "Status and receipts",         icon: Columns3,    path: "/job-tracker" },
];

// ─── Date helpers (masthead) ───────────────────────────────────────────

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function relativeDays(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.max(0, Math.floor((now - then) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function applicationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Preparing",
    ready: "Ready for review",
    queued: "Queued",
    submitted: "Submitted",
    failed: "Needs attention",
    skipped: "Skipped",
  };
  return labels[status.toLowerCase()] ?? "In progress";
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
            company: sj.company?.name ?? "—",
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

      setLoading(false);
    })();
  }, [user]);

  const now = useMemo(() => new Date(), []);
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  // ── Today's lede — the single thing worth doing right now ─────────────
  const lede = useMemo(() => {
    if (!hasResume) {
      return {
        eyebrow: "Today · Get set up",
        headline: "Start your first résumé.",
        body: "We'll parse your existing PDF or you can build one from scratch — the AI tailor turns it into a job-specific application in seconds.",
        cta: "Open the builder",
        href: "/resume-builder",
      };
    }
    if (topMatches.length > 0) {
      return {
        eyebrow: "Today · Apply",
        headline: `A ${topMatches[0].tier || ""} match for you at ${topMatches[0].company}.`,
        body: topMatches[0].summary ?? `Tailor your résumé to ${topMatches[0].title} — ${topMatches[0].score}% career fit before the ATS check.`,
        cta: "Tailor and review",
        href: "/matches",
      };
    }
    if (stats.applied + stats.interviewing > 0) {
      return {
        eyebrow: "Today · Follow up",
        headline: "Check on jobs you've applied to.",
        body: `${stats.applied} applied, ${stats.interviewing} interviewing. A short, polite nudge often re-opens the conversation.`,
        cta: "Open pipeline",
        href: "/job-tracker",
      };
    }
    return {
      eyebrow: "Today · Score it",
      headline: "Run your résumé through ATS.",
      body: "See exactly which keywords ATS systems miss when they parse your most recent draft. Two minutes; pasteable feedback.",
      cta: "Run ATS check",
      href: "/ats-checker",
    };
  }, [hasResume, topMatches, stats]);

  if (loading) {
    return (
      <div className="min-h-full bg-rp-canvas">
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-24">
          <div className="h-3 w-72 bg-rp-paper rounded-sm animate-pulse mb-3" />
          <div className="h-12 w-[28rem] bg-rp-paper rounded-sm animate-pulse mb-3" />
          <div className="h-4 w-96 bg-rp-paper rounded-sm animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <>
      <OnboardingModal open={showOnboarding} onComplete={() => setShowOnboarding(false)} />

      <div className="min-h-full bg-rp-canvas">
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-24">
          {/* ── Date + status row ──────────────────────────────────── */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-4 border-b border-rp-rule">
            <span
              className="text-rp-ink-2"
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.06em" }}
            >
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
            <span
              className="text-rp-ink-3"
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.06em" }}
            >
              {recentApplications.length} recent application{recentApplications.length === 1 ? "" : "s"} · {stats.applied + stats.interviewing} active · {topMatches.length} match{topMatches.length === 1 ? "" : "es"}
            </span>
          </div>

          {/* ── Greeting (types out, red cursor) ──────────────────────── */}
          <div className="mt-10 mb-4">
            <h1
              className="text-rp-ink"
              style={{
                fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                fontSize: "clamp(38px, 6vw, 60px)",
                lineHeight: 1.04,
                letterSpacing: "-0.02em",
                fontWeight: 700,
              }}
            >
              <TerminalText text={`${greeting}, ${displayName}.`} speed={80} startDelay={150} />
            </h1>
            <div
              className="mt-3 text-rp-ink-3"
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.06em" }}
            >
              <span className="text-rp-accent">resumepreps</span>{" "}
              <span className="opacity-60">~</span>{" "}
              <span>session_ready</span>
            </div>
          </div>

          <p
            className="text-rp-ink-2 max-w-2xl"
            style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "16px", lineHeight: 1.6 }}
          >
            {!hasResume
              ? "Start with your first résumé. Upload a PDF to parse every section, or build from scratch."
              : `You have ${stats.applied + stats.interviewing} application${stats.applied + stats.interviewing === 1 ? "" : "s"} in flight${topMatches.length > 0 ? ` and ${topMatches.length} fresh match${topMatches.length === 1 ? "" : "es"} waiting` : ""}.`}
          </p>

          {/* ── Today's brief ───────────────────────────────────────── */}
          <Brief
            eyebrow={lede.eyebrow}
            headline={lede.headline}
            body={lede.body}
            cta={lede.cta}
            href={lede.href}
            external={Boolean("external" in lede && lede.external)}
            onNavigate={navigate}
          />

          {/* ── Two-column block: recent work + actions ────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-x-12 gap-y-10 mt-16">
            {/* Application work */}
            <section>
              <SectionHead n={1} title="Recent applications" />
              {recentApplications.length === 0 ? (
                <EmptyApplications onBrowse={() => navigate("/matches")} />
              ) : (
                <ol className="mt-3 divide-y divide-rp-rule border-t border-b border-rp-rule">
                  {recentApplications.map((application, i) => (
                    <li key={application.id} className="flex items-center gap-2 py-1">
                      <button
                        onClick={() => navigate(`/applications/${application.id}`)}
                        className="min-w-0 flex-1 flex items-baseline gap-5 py-3 text-left group"
                      >
                        <span
                          className="text-rp-ink-2/70 w-7 shrink-0 text-right"
                          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.02em" }}
                        >
                          {pad2(i + 1)}
                        </span>
                        <span
                          className="flex-1 min-w-0 text-rp-ink group-hover:text-rp-accent transition-colors truncate"
                          style={{
                            fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                            fontSize: "20px",
                            letterSpacing: "-0.005em",
                            fontWeight: 500,
                          }}
                        >
                          <span className="block truncate">{application.title}</span>
                          <span className="block truncate text-xs font-normal text-rp-ink-2 mt-0.5">{application.company} · {applicationStatusLabel(application.status)}</span>
                        </span>
                        <span
                          className="text-rp-ink-2/70 hidden sm:inline shrink-0"
                          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.05em", textTransform: "uppercase" }}
                        >
                          {relativeDays(application.updated_at)}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-rp-ink-2/40 group-hover:text-rp-accent shrink-0" strokeWidth={1.6} />
                      </button>
                      {application.tailoredResumeId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/resume-builder/${application.tailoredResumeId}`)}
                          className="mr-2 shrink-0 border border-rp-rule px-2.5 py-1.5 text-[11px] text-rp-ink-2 hover:border-rp-ink hover:text-rp-ink transition-colors"
                        >
                          Résumé used
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <button
                onClick={() => navigate("/job-tracker")}
                className="mt-5 inline-flex items-center gap-1.5 text-rp-ink-2 hover:text-rp-ink transition-colors group"
                style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "12.5px" }}
              >
                Browse all applications
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.6} />
              </button>
            </section>

            {/* Quick actions — restrained list, not gradient tiles */}
            <aside>
              <SectionHead n={2} title="Workspace" />
              <ul className="mt-3 grid grid-cols-1 gap-px bg-rp-rule border border-rp-rule">
                {quickActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <li key={a.path} className="bg-rp-canvas">
                      <button
                        onClick={() => navigate(a.path)}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-rp-paper transition-colors group"
                      >
                        <Icon className="w-3.5 h-3.5 text-rp-ink-2 shrink-0 group-hover:text-rp-accent transition-colors" strokeWidth={1.6} />
                        <span
                          className="flex-1 text-rp-ink"
                          style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "13px", fontWeight: 500 }}
                        >
                          {a.label}
                        </span>
                        <span
                          className="text-rp-ink-2/65 hidden sm:inline"
                          style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "12.5px", fontStyle: "italic" }}
                        >
                          {a.desc}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
          </div>

          {/* ── Agent activity block (quote treatment) ───────────────── */}
          {agentSummary && (
            <section className="mt-16">
              <SectionHead n={3} title="Agent activity" />
              <blockquote className="mt-4 border-l-2 border-rp-accent pl-5 max-w-3xl">
                <Quote className="w-4 h-4 text-rp-accent mb-2" strokeWidth={1.6} />
                <p
                  className="text-rp-ink"
                  style={{
                    fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                    fontSize: "22px",
                    lineHeight: 1.45,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {agentSummary.lastSummary || `Auto-pilot ran ${agentSummary.runs24h} time${agentSummary.runs24h === 1 ? "" : "s"} in the last 24 hours.`}
                </p>
                <footer
                  className="mt-3 text-rp-ink-2/70 flex items-center gap-2"
                  style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  Last run · {agentSummary.lastAt ? new Date(agentSummary.lastAt).toLocaleString() : "—"}
                  <span className="w-px h-3 bg-rp-rule" />
                  <button onClick={() => navigate("/career-ops/preferences")} className="hover:text-rp-accent transition-colors">
                    Tune preferences
                  </button>
                </footer>
              </blockquote>
            </section>
          )}

          {/* ── Top matches as numbered clippings ────────────────────── */}
          {topMatches.length > 0 && (
            <section className="mt-16">
              <SectionHead n={4} title="Top matches" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rp-rule border border-rp-rule mt-3">
                {topMatches.map((m, i) => (
                  <button
                    key={m.evaluation_id}
                    onClick={() => navigate("/matches")}
                    className="bg-rp-canvas p-5 block text-left hover:bg-rp-paper transition-colors no-underline group"
                  >
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-rp-ink-3"
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.06em" }}
                      >
                        {m.tier ? `Tier ${m.tier}` : "—"}
                      </span>
                      <span
                        className="text-rp-accent tabular-nums"
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "12px", fontWeight: 600 }}
                      >
                        {m.score}%
                      </span>
                    </div>
                    <h3
                      className="mt-2 text-rp-ink group-hover:text-rp-accent transition-colors"
                      style={{
                        fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                        fontSize: "20px",
                        lineHeight: 1.18,
                        fontWeight: 500,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {m.title}
                    </h3>
                    <p
                      className="text-rp-ink-2 mt-1"
                      style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "13px", fontStyle: "italic" }}
                    >
                      {m.company}
                    </p>
                    <p className="mt-1 text-[11px] text-rp-ink-3">{m.location}</p>
                    {m.summary && (
                      <p
                        className="text-rp-ink-2 mt-3 line-clamp-3"
                        style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "13.5px", lineHeight: 1.45 }}
                      >
                        {m.summary}
                      </p>
                    )}
                    {m.dimensions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {m.dimensions.slice(0, 3).map((dimension) => (
                          <span key={dimension.key} className="border border-rp-rule px-2 py-1 text-[10px] text-rp-ink-2">
                            {dimension.label} {Math.round(dimension.score)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Pipeline summary footer ───────────────────────────────── */}
          <section className="mt-20 pt-8 border-t border-rp-rule">
            <SectionHead n={5} title="Pipeline" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-rp-rule border border-rp-rule mt-3">
              {[
                { label: "Saved", n: stats.saved },
                { label: "Applied", n: stats.applied },
                { label: "Interviewing", n: stats.interviewing },
                { label: "Offer", n: stats.offer },
                { label: "Rejected", n: stats.rejected },
              ].map((c) => (
                <button
                  key={c.label}
                  onClick={() => navigate("/job-tracker")}
                  className="bg-rp-canvas px-5 py-5 text-left hover:bg-rp-paper transition-colors"
                >
                  <div
                    className="text-rp-ink tabular-nums"
                    style={{ fontFamily: '"Manrope", "Inter", system-ui, sans-serif', fontSize: "34px", lineHeight: 1, fontWeight: 500 }}
                  >
                    {c.n}
                  </div>
                  <div
                    className="text-rp-ink-2/65 mt-2"
                    style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.14em" }}
                  >
                    {c.label}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// ─── Section head ──────────────────────────────────────────────────────
// Simple two-digit number + title + hairline rule. No roman numerals,
// no chapter marks, no newspaper labels.

function SectionHead({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="text-rp-accent"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.06em", fontWeight: 600 }}
      >
        {String(n).padStart(2, "0")}
      </span>
      <h2
        className="text-rp-ink"
        style={{
          fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
          fontSize: "20px",
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      <span className="flex-1 h-px bg-rp-rule" />
    </div>
  );
}

// ─── Brief — today's lede ──────────────────────────────────────────────

function Brief({
  eyebrow,
  headline,
  body,
  cta,
  href,
  external,
  onNavigate,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
  href: string;
  external: boolean;
  onNavigate: (p: string) => void;
}) {
  const content = (
    <>
        <div
          className="text-rp-accent"
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: "10.5px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <h2
          className="mt-2 text-rp-ink max-w-3xl"
          style={{
            fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
            fontSize: "clamp(28px, 4vw, 42px)",
            lineHeight: 1.1,
            letterSpacing: "-0.012em",
            fontWeight: 500,
          }}
        >
          {headline}
        </h2>
        <p
          className="mt-3 text-rp-ink-2 max-w-2xl"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "16px", lineHeight: 1.55 }}
        >
          {body}
        </p>
        <span
          className="mt-4 inline-flex items-center gap-1.5 text-rp-ink hover:text-rp-accent transition-colors"
          style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "13px", fontWeight: 500 }}
        >
          {cta}
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
        </span>
    </>
  );

  return (
    <div className="mt-10 border-y-2 border-rp-ink py-7">
      {external ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="block">
          {content}
        </a>
      ) : (
        <button onClick={() => onNavigate(href)} className="block text-left w-full">
          {content}
        </button>
      )}
    </div>
  );
}

// ─── Empty state for recent resumes ────────────────────────────────────

function EmptyApplications({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="mt-4 border border-rp-rule p-8 bg-rp-paper/40">
      <p
        className="text-rp-ink"
        style={{ fontFamily: '"Manrope", "Inter", system-ui, sans-serif', fontSize: "20px", letterSpacing: "-0.005em", fontWeight: 500 }}
      >
        No application packets yet.
      </p>
      <p
        className="text-rp-ink-2 mt-1.5 max-w-md"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "14px", lineHeight: 1.55 }}
      >
        Open a résumé-aligned match and prepare it. The exact job-specific résumé will stay attached to that application here.
      </p>
      <button
        onClick={onBrowse}
        className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 bg-rp-ink text-rp-canvas hover:bg-rp-accent transition-colors"
        style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "12.5px", fontWeight: 500 }}
      >
        Browse your matches
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

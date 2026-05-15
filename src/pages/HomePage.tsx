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
  Mail,
  Mic,
  Sparkles,
  Columns3,
  Quote,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  apply_url: string;
}

interface RecentResume {
  id: string;
  title: string;
  updated_at: string;
}

interface AgentSummary {
  runs24h: number;
  lastSummary: string | null;
  lastAt: string | null;
}

// ─── Static content ────────────────────────────────────────────────────

const quickActions: Array<{ label: string; desc: string; icon: React.ElementType; path: string }> = [
  { label: "Resume Builder",  desc: "Draft, tailor, export",     icon: FileText,    path: "/resume-builder" },
  { label: "ATS Checker",     desc: "Score against a JD",        icon: Target,      path: "/ats-checker" },
  { label: "Job Search",      desc: "Company career pages",      icon: Search,      path: "/job-search" },
  { label: "Matches",         desc: "Pre-scored open roles",     icon: Sparkles,    path: "/matches" },
  { label: "Cover Letters",   desc: "One per application",       icon: Mail,        path: "/cover-letters" },
  { label: "Interview Prep",  desc: "STAR drills with AI",       icon: Mic,         path: "/interview-prep" },
];

// ─── Date helpers (masthead) ───────────────────────────────────────────

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function ordinalNo(n: number): string {
  return n.toString().padStart(3, "0");
}

function fullDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
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

// ─── Page ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [stats, setStats] = useState<Stats>({ saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [topMatches, setTopMatches] = useState<TopMatch[]>([]);
  const [recentResumes, setRecentResumes] = useState<RecentResume[]>([]);
  const [agentSummary, setAgentSummary] = useState<AgentSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, jobsRes, resumesRes, matchesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, onboarding_completed").eq("user_id", user.id).maybeSingle(),
        supabase.from("tracked_jobs").select("status").eq("user_id", user.id),
        supabase.from("resumes").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(5),
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

      setRecentResumes((resumesRes.data || []) as RecentResume[]);

      const matches: TopMatch[] = ((matchesRes.data || []) as Array<Record<string, unknown>>)
        .filter((m) => m.scanned_jobs)
        .map((m) => {
          const sj = m.scanned_jobs as { title: string; apply_url: string; company?: { name?: string } };
          return {
            evaluation_id: String(m.id),
            score: Number(m.score),
            tier: String(m.tier ?? ""),
            summary: (m.summary as string | null) ?? null,
            title: sj.title,
            company: sj.company?.name ?? "—",
            apply_url: sj.apply_url,
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
    if (recentResumes.length === 0) {
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
        body: topMatches[0].summary ?? `Tailor your résumé to ${topMatches[0].title} — score ${topMatches[0].score.toFixed(1)} out of 5.`,
        cta: "Open the role",
        href: topMatches[0].apply_url,
        external: true as const,
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
  }, [recentResumes, topMatches, stats]);

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
          {/* ── Masthead ────────────────────────────────────────────── */}
          <Masthead now={now} pipelineActive={stats.applied + stats.interviewing} resumeCount={recentResumes.length} matchCount={topMatches.length} />

          {/* ── Greeting ────────────────────────────────────────────── */}
          <div className="mt-8 mb-3">
            <h1
              className="text-rp-ink"
              style={{
                fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
                fontSize: "clamp(38px, 6vw, 56px)",
                lineHeight: 1.04,
                letterSpacing: "-0.012em",
                fontWeight: 500,
              }}
            >
              {greeting}, <span className="italic">{displayName}.</span>
            </h1>
          </div>

          <p
            className="text-rp-ink-2 max-w-2xl"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "17px", lineHeight: 1.55 }}
          >
            One file open · {recentResumes.length} resume{recentResumes.length === 1 ? "" : "s"} on your shelf ·{" "}
            {stats.applied + stats.interviewing} in flight ·{" "}
            {topMatches.length > 0 ? `${topMatches.length} match${topMatches.length === 1 ? "" : "es"} waiting.` : "0 matches waiting."}
          </p>

          {/* ── Today's brief ───────────────────────────────────────── */}
          <Brief
            eyebrow={lede.eyebrow}
            headline={lede.headline}
            body={lede.body}
            cta={lede.cta}
            href={lede.href}
            external={"external" in lede ? lede.external : false}
            onNavigate={navigate}
          />

          {/* ── Two-column block: recent work + actions ────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-x-12 gap-y-10 mt-16">
            {/* Recent work */}
            <section>
              <SectionHead n="i" title="Recent Work" />
              {recentResumes.length === 0 ? (
                <EmptyResumes onCreate={() => navigate("/resume-builder")} />
              ) : (
                <ol className="mt-3 divide-y divide-rp-rule border-t border-b border-rp-rule">
                  {recentResumes.map((r, i) => (
                    <li key={r.id}>
                      <button
                        onClick={() => navigate(`/resume-builder/${r.id}`)}
                        className="w-full flex items-baseline gap-5 py-3.5 text-left group"
                      >
                        <span
                          className="text-rp-ink-2/70 w-7 shrink-0 text-right"
                          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.02em" }}
                        >
                          {ordinalNo(i + 1).replace(/^0+/, "") || "0"}
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
                          {r.title || "Untitled résumé"}
                        </span>
                        <span
                          className="text-rp-ink-2/70 hidden sm:inline shrink-0"
                          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.05em", textTransform: "uppercase" }}
                        >
                          {relativeDays(r.updated_at)}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-rp-ink-2/40 group-hover:text-rp-accent shrink-0" strokeWidth={1.6} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <button
                onClick={() => navigate("/documents")}
                className="mt-5 inline-flex items-center gap-1.5 text-rp-ink-2 hover:text-rp-ink transition-colors group"
                style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "12.5px" }}
              >
                Browse all documents
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.6} />
              </button>
            </section>

            {/* Quick actions — restrained list, not gradient tiles */}
            <aside>
              <SectionHead n="ii" title="Workspace" />
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
              <SectionHead n="iii" title="From your auto-pilot" />
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
              <SectionHead n="iv" title="Today's Top Matches" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rp-rule border border-rp-rule mt-3">
                {topMatches.map((m, i) => (
                  <a
                    key={m.evaluation_id}
                    href={m.apply_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="bg-rp-canvas p-5 block hover:bg-rp-paper transition-colors no-underline group"
                  >
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-rp-ink-2/60"
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        № {String(i + 1).padStart(2, "0")} · {m.tier || "—"}
                      </span>
                      <span
                        className="text-rp-accent tabular-nums"
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "12px", fontWeight: 600 }}
                      >
                        {m.score.toFixed(1)}
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
                    {m.summary && (
                      <p
                        className="text-rp-ink-2 mt-3 line-clamp-3"
                        style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "13.5px", lineHeight: 1.45 }}
                      >
                        {m.summary}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ── Pipeline summary footer ───────────────────────────────── */}
          <section className="mt-20 pt-8 border-t border-rp-rule">
            <SectionHead n="v" title="Pipeline Today" />
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

// ─── Masthead ──────────────────────────────────────────────────────────

function Masthead({
  now,
  pipelineActive,
  resumeCount,
  matchCount,
}: {
  now: Date;
  pipelineActive: number;
  resumeCount: number;
  matchCount: number;
}) {
  return (
    <div className="border-b border-rp-rule pb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <span
        className="text-rp-ink"
        style={{
          fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
          fontSize: "14px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        RP · The Daily
      </span>
      <span
        className="text-rp-ink-2/65"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.12em", textTransform: "uppercase" }}
      >
        Vol. {now.getFullYear()} · No. {ordinalNo(dayOfYear(now))}
      </span>
      <span
        className="text-rp-ink-2/65"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.06em" }}
      >
        {fullDate(now)}
      </span>
      <span className="flex-1" />
      <span
        className="text-rp-ink-2/55"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.06em" }}
      >
        {resumeCount} résumé{resumeCount === 1 ? "" : "s"} · {pipelineActive} active · {matchCount} match{matchCount === 1 ? "" : "es"}
      </span>
    </div>
  );
}

// ─── Section head ──────────────────────────────────────────────────────

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="text-rp-accent"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.15em", textTransform: "uppercase" }}
      >
        §{n}
      </span>
      <h2
        className="text-rp-ink"
        style={{
          fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
          fontSize: "22px",
          lineHeight: 1.1,
          letterSpacing: "-0.005em",
          fontWeight: 500,
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
  const Wrapper = (props: { children: React.ReactNode }) =>
    external ? (
      <a href={href} target="_blank" rel="noreferrer noopener" className="block">
        {props.children}
      </a>
    ) : (
      <button onClick={() => onNavigate(href)} className="block text-left w-full">
        {props.children}
      </button>
    );

  return (
    <div className="mt-10 border-y-2 border-rp-ink py-7">
      <Wrapper>
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
      </Wrapper>
    </div>
  );
}

// ─── Empty state for recent resumes ────────────────────────────────────

function EmptyResumes({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-4 border border-rp-rule p-8 bg-rp-paper/40">
      <p
        className="text-rp-ink"
        style={{ fontFamily: '"Manrope", "Inter", system-ui, sans-serif', fontSize: "20px", letterSpacing: "-0.005em", fontWeight: 500 }}
      >
        No résumés on your shelf yet.
      </p>
      <p
        className="text-rp-ink-2 mt-1.5 max-w-md"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: "14px", lineHeight: 1.55 }}
      >
        Start with a blank one, or upload a PDF and let the AI parse it into editable sections.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 bg-rp-ink text-rp-canvas hover:bg-rp-accent transition-colors"
        style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "12.5px", fontWeight: 500 }}
      >
        Create your first résumé
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

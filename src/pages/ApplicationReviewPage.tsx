import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { captureIncident } from "@/lib/incidents";
import { Progress } from "@/components/ui/progress";

interface Draft {
  id: string;
  evaluation_id: string;
  tailored_resume_id: string | null;
  tailored_cv_md: string | null;
  answers: Array<{ question: string; answer: string }>;
  status: "draft" | "ready" | "queued" | "submitted" | "skipped" | "failed";
  submitted_at: string | null;
  evaluation: {
    score: number;
    tier: string;
    summary: string | null;
    scanned_job: {
      id: string;
      title: string;
      apply_url: string;
      company: { name: string };
    };
  };
}

interface AtsScore {
  overall: number;
  dim_format: number;
  dim_keywords: number;
  dim_experience: number;
  dim_skills: number;
  dim_education: number;
  dim_impact: number;
  matched_keywords: string[];
  missing_keywords: string[];
}

interface LooseQueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface LooseQuery {
  select(columns: string): LooseQuery;
  eq(column: string, value: string): LooseQuery;
  order(column: string, options: { ascending: boolean }): LooseQuery;
  limit(count: number): LooseQuery;
  maybeSingle(): Promise<LooseQueryResult>;
}

const migratedTables = supabase as unknown as { from(table: string): LooseQuery };

const ATS_DIMENSIONS: Array<{ key: keyof AtsScore; label: string }> = [
  { key: "dim_format", label: "Format" },
  { key: "dim_keywords", label: "Keywords" },
  { key: "dim_experience", label: "Experience" },
  { key: "dim_skills", label: "Skills" },
  { key: "dim_education", label: "Education" },
  { key: "dim_impact", label: "Impact" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } }),
};

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success("Copied");
        setTimeout(() => setDone(false), 1500);
      }}
      className="h-7 px-3 rounded-md text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}

export default function ApplicationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingSubmitted, setMarkingSubmitted] = useState(false);
  const [queueingSubmit, setQueueingSubmit] = useState(false);
  const [ats, setAts] = useState<AtsScore | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const { data, error } = await supabase
        .from("draft_applications")
        .select(`id, evaluation_id, tailored_resume_id, tailored_cv_md, answers, status, submitted_at,
          evaluation:job_evaluations(score, tier, summary,
            scanned_job:scanned_jobs(id, title, apply_url, company:scan_companies(name))
          )`)
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Draft not found");
        navigate("/matches");
        return;
      }
      setDraft(data as unknown as Draft);
      if (data.tailored_resume_id) {
        const atsResult = await migratedTables
          .from("ats_scores")
          .select("overall,dim_format,dim_keywords,dim_experience,dim_skills,dim_education,dim_impact,matched_keywords,missing_keywords,created_at")
          .eq("user_id", user.id)
          .eq("resume_id", data.tailored_resume_id)
          .eq("scanned_job_id", (data as unknown as Draft).evaluation.scanned_job.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (atsResult.error) {
          void captureIncident(new Error(atsResult.error.message), { source: "manual", operation: "application_ats_load" }, "warning");
        } else {
          setAts((atsResult.data as AtsScore | null) ?? null);
        }
      }
      setLoading(false);
    })();
  }, [id, user, navigate]);

  const queueAutoSubmit = async () => {
    if (!draft) return;
    setQueueingSubmit(true);
    try {
      const { data, error } = await supabase.functions.invoke("career-ops-submit", {
        body: { draft_application_id: draft.id },
      });
      if (error) throw error;
      setDraft({ ...draft, status: "queued" });
      toast.success("Queued safely. The worker will submit only after required fields and attachments pass.");
      void data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      void captureIncident(e, { source: "manual", operation: "application_queue" });
      toast.error(
        msg.includes("403") ? "Enable auto-apply in Preferences first." :
        msg.includes("422") ? "Portal not supported for auto-submit — use Open portal." :
        msg.includes("429") ? "Daily submit cap hit — try tomorrow." :
        msg.includes("409") ? "Already submitted or in an unsubmittable state." :
        `Queue failed: ${msg}`
      );
    } finally {
      setQueueingSubmit(false);
    }
  };

  const markSubmitted = async () => {
    if (!draft) return;
    setMarkingSubmitted(true);
    const { error } = await supabase
      .from("draft_applications")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", draft.id);
    setMarkingSubmitted(false);
    if (error) {
      void captureIncident(new Error(error.message), { source: "manual", operation: "application_mark_submitted" });
      toast.error("Failed to mark submitted");
    } else {
      toast.success("Marked as submitted");
      setDraft({ ...draft, status: "submitted", submitted_at: new Date().toISOString() });
    }
  };

  if (loading || !draft) {
    return (
      <div className="px-6 lg:px-12 py-12 max-w-[1280px] mx-auto">
        <div className="h-10 w-40 rounded-full bg-foreground/5 animate-pulse mb-8" />
        <div className="h-72 rounded-2xl bg-foreground/5 animate-pulse" />
      </div>
    );
  }

  const job = draft.evaluation.scanned_job;

  return (
    <div className="px-6 lg:px-12 py-10 lg:py-12 max-w-[1280px] mx-auto space-y-10">
      <motion.header initial="hidden" animate="visible" variants={fadeUp} custom={0}>
        <button
          onClick={() => navigate("/matches")}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          ← Matches
        </button>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-1.5">
              Application draft · {job.company.name}
            </p>
            <h1 className="text-[28px] sm:text-[32px] font-bold text-foreground tracking-tight leading-tight max-w-[28ch]">
              {job.title}
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground max-w-[64ch] leading-relaxed">
              {draft.evaluation.summary}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center justify-center w-12 h-12 rounded-full text-[14px] font-bold tabular-nums",
              draft.evaluation.tier === "A" ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
            )}>
              {Number(draft.evaluation.score).toFixed(1)}
            </span>
            {draft.status === "submitted" ? (
              <span className="h-9 px-3 inline-flex items-center rounded-md text-[12px] text-muted-foreground border border-border">
                Submitted {new Date(draft.submitted_at!).toLocaleDateString()}
              </span>
            ) : draft.status === "queued" ? (
              <span className="h-9 px-3 inline-flex items-center rounded-md text-[12px] text-muted-foreground border border-border bg-muted">
                Queued for worker checks…
              </span>
            ) : (
              <>
                <a
                  href={job.apply_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="h-9 px-4 inline-flex items-center rounded-md text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  Open portal
                </a>
                <button
                  onClick={queueAutoSubmit}
                  disabled={queueingSubmit}
                  className="h-9 px-3.5 inline-flex items-center rounded-md text-[13px] text-foreground border border-border hover:bg-muted transition-colors disabled:opacity-50"
                  title="Queue a guarded Greenhouse submission (auto-apply must be enabled)"
                >
                  {queueingSubmit ? "Queueing…" : "Queue application"}
                </button>
                <button
                  onClick={markSubmitted}
                  disabled={markingSubmitted}
                  className="h-9 px-3.5 inline-flex items-center rounded-md text-[13px] text-foreground border border-border hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {markingSubmitted ? "Saving…" : "Mark submitted"}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {ats && (
        <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={1} className="glass-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4 lg:w-64">
              <div className={cn(
                "flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-[7px] tabular-nums",
                ats.overall >= 80 ? "border-emerald-500/25 text-emerald-700 dark:text-emerald-400" :
                ats.overall >= 65 ? "border-amber-500/25 text-amber-700 dark:text-amber-400" :
                "border-rose-500/25 text-rose-700 dark:text-rose-400",
              )}>
                <span className="text-2xl font-bold">{Math.round(ats.overall)}</span>
                <span className="text-[9px] uppercase tracking-wider">ATS</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Exact tailored résumé</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">This score belongs to this job-specific version, not the source résumé.</p>
              </div>
            </div>
            <div className="grid flex-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3">
              {ATS_DIMENSIONS.map((dimension) => {
                const value = Number(ats[dimension.key] ?? 0);
                return (
                  <div key={dimension.key}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{dimension.label}</span>
                      <span className="font-semibold tabular-nums">{Math.round(value)}%</span>
                    </div>
                    <Progress value={value} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
          {(ats.matched_keywords.length > 0 || ats.missing_keywords.length > 0) && (
            <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <p className="text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Matched:</span> {ats.matched_keywords.slice(0, 10).join(" · ") || "—"}</p>
              <p className="text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Missing:</span> {ats.missing_keywords.slice(0, 10).join(" · ") || "—"}</p>
            </div>
          )}
        </motion.section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* Tailored CV */}
        <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={1} className="glass-card p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold text-foreground">Tailored résumé</p>
            <div className="flex items-center gap-2">
              {draft.tailored_cv_md && <Copy value={draft.tailored_cv_md} />}
              {draft.tailored_resume_id && (
                <button
                  onClick={() => navigate(`/resume-builder/${draft.tailored_resume_id}`)}
                  className="h-7 px-3 rounded-md text-[11.5px] text-foreground border border-border hover:bg-muted transition-colors"
                >
                  Open editor
                </button>
              )}
            </div>
          </div>
          <pre className="text-[13px] leading-[1.55] text-foreground whitespace-pre-wrap max-h-[560px] overflow-y-auto pr-2 font-sans">
            {draft.tailored_cv_md || "No tailored CV generated yet."}
          </pre>
        </motion.section>

        {/* Draft answers */}
        <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={2} className="glass-card p-6">
          <p className="text-[13px] font-semibold text-foreground mb-4">Draft answers</p>
          <ol className="space-y-5">
            {draft.answers.map((a, i) => (
              <li key={i} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13.5px] font-semibold text-foreground leading-snug flex-1">
                    {String(i + 1).padStart(2, "0")} · {a.question}
                  </p>
                  <Copy value={a.answer} />
                </div>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  {a.answer}
                </p>
              </li>
            ))}
          </ol>
        </motion.section>
      </div>

      <div className="text-[12px] text-muted-foreground">
        Read it through before you submit. Review every claim. These drafts are yours to edit.
      </div>
    </div>
  );
}

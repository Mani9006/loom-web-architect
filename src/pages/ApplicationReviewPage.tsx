import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, AlertTriangle, Check, Copy as CopyIcon, Download, ExternalLink, FileCheck2, FileText, Loader2, MessageSquareText, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import TailoringReportCard from "@/components/TailoringReportCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { captureIncident } from "@/lib/incidents";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TailoringReport } from "../../supabase/functions/_shared/tailoring-report-core.ts";

type DraftStatus = "draft" | "ready" | "queued" | "submitted" | "skipped" | "failed";
type DetailTab = "form" | "resume" | "cover" | "activity";

interface Answer { question: string; answer: string }
interface Draft {
  id: string;
  evaluation_id: string;
  tailored_resume_id: string | null;
  tailored_cv_md: string | null;
  tailored_cv_pdf_url: string | null;
  answers: Answer[];
  status: DraftStatus;
  applypass_task_id: string | null;
  error_message: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  evaluation: {
    score: number;
    fit_score: number | null;
    dimension_scores: Array<{ label: string; score: number; weight: number }> | null;
    tier: string;
    summary: string | null;
    scanned_job: { id: string; title: string; apply_url: string; company: { name: string } };
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

interface TaskState {
  id: string;
  status: string;
  error_message: string | null;
  run_log: unknown;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const dimensions: Array<{ key: keyof AtsScore; label: string }> = [
  { key: "dim_format", label: "Format" }, { key: "dim_keywords", label: "Keywords" },
  { key: "dim_experience", label: "Experience" }, { key: "dim_skills", label: "Skills" },
  { key: "dim_education", label: "Education" }, { key: "dim_impact", label: "Impact" },
];

function normalizeAnswers(value: unknown): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return typeof row.question === "string" && typeof row.answer === "string" ? [{ question: row.question, answer: row.answer }] : [];
  });
}

function statusLabel(status: DraftStatus): string {
  return { draft: "Optimizing", ready: "Ready for review", queued: "Submission in progress", submitted: "Submitted", skipped: "Skipped", failed: "Needs attention" }[status];
}

function lifecycleIndex(status: DraftStatus): number {
  if (status === "submitted" || status === "skipped") return 3;
  if (status === "queued" || status === "failed") return 2;
  if (status === "ready") return 1;
  return 0;
}

export default function ApplicationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ats, setAts] = useState<AtsScore | null>(null);
  const [task, setTask] = useState<TaskState | null>(null);
  const [tab, setTab] = useState<DetailTab>("form");
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [report, setReport] = useState<TailoringReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadReport = useCallback(async (draftId: string) => {
    setReportLoading(true);
    const { data, error } = await supabase.functions.invoke("career-ops-tailor-report", {
      body: { draft_application_id: draftId },
    });
    setReportLoading(false);
    if (error || !data?.report) {
      // Expected while the tailored packet is not ready; the card renders a
      // graceful "report generating" placeholder instead of an error toast.
      setReport(null);
      return;
    }
    setReport(data.report as TailoringReport);
  }, []);

  const load = useCallback(async (initial = false) => {
    if (!user || !id) return;
    const { data, error } = await supabase.from("draft_applications")
      .select(`id,evaluation_id,tailored_resume_id,tailored_cv_md,tailored_cv_pdf_url,answers,status,applypass_task_id,error_message,submitted_at,created_at,updated_at,
        evaluation:job_evaluations(score,fit_score,dimension_scores,tier,summary,scanned_job:scanned_jobs(id,title,apply_url,company:scan_companies(name)))`)
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error || !data) {
      toast.error("Application record not found");
      navigate("/applications");
      return;
    }
    const nextDraft = { ...(data as unknown as Draft), answers: normalizeAnswers(data.answers) };
    setDraft(nextDraft);

    const requests: PromiseLike<unknown>[] = [];
    if (nextDraft.tailored_resume_id) {
      requests.push((supabase as any).from("ats_scores")
        .select("overall,dim_format,dim_keywords,dim_experience,dim_skills,dim_education,dim_impact,matched_keywords,missing_keywords")
        .eq("user_id", user.id).eq("resume_id", nextDraft.tailored_resume_id).eq("scanned_job_id", nextDraft.evaluation.scanned_job.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(({ data: score }: { data: AtsScore | null }) => setAts(score)));
    }
    if (nextDraft.applypass_task_id) {
      requests.push(supabase.from("applypass_tasks")
        .select("id,status,error_message,run_log,attempt_count,max_attempts,created_at,started_at,completed_at")
        .eq("id", nextDraft.applypass_task_id).eq("user_id", user.id).maybeSingle()
        .then(({ data: taskData }) => setTask(taskData as TaskState | null)));
    } else setTask(null);
    await Promise.allSettled(requests);
    if (initial) setLoading(false);
  }, [id, navigate, user]);

  useEffect(() => {
    void load(true);
    if (!user || !id) return;
    const channel = supabase.channel(`application-record-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_applications", filter: `id=eq.${id}` }, () => void load())
      .subscribe();
    const poll = window.setInterval(() => { if (draft?.status === "queued") void load(); }, 10_000);
    return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
  }, [draft?.status, id, load, user]);

  // "What changed" report: fetch on mount and whenever the packet is refreshed
  // (updated_at moves when the tailor regenerates the résumé/answers).
  useEffect(() => {
    if (draft?.id && draft.tailored_resume_id) void loadReport(draft.id);
  }, [draft?.id, draft?.tailored_resume_id, draft?.updated_at, loadReport]);

  const coverNote = useMemo(() => draft?.answers.find((answer) => /cover (letter|note)/i.test(answer.question)) || null, [draft]);
  const formAnswers = useMemo(() => draft?.answers.filter((answer) => !/cover (letter|note)/i.test(answer.question)) || [], [draft]);

  async function queueApplication() {
    if (!draft) return;
    setQueueing(true);
    const { error } = await supabase.functions.invoke("career-ops-submit", { body: { draft_application_id: draft.id } });
    setQueueing(false);
    if (error) {
      void captureIncident(error, { source: "manual", operation: "application_queue" });
      toast.error("Automatic submission is unavailable for this job or policy. Your packet remains ready and the employer link is still available.");
      return;
    }
    toast.success("Submission queued. This page will update as each check completes.");
    await load();
    setTab("activity");
  }

  async function refreshPacket() {
    if (!draft) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("career-ops-tailor", { body: { evaluation_id: draft.evaluation_id, allow_outside_preferences: true, force: true } });
      if (error || !data?.draft?.tailored_resume_id) throw error ?? new Error("resume_missing");
      const { error: atsError } = await supabase.functions.invoke("career-ops-ats", { body: { resume_id: data.draft.tailored_resume_id, scanned_job_id: draft.evaluation.scanned_job.id } });
      if (atsError) throw atsError;
      toast.success("Résumé, cover note, answers, and ATS preview refreshed from your verified profile.");
      await load();
    } catch (error) {
      void captureIncident(error, { source: "manual", operation: "application_packet_refresh" });
      toast.error("This packet could not be refreshed right now. Your existing version is unchanged.");
    } finally { setRefreshing(false); }
  }

  async function markSubmitted() {
    if (!draft) return;
    setMarking(true);
    const submittedAt = new Date().toISOString();
    const { error } = await supabase.from("draft_applications").update({ status: "submitted", submitted_at: submittedAt }).eq("id", draft.id).eq("user_id", user!.id);
    setMarking(false);
    if (error) toast.error("The status could not be saved.");
    else { toast.success("Application marked submitted"); await load(); }
  }

  async function downloadPdf() {
    if (!draft?.tailored_resume_id) return;
    setRendering(true);
    const { data, error } = await supabase.functions.invoke("mc-render-resume", {
      body: { resume_id: draft.tailored_resume_id, format: "pdf" },
    });
    setRendering(false);
    if (error || !data?.url) {
      toast.error("The tailored résumé PDF could not be generated. The text preview is unchanged.");
      return;
    }
    window.open(String(data.url), "_blank", "noopener,noreferrer");
    setDraft((current) => current ? { ...current, tailored_cv_pdf_url: String(data.url) } : current);
  }

  if (loading || !draft) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  const job = draft.evaluation.scanned_job;
  const fit = Math.round(draft.evaluation.fit_score ?? draft.evaluation.score * 20);
  const handoffRequired = draft.status !== "submitted" && /employer verification|required.*verification|complete the final check/i.test(draft.error_message || "");
  const activePhase = handoffRequired ? 2 : lifecycleIndex(draft.status);
  const phases = ["Optimize", "Review", "Submit", "Done"];
  const logs = Array.isArray(task?.run_log) ? task.run_log as Array<Record<string, unknown>> : [];
  const fitDimensions = Array.isArray(draft.evaluation.dimension_scores) ? draft.evaluation.dimension_scores : [];
  const keywordMatches = Array.isArray(ats?.matched_keywords) ? ats.matched_keywords.length : 0;
  const keywordMissing = Array.isArray(ats?.missing_keywords) ? ats.missing_keywords.length : 0;
  const keywordTotal = keywordMatches + keywordMissing;

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <button onClick={() => navigate("/applications")} className="text-xs text-muted-foreground hover:text-foreground">← Applications</button>
      <header className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">{job.company.name}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", draft.status === "submitted" ? "bg-emerald-500/10 text-emerald-600" : draft.status === "failed" || handoffRequired ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary")}>{handoffRequired ? "Verification required" : statusLabel(draft.status)}</span></div><h1 className="mt-2 text-3xl font-bold tracking-tight">{job.title}</h1>{draft.evaluation.summary && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{draft.evaluation.summary}</p>}</div>
        <div className="flex flex-wrap items-center gap-2"><div className="mr-2 text-center"><p className="text-2xl font-bold tabular-nums">{fit}%</p><p className="text-xs text-muted-foreground font-medium">career fit</p></div><Button asChild><a href={job.apply_url} target="_blank" rel="noreferrer noopener"><ExternalLink className="mr-2 h-4 w-4" />{handoffRequired ? "Finish verification" : "Employer portal"}</a></Button>{!(["submitted", "queued"] as DraftStatus[]).includes(draft.status) && <><Button variant="outline" onClick={refreshPacket} disabled={refreshing}><RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />{refreshing ? "Refreshing…" : "Refresh packet"}</Button>{!handoffRequired && <Button variant="outline" onClick={queueApplication} disabled={queueing}><Send className="mr-2 h-4 w-4" />{queueing ? "Queueing…" : "Queue application"}</Button>}<Button variant="ghost" onClick={markSubmitted} disabled={marking}>{marking ? "Saving…" : handoffRequired ? "I finished, mark submitted" : "Mark submitted"}</Button></>}</div>
      </header>

      <p className="mt-2 text-xs text-muted-foreground">Career fit is a deterministic match across role, demonstrated skills, experience/level, location, compensation, and authorization. It is separate from the ATS résumé-readiness score below.</p>

      <section className="mt-7 border border-rp-rule bg-rp-paper p-5" aria-label="Application progress"><div className="grid grid-cols-4">{phases.map((phase, index) => <div key={phase} className="relative flex flex-col items-center text-center"><div className={cn("absolute left-0 right-0 top-3 h-px", index === 0 ? "left-1/2" : index === 3 ? "right-1/2" : "", index <= activePhase ? "bg-primary" : "bg-border")} /><span className={cn("relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-xs", index < activePhase || draft.status === "submitted" ? "border-primary bg-primary text-primary-foreground" : index === activePhase ? "border-primary bg-background text-primary" : "border-border bg-background text-muted-foreground")}>{index < activePhase || draft.status === "submitted" ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span className="mt-2 text-xs font-medium">{phase}</span></div>)}</div>{draft.status !== "submitted" && draft.error_message && <div className={cn("mt-4 flex gap-2 border p-3 text-xs", handoffRequired ? "border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200" : "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300")}><AlertTriangle className="h-4 w-4 shrink-0" /><div><p className="font-semibold">{handoffRequired ? "One employer check remains" : "Submission needs attention"}</p><p className="mt-1">{draft.error_message || task?.error_message || "Your packet and employer link remain available."}</p></div></div>}</section>

      {fitDimensions.length > 0 && <section className="mt-5 border border-rp-rule bg-rp-paper p-5" aria-label="Career fit calculation"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Career fit calculation</h2><p className="mt-1 text-xs text-muted-foreground">The headline percentage is the weighted total of these evidence-backed dimensions. It is not keyword coverage.</p></div><span className="text-lg font-bold tabular-nums">{fit}%</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fitDimensions.map((dimension) => { const rawWeight = Number(dimension.weight) || 0; const weight = rawWeight > 1 ? rawWeight : rawWeight * 100; return <div key={dimension.label}><div className="mb-1 flex justify-between text-xs"><span>{dimension.label}</span><span className="tabular-nums">{Math.round(Number(dimension.score) || 0)}% · {Math.round(weight)}% weight</span></div><Progress value={Math.max(0, Math.min(100, Number(dimension.score) || 0))} className="h-1.5" /></div>; })}</div></section>}

      {ats && <section className="mt-5 border border-rp-rule bg-rp-canvas p-5"><div className="grid gap-5 lg:grid-cols-[190px_1fr]"><div className="flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-[7px] border-primary/20"><span className="text-xl font-bold">{Math.round(ats.overall)}%</span><span className="text-xs font-medium">ATS</span></div><div><p className="text-sm font-semibold">ATS résumé readiness</p><p className="mt-1 text-xs text-muted-foreground">A weighted check of this tailored résumé against this job. Different from career fit.</p>{keywordTotal > 0 && <p className="mt-2 text-xs text-muted-foreground">Keyword coverage: {keywordMatches}/{keywordTotal} terms matched ({Math.round(ats.dim_keywords)}%).</p>}</div></div><div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">{dimensions.map((dimension) => { const value = Number(ats[dimension.key] || 0); const label = dimension.key === "dim_keywords" ? "Keyword coverage" : dimension.label; return <div key={dimension.key}><div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span>{Math.round(value)}%</span></div><Progress value={value} className="h-1.5" /></div>; })}</div></div></section>}

      <div className="mt-6 flex flex-wrap gap-1 border-b border-rp-rule">{[
        { id: "form" as const, label: "Submitted form", icon: FileCheck2 }, { id: "resume" as const, label: "Résumé", icon: FileText },
        { id: "cover" as const, label: "Cover note", icon: MessageSquareText }, { id: "activity" as const, label: "Activity", icon: Activity },
      ].map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={cn("inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium", tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}><item.icon className="h-3.5 w-3.5" />{item.label}</button>)}</div>

      <section className="min-h-80 border border-t-0 border-rp-rule bg-rp-paper p-5 sm:p-6">
        {tab === "form" && <div><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">Application answers</h2><p className="mt-1 text-xs text-muted-foreground">The exact reusable answers prepared for this employer.</p></div></div>{formAnswers.length ? <ol className="mt-6 divide-y divide-rp-rule">{formAnswers.map((answer, index) => <li key={`${answer.question}-${index}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)_auto]"><p className="text-xs font-semibold">{answer.question}</p><p className="text-sm leading-relaxed text-muted-foreground">{answer.answer}</p><CopyButton value={answer.answer} /></li>)}</ol> : <Empty text="No additional employer questions were saved for this application." />}</div>}
        {tab === "resume" && <div><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Tailored résumé</h2><p className="mt-1 text-xs text-muted-foreground">The text below is an audit preview. The application uses the generated, ATS-friendly PDF artifact.</p></div><div className="flex gap-2">{draft.tailored_resume_id && <Button variant="outline" size="sm" onClick={() => navigate(`/resume-builder/${draft.tailored_resume_id}`)}>Open editor</Button>}{draft.tailored_resume_id && <Button size="sm" onClick={() => void downloadPdf()} disabled={rendering}><Download className="mr-2 h-4 w-4" />{rendering ? "Rendering…" : "Download PDF"}</Button>}</div></div><div className="mt-6"><TailoringReportCard report={report} loading={reportLoading} /></div>{draft.tailored_cv_md ? <pre className="mt-6 max-h-[700px] overflow-y-auto whitespace-pre-wrap border border-rp-rule bg-background p-6 font-sans text-sm leading-relaxed">{draft.tailored_cv_md}</pre> : <Empty text="No tailored résumé was generated." />}</div>}
        {tab === "cover" && <div><h2 className="text-base font-semibold">Cover note</h2><p className="mt-1 text-xs text-muted-foreground">Generated only when useful or requested by the employer.</p>{coverNote ? <div className="mt-6 border border-rp-rule bg-background p-6"><div className="flex justify-end"><CopyButton value={coverNote.answer} /></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{coverNote.answer}</p></div> : <Empty text="No cover note is attached to this application." />}</div>}
        {tab === "activity" && <div><h2 className="text-base font-semibold">Application activity</h2><p className="mt-1 text-xs text-muted-foreground">Preparation, queue attempts, worker checks, and outcome for this job.</p><div className="mt-6 space-y-3"><ActivityRow title="Packet prepared" date={draft.created_at} detail="Tailored résumé and application answers created." />{task && <ActivityRow title={`Submission ${task.status}`} date={task.completed_at || task.started_at || task.created_at} detail={`Attempt ${task.attempt_count} of ${task.max_attempts}${task.error_message ? ` · ${task.error_message}` : ""}`} />}{logs.map((entry, index) => <ActivityRow key={index} title={String(entry.step || entry.status || entry.event || `Worker event ${index + 1}`)} date={typeof entry.at === "string" ? entry.at : typeof entry.timestamp === "string" ? entry.timestamp : null} detail={String(entry.message || entry.detail || "Application check recorded.")} />)}{draft.submitted_at && <ActivityRow title="Submitted" date={draft.submitted_at} detail="Submission recorded successfully." />}{!task && !draft.submitted_at && <ActivityRow title="Awaiting your decision" date={draft.updated_at} detail="Review the packet, queue supported automation, or open the employer portal." />}</div></div>}
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Only a Submitted outcome counts as applied. Queued means the worker is still checking and completing the application.</p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }} className="inline-flex h-7 items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">{copied ? <Check className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>;
}

function Empty({ text }: { text: string }) { return <div className="mt-6 flex min-h-44 items-center justify-center border border-dashed border-rp-rule p-6 text-center text-sm text-muted-foreground">{text}</div>; }

function ActivityRow({ title, date, detail }: { title: string; date: string | null; detail: string }) {
  return <div className="grid gap-1 border-l-2 border-primary/30 py-2 pl-4 sm:grid-cols-[180px_1fr_auto]"><p className="text-sm font-semibold capitalize">{title}</p><p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>{date && <time className="text-xs text-muted-foreground">{new Date(date).toLocaleString()}</time>}</div>;
}

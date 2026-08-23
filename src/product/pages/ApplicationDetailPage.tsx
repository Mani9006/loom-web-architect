import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { db, invokeFunction } from "@/product/lib/table";
import { QueueStage, TailorMotion } from "@/product/components/TailorMotion";
import { StatusChip } from "@/product/components/StatusChip";
import { PageSkeleton } from "@/product/components/Skeleton";
import { EmptyState } from "@/product/components/EmptyState";
import { useInbox } from "@/product/hooks/useInbox";
import { useApply } from "@/product/hooks/useApply";
import { applyFromAddress, atsSupported, detectAts, relativeTime } from "@/product/lib/format";

type DetailTab = "form" | "resume" | "cover" | "job";

interface Answer { question: string; answer: string }

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { address } = useInbox();
  const { submitDraft, busyId } = useApply();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("form");
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [sourceBullets, setSourceBullets] = useState<string[]>([]);
  const [tailoredBullets, setTailoredBullets] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!user || !id) return;
    const { data, error } = await db()
      .from("draft_applications")
      .select(`id,status,error_message,submitted_at,created_at,updated_at,applypass_task_id,tailored_resume_id,tailored_cv_md,tailored_cv_pdf_url,answers,
        evaluation:job_evaluations(id,score,fit_score,summary,scanned_job:scanned_jobs(id,title,apply_url,description_md,location,company:scan_companies(name)))`)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Application not found");
      navigate("/applications");
      return;
    }
    setDraft(data as Record<string, unknown>);
    const taskId = (data as { applypass_task_id?: string }).applypass_task_id;
    if (taskId) {
      const { data: taskData } = await db().from("applypass_tasks").select("*").eq("id", taskId).maybeSingle();
      setTask((taskData || null) as Record<string, unknown> | null);
    }
    const report = await invokeFunction<{ report?: { changes?: Array<{ before?: string; after?: string }> } }>("career-ops-tailor-report", {
      draft_application_id: id,
    });
    const changes = report.data?.report?.changes || [];
    setSourceBullets(changes.map((c) => c.before || "").filter(Boolean).slice(0, 6));
    setTailoredBullets(changes.map((c) => c.after || "").filter(Boolean).slice(0, 6));
    setLoading(false);
  }, [user, id, navigate]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(poll);
  }, [load]);

  const status = String(draft?.status || "draft");
  const evaluation = (draft?.evaluation || {}) as Record<string, unknown>;
  const job = (evaluation.scanned_job || {}) as Record<string, unknown>;
  const company = ((job.company as { name?: string } | null)?.name) || "Company";
  const applyUrl = String(job.apply_url || "");
  const portal = detectAts(applyUrl);
  const answers = useMemo(() => normalizeAnswers(draft?.answers), [draft]);
  const grouped = useMemo(() => groupAnswers(answers), [answers]);
  const cover = answers.find((a) => /cover (letter|note)/i.test(a.question))?.answer || "";
  const stage = deriveStage(status, String(task?.status || ""));

  if (loading || !draft) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <header>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{company}</p>
            <h1 className="mt-1 text-[24px] font-semibold tracking-tight">{String(job.title || "Application")}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip status={status} />
              <span className="text-[12px] text-muted-foreground">{relativeTime(String(draft.updated_at || ""))}</span>
              {!atsSupported(portal) && <StatusChip status="needs_you" label={`${portal} unsupported`} />}
            </div>
          </header>

          <QueueStage stage={stage} />
          <TailorMotion
            before={sourceBullets.length ? sourceBullets : ["Led analytics work on the source resume.", "Shipped a reporting pipeline."]}
            after={tailoredBullets.length ? tailoredBullets : status === "draft" || status === "queued" ? ["Aligning language to this JD…", "Keeping employers, dates, and metrics locked."] : ["Tailored packet ready. Claims stay grounded."]}
            active={stage === "tailoring" || stage === "queued"}
          />

          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(["form", "resume", "cover", "job"] as DetailTab[]).map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`h-8 flex-1 rounded-md text-[12px] capitalize ${tab === item ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {item === "form" ? "Form receipt" : item === "resume" ? "Resume" : item === "cover" ? "Cover" : "Job"}
              </button>
            ))}
          </div>

          {tab === "form" && (
            <div className="space-y-4">
              {Object.entries(grouped).map(([group, fields]) => (
                <section key={group} className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group}</h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {fields.map((field) => (
                      <div key={field.question}>
                        <dt className="text-[11px] text-muted-foreground">{field.question}</dt>
                        <dd className="text-[13px]">{field.answer || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {answers.length === 0 && <EmptyState title="No form receipt yet" body="Fields appear after tailoring. We will not invent answers." />}
            </div>
          )}

          {tab === "resume" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {draft.tailored_cv_pdf_url && (
                  <a href={String(draft.tailored_cv_pdf_url)} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-[13px] no-underline">
                    <Download className="h-3.5 w-3.5" /> Download tailored
                  </a>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <pre className="min-h-[240px] whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 text-[12px] leading-relaxed">Source locked. Tailoring cannot add employers, dates, or metrics.</pre>
                <pre className="min-h-[240px] whitespace-pre-wrap rounded-xl border border-primary/20 bg-card p-4 text-[12px] leading-relaxed">{String(draft.tailored_cv_md || "Tailored resume will render here.")}</pre>
              </div>
            </div>
          )}

          {tab === "cover" && (
            cover
              ? <pre className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-[13px] leading-relaxed">{cover}</pre>
              : <EmptyState title="No cover letter for this packet" body="Cover stays off unless you enable it in Hands-off apply or write one on My resume." />
          )}

          {tab === "job" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <a href={applyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary">
                <ExternalLink className="h-3.5 w-3.5" /> View original posting
              </a>
              <pre className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{String(job.description_md || "Description not cached.")}</pre>
            </div>
          )}

          {status === "failed" && (
            <div className="flex flex-wrap gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="w-full text-[13px]">{String(draft.error_message || "Submission failed. This is not marked submitted.")}</p>
              {draft.tailored_cv_pdf_url && <a href={String(draft.tailored_cv_pdf_url)} className="h-9 rounded-md border border-border px-3 text-[13px] leading-9 no-underline">Download resume</a>}
              <button type="button" className="h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => void skip(id!)}>Skip</button>
              <button type="button" className="h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => toast.message("Keep it in Needs you until you finish on the employer site. We will not fake submitted.")}>I've applied</button>
            </div>
          )}

          {(status === "ready" || (!atsSupported(portal) && status !== "submitted")) && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <p className="text-[13px] font-medium">Needs you — complete this packet. We will not mark it submitted.</p>
              <button
                type="button"
                className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] text-primary-foreground disabled:opacity-50"
                disabled={busyId === id || !atsSupported(portal)}
                onClick={() => id && void submitDraft(id)}
              >
                {busyId === id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {atsSupported(portal) ? "Queue supported submit" : "Unsupported ATS"}
              </button>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Apply-from email</p>
            <p className="mt-2 break-all font-mono text-[12px]">{address || applyFromAddress(user?.email, user?.id || "user")}</p>
            <p className="mt-2 text-[12px] text-muted-foreground">Employer mail should land here or in a connected inbox.</p>
          </section>
          <RelatedInbox company={company} />
        </aside>
      </div>
    </div>
  );
}

function RelatedInbox({ company }: { company: string }) {
  const { allThreads } = useInbox();
  const related = allThreads.filter((t) => t.subject.toLowerCase().includes(company.toLowerCase()) || t.from.toLowerCase().includes(company.toLowerCase())).slice(0, 4);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Related inbox</p>
      {related.length === 0 ? <p className="mt-2 text-[12px] text-muted-foreground">No recruiter mail linked yet.</p> : (
        <ul className="mt-2 space-y-2">
          {related.map((thread) => (
            <li key={thread.id} className="text-[12px]">
              <p className="font-medium">{thread.subject}</p>
              <p className="text-muted-foreground">{thread.category}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function normalizeAnswers(value: unknown): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return typeof row.question === "string" && typeof row.answer === "string" ? [{ question: row.question, answer: row.answer }] : [];
  });
}

function groupAnswers(answers: Answer[]): Record<string, Answer[]> {
  const groups: Record<string, Answer[]> = { Identity: [], Work: [], Authorization: [], Other: [] };
  for (const answer of answers) {
    const q = answer.question.toLowerCase();
    if (/name|email|phone|linkedin|address|city/.test(q)) groups.Identity.push(answer);
    else if (/authoriz|sponsor|visa|citizen|work permit/.test(q)) groups.Authorization.push(answer);
    else if (/experience|salary|notice|company|title/.test(q)) groups.Work.push(answer);
    else groups.Other.push(answer);
  }
  return Object.fromEntries(Object.entries(groups).filter(([, rows]) => rows.length));
}

function deriveStage(status: string, taskStatus: string): "queued" | "tailoring" | "filling" | "submitted" | "failed" | "needs_you" {
  if (status === "submitted") return "submitted";
  if (status === "failed") return "failed";
  if (status === "ready") return "needs_you";
  if (status === "draft") return "tailoring";
  if (taskStatus === "running") return "filling";
  return "queued";
}

async function skip(id: string) {
  await db().from("draft_applications").update({ status: "skipped" }).eq("id", id);
  toast.message("Skipped. Not submitted.");
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Building2, MapPin, ExternalLink, FileText, Calendar, Sparkles, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { runOnLocalWorker, resumeRowToMarkdown, type JobStatus } from "@/lib/mc-ai-jobs";
import AddJobManuallyDialog from "./AddJobManuallyDialog";
import EditTrackedJobDialog from "./EditTrackedJobDialog";

const COLUMNS: { id: TrackedStatus; label: string; tone: string }[] = [
  { id: "discovered", label: "Discovered", tone: "bg-slate-100 text-slate-700" },
  { id: "saved", label: "Saved", tone: "bg-blue-50 text-blue-700" },
  { id: "applied", label: "Applied", tone: "bg-indigo-50 text-indigo-700" },
  { id: "viewed", label: "Viewed", tone: "bg-purple-50 text-purple-700" },
  { id: "interview", label: "Interview", tone: "bg-amber-50 text-amber-700" },
  { id: "take_home", label: "Take-home", tone: "bg-orange-50 text-orange-700" },
  { id: "offer", label: "Offer", tone: "bg-emerald-50 text-emerald-700" },
  { id: "hold", label: "Hold", tone: "bg-zinc-50 text-zinc-600" },
  { id: "rejected", label: "Rejected", tone: "bg-red-50 text-red-700" },
  { id: "withdrawn", label: "Withdrawn", tone: "bg-zinc-100 text-zinc-500" },
];

type TrackedStatus =
  | "discovered"
  | "saved"
  | "applied"
  | "viewed"
  | "interview"
  | "take_home"
  | "offer"
  | "hold"
  | "rejected"
  | "withdrawn";

interface TrackedJob {
  id: string;
  job_title: string;
  company: string;
  location: string | null;
  apply_url: string | null;
  status: TrackedStatus;
  applied_at: string | null;
  clicked_at: string | null;
  jd_md: string | null;
  tailored_resume_id: string | null;
  notes: string | null;
  updated_at: string;
}

export default function BoardTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrackedJob | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState<{ jobId: string; status: JobStatus } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TrackedJob | null>(null);

  async function tailorJob(job: TrackedJob) {
    if (!job.jd_md || !job.jd_md.trim()) {
      toast({
        title: "No job description saved",
        description: "Add the JD to this card first, then try again.",
        variant: "destructive",
      });
      return;
    }
    // Pull a base resume to feed into the tailor prompt. Three-tier lookup:
    //   1. session's master_resume_id (if explicitly set)
    //   2. the user's most recently updated resume (fallback so users don't
    //      have to pre-configure anything)
    //   3. nothing — tell them to create one in Resume Builder
    const { data: sessRow } = await (supabase as any)
      .from("mc_sessions")
      .select("master_resume_id")
      .eq("id", sessionId)
      .maybeSingle();

    let masterMd = "";

    // Tier 1: session's pinned master resume.
    // The Resume Builder stores resumes as separate JSON columns (personal_info,
    // summary, experience, education, ...), not a single content field — so we
    // SELECT * and stitch them with resumeRowToMarkdown.
    if (sessRow?.master_resume_id) {
      const { data: res } = await (supabase as any)
        .from("resumes")
        .select("*")
        .eq("id", sessRow.master_resume_id)
        .maybeSingle();
      if (res) masterMd = resumeRowToMarkdown(res);
    }

    // Tier 2: latest resume from the user's account.
    if (!masterMd) {
      const { data: latest } = await (supabase as any)
        .from("resumes")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);
      const row = (latest ?? [])[0];
      if (row) {
        masterMd = resumeRowToMarkdown(row);
        if (masterMd) {
          toast({
            title: "Using your most recent resume",
            description:
              "Set a specific master resume in Settings to control which one the AI uses.",
          });
        }
      }
    }

    // Tier 3: no resume at all.
    if (!masterMd) {
      toast({
        title: "Create a resume first",
        description:
          "The AI tailor needs a base resume. Open Resume Builder (in the left nav), make one, then come back and click Tailor with AI again.",
        variant: "destructive",
      });
      return;
    }

    const prompt = [
      "You are an expert resume tailor. Rewrite the candidate's resume below to maximize fit for the target job, ATS-aligned.",
      "STRICT RULES:",
      "- Do NOT invent any companies, employers, dates, metrics, certifications, or skills the candidate doesn't have.",
      "- Keep all original employment dates and titles unchanged.",
      "- Pull keywords from the JD into the resume's bullet points only where the candidate's experience genuinely supports them.",
      "- Output ONLY the tailored resume in markdown. No commentary before or after.",
      "",
      "──────── TARGET JOB ────────",
      `Company: ${job.company}`,
      `Title: ${job.job_title}`,
      job.location ? `Location: ${job.location}` : "",
      "",
      "Job description:",
      job.jd_md,
      "",
      "──────── CANDIDATE'S MASTER RESUME ────────",
      masterMd,
      "",
      "Tailored resume in markdown:",
    ]
      .filter(Boolean)
      .join("\n");

    setTailoring({ jobId: job.id, status: "queued" });
    try {
      const { result, jobId: aiJobId } = await runOnLocalWorker({
        kind: "tailor",
        sessionId,
        prompt,
        model: "sonnet-4-6",
        input: { tracked_job_id: job.id, company: job.company, job_title: job.job_title },
        timeoutMs: 6 * 60 * 1000,
        onProgress: (s) => setTailoring({ jobId: job.id, status: s }),
      });
      void aiJobId;

      const { data: userData } = await supabase.auth.getUser();
      const { data: tailoredRow, error: insertErr } = await (supabase as any)
        .from("mc_tailored_resumes")
        .insert({
          user_id: userData?.user?.id,
          session_id: sessionId,
          source_job_id: null,
          name: `${job.company} — ${job.job_title}`,
          cv_md: result,
        })
        .select("id")
        .single();
      if (insertErr || !tailoredRow) {
        throw new Error(insertErr?.message || "Couldn't save tailored resume");
      }
      await (supabase as any)
        .from("mc_tracked_jobs")
        .update({ tailored_resume_id: tailoredRow.id })
        .eq("id", job.id);
      setJobs((arr) =>
        arr.map((j) => (j.id === job.id ? { ...j, tailored_resume_id: tailoredRow.id } : j))
      );
      setSelected((cur) => (cur && cur.id === job.id ? { ...cur, tailored_resume_id: tailoredRow.id } : cur));
      toast({ title: "Tailored resume ready", description: "Open it in the Resumes tab." });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      toast({ title: "Tailoring failed", description: msg, variant: "destructive" });
    } finally {
      setTailoring(null);
    }
  }

  async function load() {
    setLoading(true);
    // Filter out soft-deleted cards (deleted_at IS NULL). The Trash dialog
    // surfaces deleted_at IS NOT NULL rows separately.
    const { data, error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .select("*")
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load board", description: error.message, variant: "destructive" });
    } else {
      setJobs((data as TrackedJob[]) ?? []);
    }
    setLoading(false);
  }

  // Soft-delete with 5-second undo via toast action.
  async function trashJob(job: TrackedJob, e?: React.MouseEvent) {
    e?.stopPropagation();
    // Optimistic remove from local state
    setJobs((arr) => arr.filter((j) => j.id !== job.id));
    setSelected((cur) => (cur && cur.id === job.id ? null : cur));

    const deletedAt = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .update({ deleted_at: deletedAt })
      .eq("id", job.id);

    if (error) {
      // Roll back local state on failure
      setJobs((arr) => [...arr, job]);
      toast({ title: "Couldn't move to trash", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Moved to trash",
      description: `${job.company} · ${job.job_title}`,
      duration: 5000,
      action: (
        <ToastAction
          altText="Undo"
          onClick={async () => {
            const { error: undoErr } = await (supabase as any)
              .from("mc_tracked_jobs")
              .update({ deleted_at: null })
              .eq("id", job.id);
            if (undoErr) {
              toast({
                title: "Undo failed",
                description: undoErr.message,
                variant: "destructive",
              });
              return;
            }
            // Re-add to local state
            setJobs((arr) => [{ ...job, updated_at: new Date().toISOString() }, ...arr]);
            toast({ title: "Restored" });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  async function moveTo(jobId: string, status: TrackedStatus) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === status) return;
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "applied" && !job.applied_at) updates.applied_at = new Date().toISOString();

    // Optimistic update: reflect the move immediately in the UI.
    const previousStatus = job.status;
    setJobs((arr) => arr.map((j) => (j.id === jobId ? { ...j, ...updates } : j) as TrackedJob));
    setSelected((cur) => (cur && cur.id === jobId ? ({ ...cur, ...updates } as TrackedJob) : cur));

    const { error } = await (supabase as any).from("mc_tracked_jobs").update(updates).eq("id", jobId);
    if (error) {
      // Roll back the optimistic update on failure.
      setJobs((arr) => arr.map((j) => (j.id === jobId ? { ...j, status: previousStatus } : j) as TrackedJob));
      setSelected((cur) => (cur && cur.id === jobId ? ({ ...cur, status: previousStatus } as TrackedJob) : cur));
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      await (supabase as any).from("mc_status_history").insert({
        tracked_job_id: jobId,
        user_id: authData.user.id,
        status_from: previousStatus,
        status_to: status,
        source: "manual",
      });
    }
  }

  if (loading) {
    return (
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-fit">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-[260px] shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <>
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-muted-foreground mb-4">
            No jobs on the board yet. Save some from the <strong>Discover</strong> tab — or add
            one manually if the scanner hasn't found matches yet.
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add job manually
          </Button>
        </Card>
        <AddJobManuallyDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          sessionId={sessionId}
          onCreated={async () => {
            setAddOpen(false);
            await load();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {jobs.length} {jobs.length === 1 ? "card" : "cards"} on the board
        </p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add job manually
        </Button>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-fit">
          {COLUMNS.map((col) => {
            const items = jobs.filter((j) => j.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => draggedId && moveTo(draggedId, col.id)}
                className="w-[260px] shrink-0"
              >
                <div className={`px-3 py-1.5 rounded-md text-[11px] font-medium ${col.tone} flex items-center justify-between`}>
                  <span>{col.label}</span>
                  <span className="opacity-60">{items.length}</span>
                </div>
                <div className="space-y-2 mt-2 min-h-[200px]">
                  {items.map((job) => (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={() => setDraggedId(job.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onClick={() => setSelected(job)}
                      className="group relative bg-card border rounded-md p-3 text-[12px] cursor-pointer hover:border-primary/40 hover:shadow-sm transition"
                    >
                      <button
                        type="button"
                        aria-label="Move to trash"
                        title="Move to trash"
                        onClick={(e) => trashJob(job, e)}
                        className="absolute top-1.5 right-1.5 p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="font-medium leading-tight pr-6">{job.job_title}</div>
                      <div className="text-muted-foreground text-[11px] mt-1 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {job.company}
                      </div>
                      {job.location && (
                        <div className="text-muted-foreground text-[11px] mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </div>
                      )}
                      {job.applied_at && (
                        <div className="text-muted-foreground text-[10px] mt-1.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(job.applied_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.job_title}</SheetTitle>
                <SheetDescription>
                  {selected.company} {selected.location ? `· ${selected.location}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-6">
                <div className="flex flex-wrap gap-2">
                  {COLUMNS.map((col) => (
                    <Button
                      key={col.id}
                      variant={col.id === selected.status ? "default" : "outline"}
                      size="sm"
                      className="text-[11px]"
                      onClick={() => moveTo(selected.id, col.id)}
                    >
                      {col.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.apply_url && (
                    <Button asChild variant="outline" size="sm">
                      <a href={selected.apply_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open application
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setEditing(selected)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => tailorJob(selected)}
                    disabled={tailoring?.jobId === selected.id}
                  >
                    {tailoring?.jobId === selected.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        {tailoring.status === "queued" && "Queued…"}
                        {tailoring.status === "running" && "Tailoring…"}
                        {tailoring.status === "done" && "Saving…"}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 mr-1" /> Tailor with AI
                      </>
                    )}
                  </Button>
                </div>

                {selected.tailored_resume_id && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/my-collection/${sessionId}?tab=resumes&resume=${selected.tailored_resume_id}`}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> View tailored resume
                    </Link>
                  </Button>
                )}

                {selected.jd_md && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Job description</h4>
                    <div className="bg-muted rounded p-3 text-xs whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {selected.jd_md}
                    </div>
                  </div>
                )}

                {selected.notes && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground">{selected.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AddJobManuallyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sessionId={sessionId}
        onCreated={async () => {
          setAddOpen(false);
          await load();
        }}
      />

      <EditTrackedJobDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        job={editing}
        onSaved={(updated) => {
          setJobs((arr) =>
            arr.map((j) => (j.id === updated.id ? ({ ...j, ...updated } as TrackedJob) : j))
          );
          setSelected((cur) => (cur && cur.id === updated.id ? ({ ...cur, ...updated } as TrackedJob) : cur));
          setEditing(null);
        }}
        onDeleted={(jobId) => {
          setJobs((arr) => arr.filter((j) => j.id !== jobId));
          setSelected((cur) => (cur && cur.id === jobId ? null : cur));
          setEditing(null);
        }}
      />
    </>
  );
}

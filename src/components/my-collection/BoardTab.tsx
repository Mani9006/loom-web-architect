import { useEffect, useState } from "react";
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
import { Building2, MapPin, ExternalLink, FileText, Calendar } from "lucide-react";

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

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      
.from("mc_tracked_jobs")
      .select("*")
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load board", description: error.message, variant: "destructive" });
    } else {
      setJobs((data as TrackedJob[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  async function moveTo(jobId: string, status: TrackedStatus) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === status) return;
    const updates: Record<string, unknown> = { status };
    if (status === "applied" && !job.applied_at) updates.applied_at = new Date().toISOString();
    const { error } = await (supabase as any).from("mc_tracked_jobs").update(updates).eq("id", jobId);
    if (error) {
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
      return;
    }
    setJobs((arr) => arr.map((j) => (j.id === jobId ? { ...j, ...updates } : j) as TrackedJob));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await (supabase as any).from("mc_status_history").insert({
        tracked_job_id: jobId,
        user_id: user.id,
        status_from: job.status,
        status_to: status,
        source: "manual",
      });
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <p className="text-sm text-muted-foreground">
          No jobs on the board yet. Save some from the <strong>Discover</strong> tab to get started.
        </p>
      </Card>
    );
  }

  return (
    <>
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
                      className="bg-card border rounded-md p-3 text-[12px] cursor-pointer hover:border-primary/40 hover:shadow-sm transition"
                    >
                      <div className="font-medium leading-tight">{job.job_title}</div>
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

                {selected.apply_url && (
                  <Button asChild variant="outline" size="sm">
                    <a href={selected.apply_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open application
                    </a>
                  </Button>
                )}

                {selected.tailored_resume_id && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/my-collection/${sessionId}?tab=resumes&resume=${selected.tailored_resume_id}`}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> View tailored resume
                    </a>
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
    </>
  );
}

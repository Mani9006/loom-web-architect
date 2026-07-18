import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Briefcase, Building2, Clock, Target, Trash2, Loader2,
  Bookmark, MapPin, DollarSign, Globe, X, FileText, Sparkles, Zap, BarChart3, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { trackProductEvent } from "@/lib/product-analytics";
import { JobApplyButton } from "@/components/JobApplyButton";
import { JobDescription } from "@/components/JobDescription";

interface Job {
  id: string;
  title: string;
  company: string;
  status: string;
  created_at: string;
}

type DraftApplicationStatus = "draft" | "ready" | "queued" | "submitted" | "skipped" | "failed";

const EMPTY_AUTOMATION_COUNTS: Record<DraftApplicationStatus, number> = {
  draft: 0,
  ready: 0,
  queued: 0,
  submitted: 0,
  skipped: 0,
  failed: 0,
};

const COLUMNS = [
  { key: "Saved", color: "border-t-muted-foreground" },
  { key: "Applied", color: "border-t-primary" },
  { key: "Interviewing", color: "border-t-accent" },
  { key: "Offer", color: "border-t-accent" },
  { key: "Rejected", color: "border-t-destructive" },
];

interface SavedJobDetail {
  id: string;
  job_title: string;
  company: string;
  location: string | null;
  description: string | null;
  apply_url: string | null;
  salary: string | null;
  job_type: string | null;
  remote: boolean;
  date_posted: string | null;
  source: string | null;
  saved_at: string;
}

interface ApplicationPacket {
  id: string;
  status: DraftApplicationStatus;
  tailored_resume_id: string | null;
  created_at: string;
  submitted_at: string | null;
  evaluation: {
    score: number;
    fit_score: number | null;
    scanned_job: {
      title: string;
      apply_url: string | null;
      company: { name: string };
    };
  };
}

interface WorkerRuntime {
  online: boolean;
  lastSeen: string | null;
}

const PACKET_STATUS: Record<DraftApplicationStatus, { label: string; note: string }> = {
  draft: { label: "Preparing", note: "Packet is still being assembled." },
  ready: { label: "Ready for review", note: "Résumé and answers are ready; nothing has been submitted." },
  queued: { label: "Queued", note: "Waiting for guarded worker checks; no submission receipt yet." },
  submitted: { label: "Submitted", note: "A submission receipt was recorded." },
  skipped: { label: "Skipped", note: "The application was intentionally held." },
  failed: { label: "Needs attention", note: "Review the packet and use the employer portal if needed." },
};

function JobDetailPanel({
  job,
  onClose,
}: {
  job: { title: string; company: string; location?: string | null; description?: string | null; apply_url?: string | null; salary?: string | null; job_type?: string | null; remote?: boolean; date_posted?: string | null; source?: string | null };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full max-w-lg bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold truncate">Job Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {/* Job header */}
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-tight">{job.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
                {job.location && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {job.location}
                  </p>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {job.remote && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs gap-1">
                  <Globe className="w-3 h-3" /> Remote
                </Badge>
              )}
              {job.job_type && <Badge variant="secondary" className="text-xs">{job.job_type}</Badge>}
              {job.salary && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <DollarSign className="w-3 h-3" /> {job.salary}
                </Badge>
              )}
              {job.date_posted && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="w-3 h-3" /> {job.date_posted}
                </Badge>
              )}
              {job.source && <Badge variant="outline" className="text-xs capitalize">{job.source}</Badge>}
            </div>

            {/* Apply button */}
            <JobApplyButton
              job={{
                title: job.title,
                company: job.company,
                location: job.location,
                apply_url: job.apply_url,
                source: job.source,
              }}
            />

            {/* Description */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-2">About the Job</h4>
              {job.description ? (
                <JobDescription value={job.description} />
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No description available.</p>
                  {job.apply_url && (
                    <p className="text-xs mt-1">Click "Apply Now" to see full details on the job board.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export default function JobTracker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedJobDetails, setSavedJobDetails] = useState<SavedJobDetail[]>([]);
  const [search, setSearch] = usePersistedState("jobTracker.search", "", "sessionStorage");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newJob, setNewJob] = useState({ title: "", company: "" });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [automationCounts, setAutomationCounts] = useState(EMPTY_AUTOMATION_COUNTS);
  const [applicationPackets, setApplicationPackets] = useState<ApplicationPacket[]>([]);
  const [workerRuntime, setWorkerRuntime] = useState<WorkerRuntime>({ online: false, lastSeen: null });

  const [selectedSavedJob, setSelectedSavedJob] = useState<SavedJobDetail | null>(null);
  const [selectedKanbanJob, setSelectedKanbanJob] = useState<Job | null>(null);
  // Look up saved_jobs detail for kanban card if available
  const kanbanJobDetail = useMemo(() => {
    if (!selectedKanbanJob) return null;
    return savedJobDetails.find(
      (s) => s.job_title === selectedKanbanJob.title && s.company === selectedKanbanJob.company
    ) || null;
  }, [selectedKanbanJob, savedJobDetails]);

  const tabView = searchParams.get("tab"); // "saved" or null (all)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setUserId(user.id);

      // Load tracked jobs (Kanban)
      const { data } = await supabase
        .from("tracked_jobs")
        .select("id, title, company, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setJobs(data || []);

      // Load saved job details (for the Saved Jobs view)
      const { data: savedData } = await supabase
        .from("saved_jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("saved_at", { ascending: false });

      setSavedJobDetails((savedData as SavedJobDetail[]) || []);

      // Keep preparation and submission states observable in the same workspace.
      // Older environments without the career-ops migration can still load the tracker.
      const { data: draftData } = await supabase
        .from("draft_applications")
        .select(`id,status,tailored_resume_id,created_at,submitted_at,
          evaluation:job_evaluations(score,fit_score,
            scanned_job:scanned_jobs(title,apply_url,company:scan_companies(name))
          )`)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (draftData) {
        const packets = draftData as unknown as ApplicationPacket[];
        setApplicationPackets(packets);
        const next = { ...EMPTY_AUTOMATION_COUNTS };
        packets.forEach(({ status }) => {
          if (status in next) next[status as DraftApplicationStatus] += 1;
        });
        setAutomationCounts(next);
      }

      const { data: heartbeat } = await supabase
        .from("mc_worker_heartbeats")
        .select("last_seen")
        .eq("user_id", user.id)
        .maybeSingle();
      const lastSeen = heartbeat?.last_seen || null;
      setWorkerRuntime({
        online: Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < 90_000),
        lastSeen,
      });
      setLoading(false);
    };
    load();
  }, [navigate]);

  const addJob = async () => {
    if (!newJob.title.trim() || !userId) return;

    const { data, error } = await supabase
      .from("tracked_jobs")
      .insert({ title: newJob.title, company: newJob.company, status: "Saved", user_id: userId })
      .select("id, title, company, status, created_at")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to add job", variant: "destructive" });
      return;
    }

    setJobs((prev) => [data, ...prev]);
    setNewJob({ title: "", company: "" });
    setDialogOpen(false);
    toast({ title: "Job added", description: `${data.title} saved to tracker` });
    void trackProductEvent("job_added", { status: "Saved" });
  };

  const moveJob = async (jobId: string, newStatus: string) => {
    const current = jobs.find((j) => j.id === jobId);
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));

    const { error } = await supabase
      .from("tracked_jobs")
      .update({ status: newStatus })
      .eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      return;
    }
    void trackProductEvent("job_status_changed", { from: current?.status || "unknown", to: newStatus });
  };

  const deleteJob = async (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));

    const { error } = await supabase
      .from("tracked_jobs")
      .delete()
      .eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: "Failed to delete job", variant: "destructive" });
      return;
    }
    void trackProductEvent("job_deleted");
  };

  const deleteSavedJobDetail = async (savedJob: SavedJobDetail) => {
    // Remove from saved_jobs
    await supabase.from("saved_jobs").delete().eq("id", savedJob.id);
    // Also remove matching tracked_job if status is "Saved"
    if (userId) {
      await supabase
        .from("tracked_jobs")
        .delete()
        .eq("user_id", userId)
        .eq("title", savedJob.job_title)
        .eq("company", savedJob.company)
        .eq("status", "Saved");
    }
    setSavedJobDetails((prev) => prev.filter((j) => j.id !== savedJob.id));
    setJobs((prev) => prev.filter((j) => !(j.title === savedJob.job_title && j.company === savedJob.company && j.status === "Saved")));
    toast({ title: "Saved job removed" });
  };

  const filteredJobs = jobs.filter(
    (j) => j.title.toLowerCase().includes(search.toLowerCase()) || j.company.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSavedDetails = savedJobDetails.filter(
    (j) => j.job_title.toLowerCase().includes(search.toLowerCase()) || j.company.toLowerCase().includes(search.toLowerCase())
  );

  const filteredApplicationPackets = applicationPackets.filter((packet) => {
    const job = packet.evaluation?.scanned_job;
    const query = search.toLowerCase();
    return !query || job?.title.toLowerCase().includes(query) || job?.company?.name.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-1">
            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="h-full bg-muted/20 animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ===== SAVED JOBS VIEW =====
  if (tabView === "saved") {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-primary" /> Saved Jobs
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredSavedDetails.length} saved job{filteredSavedDetails.length !== 1 ? "s" : ""} from search
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search saved jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-48" />
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate("/job-tracker")}>
              <Target className="w-4 h-4" /> All Applications
            </Button>
          </div>
        </div>

        {filteredSavedDetails.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Bookmark className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="text-lg font-medium">No saved jobs yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Save jobs from Job Search to see them here</p>
              <Button className="mt-4 gap-2" onClick={() => navigate("/job-search")}>
                <Search className="w-4 h-4" /> Go to Job Search
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3">
            {filteredSavedDetails.map((job) => (
              <Card
                key={job.id}
                className="p-4 hover:shadow-md transition-shadow group cursor-pointer"
                onClick={() => setSelectedSavedJob(job)}
              >
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base leading-tight">{job.job_title}</h3>
                        <p className="text-sm text-muted-foreground">{job.company}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div onClick={(e) => e.stopPropagation()}>
                          <JobApplyButton
                            job={{
                              title: job.job_title,
                              company: job.company,
                              location: job.location,
                              apply_url: job.apply_url,
                              source: job.source,
                            }}
                            variant="compact"
                          />
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSavedJobDetail(job); }}
                          className="p-1.5 rounded-md hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Remove from saved"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {job.location && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <MapPin className="w-3 h-3" /> {job.location}
                        </Badge>
                      )}
                      {job.remote && (
                        <Badge variant="secondary" className="text-xs gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <Globe className="w-3 h-3" /> Remote
                        </Badge>
                      )}
                      {job.salary && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <DollarSign className="w-3 h-3" /> {job.salary}
                        </Badge>
                      )}
                      {job.job_type && <Badge variant="outline" className="text-xs">{job.job_type}</Badge>}
                      {job.date_posted && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock className="w-3 h-3" /> {job.date_posted}
                        </Badge>
                      )}
                      {job.source && <Badge variant="outline" className="text-xs capitalize">{job.source}</Badge>}
                    </div>

                    {job.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
                    )}

                    <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      Saved {formatDistanceToNow(new Date(job.saved_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

        )}

        {/* Job detail slide-over panel */}
        {selectedSavedJob && (
          <JobDetailPanel
            job={{
              title: selectedSavedJob.job_title,
              company: selectedSavedJob.company,
              location: selectedSavedJob.location,
              description: selectedSavedJob.description,
              apply_url: selectedSavedJob.apply_url,
              salary: selectedSavedJob.salary,
              job_type: selectedSavedJob.job_type,
              remote: selectedSavedJob.remote,
              date_posted: selectedSavedJob.date_posted,
              source: selectedSavedJob.source,
            }}
            onClose={() => setSelectedSavedJob(null)}
          />
        )}
      </div>
    );
  }

  // ===== DEFAULT: KANBAN VIEW =====
  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 pt-10 pb-10 h-full flex flex-col">
      <PageHeader
        title="Applications."
        status="kanban · pipeline"
        description="One record for every opportunity—from match and tailored resume through application, interview, and offer."
      />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-px bg-rp-rule border border-rp-rule mb-6">
        <button onClick={() => navigate("/matches")} className="bg-rp-canvas p-3.5 text-left hover:bg-rp-paper transition-colors">
          <Sparkles className="w-4 h-4 text-rp-accent" strokeWidth={1.7} />
          <p className="mt-2 text-sm font-semibold text-rp-ink">Matched jobs</p>
          <p className="mt-0.5 text-xs text-rp-ink-2">Review fit and tailor a resume.</p>
        </button>
        <button onClick={() => navigate("/agent")} className="bg-rp-canvas p-3.5 text-left hover:bg-rp-paper transition-colors">
          <Zap className="w-4 h-4 text-rp-accent" strokeWidth={1.7} />
          <p className="mt-2 text-sm font-semibold text-rp-ink">Agent</p>
          <p className="mt-0.5 text-xs text-rp-ink-2">Matches, tailored packets, ATS, and safe queue controls.</p>
        </button>
        <button
          onClick={() => navigate(applicationPackets[0] ? `/applications/${applicationPackets[0].id}` : "/matches")}
          className="bg-rp-canvas p-3.5 text-left hover:bg-rp-paper transition-colors"
        >
          <FileText className="w-4 h-4 text-rp-accent" strokeWidth={1.7} />
          <p className="mt-2 text-sm font-semibold text-rp-ink">Application packets</p>
          <p className="mt-0.5 text-xs text-rp-ink-2">Tailored résumé, ATS evidence, cover letter, and answers.</p>
        </button>
        <button onClick={() => navigate("/analytics")} className="bg-rp-canvas p-3.5 text-left hover:bg-rp-paper transition-colors">
          <BarChart3 className="w-4 h-4 text-rp-accent" strokeWidth={1.7} />
          <p className="mt-2 text-sm font-semibold text-rp-ink">Outcomes</p>
          <p className="mt-0.5 text-xs text-rp-ink-2">Track conversion and follow-up activity.</p>
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 border-y border-rp-rule mb-6" aria-label="Application automation status">
        {[
          { label: "Prepared", value: automationCounts.draft + automationCounts.ready },
          { label: "Queued", value: automationCounts.queued },
          { label: "Submitted", value: automationCounts.submitted },
          { label: "Failed", value: automationCounts.failed },
          { label: "Skipped", value: automationCounts.skipped },
        ].map((item) => (
          <div key={item.label} className="px-3 py-3 border-r border-rp-rule last:border-r-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-rp-ink/50">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-rp-ink">{item.value}</p>
          </div>
        ))}
      </div>
      {automationCounts.queued > 0 && (
        <section className={cn(
          "mb-6 flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between",
          workerRuntime.online ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
        )} aria-live="polite">
          <div>
            <p className="text-sm font-semibold text-rp-ink">
              {workerRuntime.online ? "Submission worker is processing the queue" : "Submission worker is offline"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">
              {workerRuntime.online
                ? "The browser worker is filling the employer form. This changes to Submitted only after a verifiable receipt."
                : `${automationCounts.queued} application${automationCounts.queued === 1 ? " is" : "s are"} saved safely, but nothing can be submitted until an application worker is online.`}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/agent")}>Open Agent status</Button>
        </section>
      )}
      {applicationPackets.length > 0 && (
        <section className="mb-6" aria-labelledby="application-packets-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="application-packets-title" className="text-sm font-semibold text-rp-ink">Application packets</h2>
              <p className="mt-0.5 text-xs text-rp-ink-2">Every tailored résumé stays attached to its job and submission state.</p>
            </div>
            <span className="text-[11px] tabular-nums text-rp-ink-3">{filteredApplicationPackets.length} shown</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredApplicationPackets.map((packet) => {
              const job = packet.evaluation.scanned_job;
              const status = PACKET_STATUS[packet.status];
              const fit = Math.round(packet.evaluation.fit_score ?? packet.evaluation.score * 20);
              return (
                <article key={packet.id} className="border border-rp-rule bg-rp-paper p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-none text-[10px]">{status.label}</Badge>
                        <span className="text-[11px] font-semibold tabular-nums text-rp-accent">{fit}% career fit</span>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-rp-ink">{job.title}</h3>
                      <p className="mt-0.5 text-xs text-rp-ink-2">{job.company.name}</p>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/applications/${packet.id}`)}>Review</Button>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-rp-ink-2">{status.note}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rp-rule pt-3">
                    {packet.tailored_resume_id && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/resume-builder/${packet.tailored_resume_id}`)}>
                        <FileText className="h-3.5 w-3.5" /> Résumé used
                      </Button>
                    )}
                    {job.apply_url && (
                      <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                        <a href={job.apply_url} target="_blank" rel="noreferrer noopener">Employer portal <ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                    <span className="ml-auto text-[10px] text-rp-ink-3">
                      {packet.submitted_at ? `Submitted ${new Date(packet.submitted_at).toLocaleDateString()}` : formatDistanceToNow(new Date(packet.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <div className="flex items-center justify-end gap-2 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rp-ink-3" />
          <Input aria-label="Search applications" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-48" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Job</Button>
          </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Job</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label htmlFor="new-job-title">Job Title</Label><Input id="new-job-title" value={newJob.title} onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Software Engineer" /></div>
                <div><Label htmlFor="new-job-company">Company</Label><Input id="new-job-company" value={newJob.company} onChange={(e) => setNewJob((p) => ({ ...p, company: e.target.value }))} placeholder="e.g. Google" /></div>
                <Button onClick={addJob} className="w-full">Add Job</Button>
              </div>
            </DialogContent>
          </Dialog>
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {COLUMNS.map((col) => {
          const count = jobs.filter((j) => j.status === col.key).length;
          return (
            <div key={col.key} className={cn("rounded-lg border px-3 py-2 border-t-2", col.color)}>
              <p className="text-xs text-muted-foreground">{col.key}</p>
              <p className="text-lg font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 min-h-0 overflow-x-auto">
        {COLUMNS.map((col) => {
          const colJobs = filteredJobs.filter((j) => j.status === col.key);
          return (
            <div
              key={col.key}
              className="flex flex-col min-h-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const jobId = e.dataTransfer.getData("jobId");
                if (jobId) moveJob(jobId, col.key);
              }}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-semibold">{col.key}</h3>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                  {colJobs.length}
                </span>
              </div>

              <div className={cn("flex-1 rounded-xl bg-muted/20 border border-dashed border-border p-2 space-y-2 overflow-y-auto border-t-2", col.color)}>
                {colJobs.length === 0 && (
                  <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
                    Drop jobs here
                  </div>
                )}
                {colJobs.map((job) => (
                  <Card
                    key={job.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("jobId", job.id)}
                    onClick={() => setSelectedKanbanJob(job)}
                    className="p-3 cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow-card-hover)] transition-all group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{job.title}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="w-3 h-3" /><span className="truncate">{job.company || "—"}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                        aria-label={`Delete ${job.title}${job.company ? ` at ${job.company}` : ""}`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Job detail slide-over panel for kanban cards */}
      {selectedKanbanJob && (
        <JobDetailPanel
          job={kanbanJobDetail ? {
            title: kanbanJobDetail.job_title,
            company: kanbanJobDetail.company,
            location: kanbanJobDetail.location,
            description: kanbanJobDetail.description,
            apply_url: kanbanJobDetail.apply_url,
            salary: kanbanJobDetail.salary,
            job_type: kanbanJobDetail.job_type,
            remote: kanbanJobDetail.remote,
            date_posted: kanbanJobDetail.date_posted,
            source: kanbanJobDetail.source,
          } : {
            title: selectedKanbanJob.title,
            company: selectedKanbanJob.company,
          }}
          onClose={() => setSelectedKanbanJob(null)}
        />
      )}
    </div>
  );
}

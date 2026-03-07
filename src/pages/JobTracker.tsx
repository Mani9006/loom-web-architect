import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Bookmark, ExternalLink, MapPin, DollarSign, Globe, X, FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { trackProductEvent } from "@/lib/product-analytics";

interface Job {
  id: string;
  title: string;
  company: string;
  status: string;
  created_at: string;
}

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
            {job.apply_url && (
              <Button className="gap-1.5 w-full" asChild>
                <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                  Apply Now <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}

            {/* Description */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-2">About the Job</h4>
              {job.description ? (
                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                  {job.description}
                </div>
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
                        {job.apply_url && (
                          <Button size="sm" className="gap-1.5 h-8" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                              Apply <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        )}
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
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Target className="w-5 h-5 text-accent" /> Job Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Drag and drop to update status</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Job</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Job</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Job Title</Label><Input value={newJob.title} onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Software Engineer" /></div>
                <div><Label>Company</Label><Input value={newJob.company} onChange={(e) => setNewJob((p) => ({ ...p, company: e.target.value }))} placeholder="e.g. Google" /></div>
                <Button onClick={addJob} className="w-full">Add Job</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, SlidersHorizontal, Briefcase, Building2, Clock, Target } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  title: string;
  company: string;
  status: string;
  addedAt: Date;
}

const COLUMNS = [
  { key: "Saved", color: "border-t-muted-foreground" },
  { key: "Applied", color: "border-t-primary" },
  { key: "Interviewing", color: "border-t-accent" },
  { key: "Offer", color: "border-t-accent" },
  { key: "Rejected", color: "border-t-destructive" },
];

export default function JobTracker() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newJob, setNewJob] = useState({ title: "", company: "", status: "Saved" });

  const addJob = () => {
    if (!newJob.title.trim()) return;
    setJobs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: newJob.title, company: newJob.company, status: newJob.status, addedAt: new Date() },
    ]);
    setNewJob({ title: "", company: "", status: "Saved" });
    setDialogOpen(false);
  };

  const moveJob = (jobId: string, newStatus: string) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));
  };

  const filteredJobs = jobs.filter(
    (j) => j.title.toLowerCase().includes(search.toLowerCase()) || j.company.toLowerCase().includes(search.toLowerCase())
  );

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

      <div className="flex-1 grid grid-cols-5 gap-4 min-h-0 overflow-x-auto">
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
                    className="p-3 cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow-card-hover)] transition-all"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{job.title}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="w-3 h-3" /><span className="truncate">{job.company}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDistanceToNow(job.addedAt, { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

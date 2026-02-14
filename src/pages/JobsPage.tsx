import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, Building2, MapPin, Clock, ExternalLink, Bookmark, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  postedAgo: string;
  description: string;
}

const SAMPLE_JOBS: JobListing[] = [
  { id: "1", title: "Software Engineer - Full-Time", company: "Tech Corp", location: "San Francisco, CA", salary: "$120k - $180k", postedAgo: "2 days ago", description: "We are looking for a skilled software engineer to join our growing team. You will be responsible for designing, developing, and maintaining high-quality software solutions..." },
  { id: "2", title: "Frontend Developer", company: "StartupXYZ", location: "Remote", salary: "$100k - $140k", postedAgo: "3 days ago", description: "Join our innovative team as a Frontend Developer. You will work closely with designers and backend engineers to build beautiful, performant web applications..." },
  { id: "3", title: "Data Scientist", company: "Analytics Inc", location: "New York, NY", salary: "$130k - $170k", postedAgo: "5 days ago", description: "We're seeking a Data Scientist to help us make data-driven decisions. You'll work with large datasets, build predictive models, and communicate insights to stakeholders..." },
  { id: "4", title: "DevOps Engineer", company: "CloudFirst", location: "Austin, TX", salary: "$110k - $160k", postedAgo: "1 week ago", description: "Looking for a DevOps Engineer to manage our cloud infrastructure, CI/CD pipelines, and ensure high availability of our services..." },
  { id: "5", title: "Product Manager", company: "InnovateCo", location: "Seattle, WA", salary: "$140k - $190k", postedAgo: "1 week ago", description: "We need a Product Manager to drive product strategy and execution. You'll work cross-functionally with engineering, design, and marketing teams..." },
];

export default function JobsPage() {
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(SAMPLE_JOBS[0]);

  const filtered = SAMPLE_JOBS.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full">
      {/* Left Panel - Job List */}
      <div className="w-[480px] border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold">Jobs</h1>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-44"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Filter
              </Button>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Latest Jobs</h2>
            <p className="text-xs text-muted-foreground">{filtered.length} results found</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className={cn(
                "p-4 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors",
                selectedJob?.id === job.id && "bg-primary/5 border-l-2 border-l-primary"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm">{job.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {job.company}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {job.location}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">Posted {job.postedAgo}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Job Details */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedJob ? (
          <div className="max-w-3xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{selectedJob.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {selectedJob.company}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {selectedJob.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> {selectedJob.salary}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Posted {selectedJob.postedAgo}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-6">
              <Button className="gap-2">
                <ExternalLink className="w-4 h-4" /> Apply
              </Button>
              <Button variant="outline" className="gap-2">
                <Bookmark className="w-4 h-4" /> Save
              </Button>
            </div>

            <div className="prose prose-sm max-w-none text-foreground">
              <p className="text-sm leading-relaxed">{selectedJob.description}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a job to view details
          </div>
        )}
      </div>
    </div>
  );
}

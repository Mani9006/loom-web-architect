import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, MapPin, Briefcase, ExternalLink, Building2,
  Clock, DollarSign, Loader2, Bookmark, ChevronLeft, ChevronRight,
  SlidersHorizontal, Globe,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  logo?: string;
  location: string;
  description: string;
  apply_url: string;
  date_posted: string;
  salary_min?: number;
  salary_max?: number;
  job_type: string;
  remote: boolean;
  source: string;
}

export default function JobSearchPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [jobType, setJobType] = useState("all");
  const [datePosted, setDatePosted] = useState("week");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Load user's resume to extract default query
  useEffect(() => {
    if (user) loadDefaultQuery();
  }, [user]);

  const loadDefaultQuery = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("resumes")
      .select("personal_info, skills, summary")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      // Extract a sensible default search from resume
      const info = data.personal_info as any;
      const skills = data.skills as any;
      if (info?.jobTitle) setQuery(info.jobTitle);
      if (info?.location) setLocation(info.location);
    }
  };

  const searchJobs = async (searchPage = 1) => {
    setLoading(true);
    setHasSearched(true);
    setPage(searchPage);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      // Use user JWT if logged in, otherwise fall back to anon key for public job search
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt8F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g";
      const authToken = token || anonKey;

      // Try new V2 endpoint first, fall back to original
      let response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://woxtbyotydxorcdhhivr.supabase.co"}/functions/v1/job-search-v2`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            query: query || "software engineer",
            location,
            jobType: jobType !== "all" ? jobType : undefined,
            remote,
            datePosted,
            page: searchPage,
          }),
        }
      );

      if (!response.ok) {
        // Fall back to original job search if v2 not deployed yet
        console.log("V2 not available, falling back to original job search");
        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL || "https://woxtbyotydxorcdhhivr.supabase.co"}/functions/v1/job-search`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              resumeText: query || "software engineer",
              filters: { jobType, workLocation: remote ? "remote" : "all", datePosted },
            }),
          }
        );

        if (!response.ok) throw new Error("Job search failed");

        // Original endpoint returns streaming text, not structured data
        // For now, show a message
        setJobs([]);
        toast({ title: "Tip", description: "Deploy the job-search-v2 edge function for structured job results." });
        return;
      }

      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error("Search failed:", err);
      toast({ title: "Search failed", description: "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveJob = async (job: Job) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("tracked_jobs").insert({
        user_id: user.id,
        title: job.title,
        company: job.company,
        url: job.apply_url,
        status: "Saved",
      });
      if (error) throw error;
      toast({ title: "Job saved", description: `${job.title} at ${job.company} added to your tracker.` });
    } catch {
      toast({ title: "Error", description: "Failed to save job", variant: "destructive" });
    }
  };

  const formatSalary = (min?: number, max?: number) => {
    if (!min && !max) return null;
    const fmt = (n: number) => `$${(n / 1000).toFixed(0)}k`;
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `${fmt(min)}+`;
    return `Up to ${fmt(max!)}`;
  };

  const timeAgo = (date: string) => {
    if (!date) return "Recently";
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="w-6 h-6 text-primary" />
            Job Discovery
          </h1>
          <p className="text-muted-foreground mt-1">Search real-time job listings from multiple sources</p>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Job title, skills, or keywords..."
                  className="pl-10 h-11"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchJobs()}
                />
              </div>
              <div className="relative flex-1 sm:max-w-[200px]">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Location..."
                  className="pl-10 h-11"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchJobs()}
                />
              </div>
              <Button onClick={() => searchJobs()} disabled={loading} className="h-11 gap-2 px-6">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t">
                <div className="space-y-1.5">
                  <Label className="text-xs">Job Type</Label>
                  <Select value={jobType} onValueChange={setJobType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="fulltime">Full Time</SelectItem>
                      <SelectItem value="parttime">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date Posted</Label>
                  <Select value={datePosted} onValueChange={setDatePosted}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="3days">Last 3 days</SelectItem>
                      <SelectItem value="week">Past week</SelectItem>
                      <SelectItem value="month">Past month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Switch checked={remote} onCheckedChange={setRemote} />
                  <Label className="text-sm flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Remote only</Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {loading && (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex gap-4">
                    <Skeleton className="w-12 h-12 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && hasSearched && jobs.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-muted-foreground mt-1">Try adjusting your search query or filters</p>
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{jobs.length} jobs found</p>
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      {/* Company logo */}
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {job.logo ? (
                          <img src={job.logo} alt={job.company} className="w-full h-full object-contain" />
                        ) : (
                          <Building2 className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-base leading-tight">{job.title}</h3>
                            <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => saveJob(job)}
                              title="Save to tracker"
                            >
                              <Bookmark className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5 h-8"
                              onClick={() => window.open(job.apply_url, "_blank")}
                            >
                              Apply <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          <Badge variant="secondary" className="text-xs gap-1">
                            <MapPin className="w-3 h-3" /> {job.location}
                          </Badge>
                          {job.remote && (
                            <Badge variant="secondary" className="text-xs gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <Globe className="w-3 h-3" /> Remote
                            </Badge>
                          )}
                          {formatSalary(job.salary_min, job.salary_max) && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <DollarSign className="w-3 h-3" /> {formatSalary(job.salary_min, job.salary_max)}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="w-3 h-3" /> {timeAgo(job.date_posted)}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">{job.source}</Badge>
                        </div>

                        {/* Description preview */}
                        {job.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {job.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => searchJobs(page - 1)}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </Button>
              <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => searchJobs(page + 1)}
                className="gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {!hasSearched && !loading && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-medium">Search for your next opportunity</h3>
            <p className="text-muted-foreground mt-1">Enter a job title or skills to find matching positions</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {["Software Engineer", "Data Scientist", "Product Manager", "UX Designer", "DevOps Engineer"].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => { setQuery(suggestion); searchJobs(); }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

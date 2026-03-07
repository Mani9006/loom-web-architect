import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Briefcase, ExternalLink, Building2,
  Clock, DollarSign, Loader2, Globe, Filter, ChevronDown, ChevronUp,
  FileText, MapPin, X, Ban, Bookmark, BookmarkCheck, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { JOB_ROLES } from "@/data/job-roles";

interface SearchJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  salary: string | null;
  job_type: string | null;
  remote: boolean;
  date_posted: string;
  source: string;
  role_category?: string;
  experience_level?: string;
  industry?: string;
}

const QUICK_ROLES = [
  "Software Engineer", "Data Scientist", "Product Manager",
  "UX Designer", "DevOps Engineer", "Frontend Developer",
  "Backend Developer", "Full Stack Developer", "Data Analyst",
  "Machine Learning Engineer", "Project Manager", "Business Analyst",
  "Marketing Manager", "Sales Engineer", "Cloud Engineer",
  "Cybersecurity Analyst",
];

export default function JobSearchPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // Search state — persisted across refresh
  const [query, setQuery] = usePersistedState("jobSearch.query", "", "sessionStorage");
  const [location, setLocation] = usePersistedState("jobSearch.location", "", "sessionStorage");
  const [salaryRange, setSalaryRange] = usePersistedState("jobSearch.salaryRange", "any", "sessionStorage");
  const [jobType, setJobType] = usePersistedState("jobSearch.jobType", "all", "sessionStorage");
  const [datePosted, setDatePosted] = usePersistedState("jobSearch.datePosted", "month", "sessionStorage");
  const [experienceLevel, setExperienceLevel] = usePersistedState("jobSearch.experienceLevel", "all", "sessionStorage");
  const [remoteFilter, setRemoteFilter] = usePersistedState("jobSearch.remoteFilter", "all", "sessionStorage");
  const [searchSource, setSearchSource] = usePersistedState("jobSearch.searchSource", "direct", "sessionStorage");
  const [resumeText, setResumeText] = usePersistedState("jobSearch.resumeText", "", "sessionStorage");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResumeUpload, setShowResumeUpload] = useState(false);

  // Role search autocomplete
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const filteredRoles = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return JOB_ROLES.filter((r) => r.toLowerCase().includes(lower)).slice(0, 12);
  }, [query]);

  // Results — persisted across refresh
  const [jobs, setJobs] = usePersistedState<SearchJob[]>("jobSearch.jobs", [], "sessionStorage");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = usePersistedState("jobSearch.hasSearched", false, "sessionStorage");
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState("");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Split view: selected job for detail panel — persisted across refresh
  const [selectedJob, setSelectedJob] = usePersistedState<SearchJob | null>("jobSearch.selectedJob", null, "sessionStorage");

  // Saved jobs tracking
  const [savedJobKeys, setSavedJobKeys] = useState<Set<string>>(new Set());
  const [savingJobs, setSavingJobs] = useState<Set<string>>(new Set());

  // Helper to make a unique key for a job
  const jobKey = (job: SearchJob) =>
    `${job.title}:::${job.company}:::${job.location}`.toLowerCase();

  // Load user's saved jobs on mount (from tracked_jobs which powers the Applications page)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("tracked_jobs")
      .select("title, company")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          const keys = new Set(
            data.map((j: any) => `${j.title}:::${j.company}:::`.toLowerCase())
          );
          setSavedJobKeys(keys);
        }
      });
    // Also load from saved_jobs for full-detail match
    supabase
      .from("saved_jobs")
      .select("job_title, company, location")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          setSavedJobKeys((prev) => {
            const next = new Set(prev);
            data.forEach((j: any) => next.add(`${j.job_title}:::${j.company}:::${j.location || ""}`.toLowerCase()));
            return next;
          });
        }
      });
  }, [user?.id]);

  const isJobSaved = (job: SearchJob) => savedJobKeys.has(jobKey(job));

  const toggleSaveJob = async (job: SearchJob, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) {
      toast({ title: "Sign in to save jobs", variant: "destructive" });
      return;
    }

    const key = jobKey(job);
    setSavingJobs((prev) => new Set(prev).add(job.id));

    try {
      if (savedJobKeys.has(key)) {
        // Unsave from both tables
        await Promise.all([
          supabase
            .from("tracked_jobs")
            .delete()
            .eq("user_id", user.id)
            .eq("title", job.title)
            .eq("company", job.company)
            .eq("status", "Saved"),
          supabase
            .from("saved_jobs")
            .delete()
            .eq("user_id", user.id)
            .eq("job_title", job.title)
            .eq("company", job.company),
        ]);
        setSavedJobKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        toast({ title: "Job removed from saved" });
      } else {
        // Save to both: tracked_jobs (for Applications Kanban) + saved_jobs (for full details)
        await Promise.all([
          supabase.from("tracked_jobs").insert({
            user_id: user.id,
            title: job.title,
            company: job.company,
            status: "Saved",
            url: job.apply_url || null,
          }),
          supabase.from("saved_jobs").insert({
            user_id: user.id,
            job_title: job.title,
            company: job.company,
            location: job.location || null,
            description: job.description || null,
            apply_url: job.apply_url || null,
            salary: job.salary || null,
            job_type: job.job_type || null,
            remote: job.remote || false,
            date_posted: job.date_posted || null,
            source: job.source || null,
          }),
        ]);
        setSavedJobKeys((prev) => new Set(prev).add(key));
        toast({ title: "Job saved!", description: "View it in Applications → Saved" });
      }
    } catch (err: any) {
      console.error("Save job error:", err);
      toast({ title: "Failed to save job", variant: "destructive" });
    } finally {
      setSavingJobs((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  // Active filters count
  const activeFilters = [
    salaryRange !== "any" ? 1 : 0,
    jobType !== "all" ? 1 : 0,
    datePosted !== "month" ? 1 : 0,
    experienceLevel !== "all" ? 1 : 0,
    remoteFilter !== "all" ? 1 : 0,
    searchSource !== "direct" ? 1 : 0,
    location ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setLoading(false);
    setSearchProgress(0);
    setSearchStatus("");
    toast({ title: "Search cancelled" });
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const searchJobs = useCallback(async (overrideQuery?: string) => {
    const q = overrideQuery || query;
    if (!q.trim()) {
      toast({ title: "Enter a search term", description: "Type a job title or keyword" });
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setHasSearched(true);
    setShowRoleSuggestions(false);
    setSearchProgress(0);
    setElapsedMs(null);
    setFromCache(false);
    setSelectedJob(null);

    const statusMessages = [
      { at: 0, msg: "Searching job boards...", pct: 10 },
      { at: 2000, msg: "Scanning LinkedIn, Indeed, Glassdoor...", pct: 30 },
      { at: 5000, msg: "Analyzing job listings...", pct: 55 },
      { at: 8000, msg: "Gathering details & URLs...", pct: 70 },
      { at: 12000, msg: "Almost done...", pct: 85 },
      { at: 18000, msg: "Taking a bit longer than usual...", pct: 92 },
    ];
    const searchStart = Date.now();
    setSearchStatus(statusMessages[0].msg);
    setSearchProgress(statusMessages[0].pct);

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - searchStart;
      for (let i = statusMessages.length - 1; i >= 0; i--) {
        if (elapsed >= statusMessages[i].at) {
          setSearchStatus(statusMessages[i].msg);
          setSearchProgress(statusMessages[i].pct);
          break;
        }
      }
    }, 500);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      const userId = session.data.session?.user?.id;
      const payload: Record<string, any> = { query: q };
      if (userId) payload.user_id = userId;
      if (location.trim()) payload.location = location.trim();
      if (salaryRange !== "any") payload.salary_range = salaryRange;
      if (jobType !== "all") payload.job_type = jobType;
      if (datePosted) payload.date_posted = datePosted;
      if (experienceLevel !== "all") payload.experience_level = experienceLevel;
      if (remoteFilter !== "all") payload.remote_filter = remoteFilter;
      if (searchSource !== "direct") payload.search_source = searchSource;
      if (resumeText.trim()) payload.resume_text = resumeText.trim();

      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perplexity-job-search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.timed_out) {
          throw new Error("Search took too long. Try a simpler query or fewer filters.");
        }
        throw new Error(err.error || `Search failed (${response.status})`);
      }

      const data = await response.json();
      const resultJobs = data.jobs || [];
      setJobs(resultJobs);
      setSearchProgress(100);
      setSearchStatus(data.from_cache ? "Loaded from cache!" : "Done!");
      setFromCache(!!data.from_cache);
      if (data.elapsed_ms) setElapsedMs(data.elapsed_ms);

      // Auto-select first job for detail panel
      if (resultJobs.length > 0) {
        setSelectedJob(resultJobs[0]);
      }

      if (resultJobs.length === 0) {
        toast({ title: "No results", description: `No jobs found for "${q}". Try broader keywords.` });
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        if (controller.signal.reason !== "user-cancel") {
          toast({ title: "Search timed out", description: "Try a simpler search query", variant: "destructive" });
        }
      } else {
        console.error("Search failed:", err);
        toast({ title: "Search failed", description: err.message || "Please try again", variant: "destructive" });
      }
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [query, location, salaryRange, jobType, datePosted, experienceLevel, remoteFilter, searchSource, resumeText]);

  const handleResumeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setResumeText(text.substring(0, 3000));
    toast({ title: "Resume loaded", description: "Your resume will improve search relevance" });
  };

  const clearFilters = () => {
    setSalaryRange("any");
    setJobType("all");
    setDatePosted("month");
    setExperienceLevel("all");
    setRemoteFilter("all");
    setSearchSource("direct");
    setLocation("");
  };

  // Whether we're in split view (results exist)
  const showSplitView = !loading && jobs.length > 0;

  return (
    <div className="bg-muted/30 h-full flex flex-col overflow-hidden">
      {/* Search Header - always visible */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto p-3 sm:p-4 space-y-3">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Job Search</h1>
            <span className="text-xs text-muted-foreground">— AI-powered across the web</span>
          </div>

          {/* Search row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
              <Input
                placeholder="Job title, role, or keywords..."
                className="pl-10 h-10"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowRoleSuggestions(true);
                }}
                onFocus={() => { if (query.trim()) setShowRoleSuggestions(true); }}
                onBlur={() => { setTimeout(() => setShowRoleSuggestions(false), 150); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setShowRoleSuggestions(false); searchJobs(); }
                  if (e.key === "Escape") setShowRoleSuggestions(false);
                }}
                autoComplete="off"
              />
              {showRoleSuggestions && filteredRoles.length > 0 && (
                <ul className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto py-1">
                  {filteredRoles.map((role) => (
                    <li
                      key={role}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuery(role);
                        setShowRoleSuggestions(false);
                        searchJobs(role);
                      }}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {role}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex-1 sm:max-w-[200px]">
              <LocationAutocomplete
                value={location}
                onChange={setLocation}
                placeholder="City, State or Remote"
                onKeyDown={(e) => { if (e.key === "Enter") searchJobs(); }}
              />
            </div>

            <Button onClick={() => searchJobs()} disabled={loading} className="h-10 gap-2 px-5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>

          {/* Filter row */}
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant={showAdvanced ? "default" : "outline"}
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Filter className="w-3 h-3" />
              Filters
              {activeFilters > 0 && (
                <span className="ml-0.5 bg-primary-foreground text-primary rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                  {activeFilters}
                </span>
              )}
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowResumeUpload(!showResumeUpload)}>
              <FileText className="w-3 h-3" /> Resume
              {resumeText && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground" onClick={clearFilters}>
                <X className="w-3 h-3" /> Clear
              </Button>
            )}
            {/* Active filter badges inline */}
            {!showAdvanced && salaryRange !== "any" && (
              <Badge variant="secondary" className="text-[10px] gap-0.5 h-6">
                <DollarSign className="w-2.5 h-2.5" /> {salaryRange}
                <X className="w-2.5 h-2.5 cursor-pointer ml-0.5" onClick={() => setSalaryRange("any")} />
              </Badge>
            )}
            {!showAdvanced && jobType !== "all" && (
              <Badge variant="secondary" className="text-[10px] gap-0.5 h-6">
                {jobType}
                <X className="w-2.5 h-2.5 cursor-pointer ml-0.5" onClick={() => setJobType("all")} />
              </Badge>
            )}
            {!showAdvanced && experienceLevel !== "all" && (
              <Badge variant="secondary" className="text-[10px] gap-0.5 h-6">
                {experienceLevel}
                <X className="w-2.5 h-2.5 cursor-pointer ml-0.5" onClick={() => setExperienceLevel("all")} />
              </Badge>
            )}
            {!showAdvanced && remoteFilter !== "all" && (
              <Badge variant="secondary" className="text-[10px] gap-0.5 h-6">
                {remoteFilter}
                <X className="w-2.5 h-2.5 cursor-pointer ml-0.5" onClick={() => setRemoteFilter("all")} />
              </Badge>
            )}
            {!showAdvanced && searchSource !== "direct" && (
              <Badge variant="secondary" className="text-[10px] gap-0.5 h-6">
                All Sources
                <X className="w-2.5 h-2.5 cursor-pointer ml-0.5" onClick={() => setSearchSource("direct")} />
              </Badge>
            )}
          </div>

          {/* Advanced filters */}
          {showAdvanced && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Salary Range</Label>
                <Select value={salaryRange} onValueChange={setSalaryRange}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Salary</SelectItem>
                    <SelectItem value="$30k-$50k">$30k – $50k</SelectItem>
                    <SelectItem value="$50k-$80k">$50k – $80k</SelectItem>
                    <SelectItem value="$80k-$120k">$80k – $120k</SelectItem>
                    <SelectItem value="$120k-$160k">$120k – $160k</SelectItem>
                    <SelectItem value="$160k-$200k">$160k – $200k</SelectItem>
                    <SelectItem value="$200k-$300k">$200k – $300k</SelectItem>
                    <SelectItem value="$300k+">$300k+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Job Type</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Full-time">Full Time</SelectItem>
                    <SelectItem value="Part-time">Part Time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Temporary">Temporary</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                    <SelectItem value="Freelance">Freelance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date Posted</Label>
                <Select value={datePosted} onValueChange={setDatePosted}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="3days">Past 3 Days</SelectItem>
                    <SelectItem value="week">Past Week</SelectItem>
                    <SelectItem value="2weeks">Past 2 Weeks</SelectItem>
                    <SelectItem value="month">Past Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Experience Level</Label>
                <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                    <SelectItem value="Entry-Level">Entry Level</SelectItem>
                    <SelectItem value="Mid-Level">Mid Level</SelectItem>
                    <SelectItem value="Senior">Senior</SelectItem>
                    <SelectItem value="Executive">Executive / Director</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Work Type</Label>
                <Select value={remoteFilter} onValueChange={setRemoteFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Work Types</SelectItem>
                    <SelectItem value="remote-only">Remote Only</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="on-site">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Search Source</Label>
                <Select value={searchSource} onValueChange={setSearchSource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Company Careers</SelectItem>
                    <SelectItem value="all">All Sources</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Resume upload */}
          {showResumeUpload && (
            <div className="pt-2 border-t space-y-2">
              <Label className="text-xs">Upload resume for better relevance (optional)</Label>
              <Input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleResumeFile} className="h-8 text-xs" />
              {resumeText && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Resume loaded ({resumeText.length} chars)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Loading state */}
        {loading && (
          <div className="max-w-2xl mx-auto p-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm font-medium">{searchStatus}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-8" onClick={cancelSearch}>
                    <Ban className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </div>
                <Progress value={searchProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  Searching across LinkedIn, Indeed, Glassdoor & more
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {!loading && hasSearched && jobs.length === 0 && (
          <div className="text-center py-20">
            <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-muted-foreground mt-1">Try different keywords or broader filters</p>
          </div>
        )}

        {/* Initial state — quick roles */}
        {!loading && !hasSearched && (
          <div className="max-w-3xl mx-auto p-6">
            <div className="text-center py-12">
              <Globe className="w-16 h-16 mx-auto text-primary/20 mb-4" />
              <h3 className="text-lg font-medium">Find your next opportunity</h3>
              <p className="text-muted-foreground mt-1">
                Search across LinkedIn, Indeed, Glassdoor, and company career pages
              </p>
            </div>
            <div className="mt-4">
              <span className="text-xs text-muted-foreground mb-2 block">Popular roles:</span>
              <div className="flex flex-wrap gap-2">
                {QUICK_ROLES.map((role) => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setQuery(role); searchJobs(role); }}
                  >
                    {role}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== LINKEDIN-STYLE SPLIT VIEW ===== */}
        {showSplitView && (
          <div className="flex h-full overflow-hidden">
            {/* LEFT PANE: Job list */}
            <div className={cn(
              "border-r bg-background flex flex-col",
              selectedJob ? "hidden md:flex md:w-[420px] lg:w-[460px]" : "w-full md:w-[420px] lg:w-[460px]"
            )}>
              {/* Results header */}
              <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {jobs.length} jobs found{elapsedMs ? ` in ${(elapsedMs / 1000).toFixed(1)}s` : ""}
                  {fromCache && (
                    <span className="ml-1.5 text-green-600 dark:text-green-400">⚡ Cached</span>
                  )}
                </p>
                {fromCache && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 text-muted-foreground"
                    onClick={() => { setFromCache(false); searchJobs(); }}
                  >
                    🔄 Refresh
                  </Button>
                )}
              </div>

              {/* Job cards list */}
              <ScrollArea className="flex-1">
                <div className="divide-y">
                  {jobs.map((job) => {
                    const selected = selectedJob?.id === job.id;
                    const saved = isJobSaved(job);
                    const saving = savingJobs.has(job.id);
                    return (
                      <div
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={cn(
                          "px-4 py-3.5 cursor-pointer transition-colors hover:bg-muted/60 group relative",
                          selected && "bg-muted border-l-[3px] border-l-primary"
                        )}
                      >
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                            <Building2 className="w-4.5 h-4.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <h3 className="font-semibold text-sm leading-tight line-clamp-1">{job.title}</h3>
                              {/* Save button */}
                              <button
                                onClick={(e) => toggleSaveJob(job, e)}
                                disabled={saving}
                                className={cn(
                                  "p-1 rounded-md transition-all shrink-0",
                                  saved
                                    ? "text-primary hover:text-primary/80"
                                    : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-primary"
                                )}
                                title={saved ? "Remove from saved" : "Save job"}
                              >
                                {saving ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : saved ? (
                                  <BookmarkCheck className="w-4 h-4 fill-current" />
                                ) : (
                                  <Bookmark className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{job.company}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" /> {job.location}
                              </span>
                              {job.remote && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Remote
                                </Badge>
                              )}
                              {job.salary && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <DollarSign className="w-2.5 h-2.5" /> {job.salary}
                                </span>
                              )}
                            </div>
                            {job.description && (
                              <p className="text-xs text-foreground/60 mt-1.5 line-clamp-2 leading-relaxed">{job.description}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {job.role_category && job.role_category !== "Other" && (
                                <Badge className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{job.role_category}</Badge>
                              )}
                              {job.experience_level && job.experience_level !== "Mid-Level" && (
                                <Badge className="text-[10px] h-4 px-1.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">{job.experience_level}</Badge>
                              )}
                              {job.job_type && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{job.job_type}</Badge>}
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" /> {job.date_posted}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">{job.source}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* RIGHT PANE: Job detail (LinkedIn-style) */}
            {selectedJob ? (
              <div className={cn(
                "flex-1 flex flex-col bg-background overflow-hidden",
                "w-full md:w-auto"
              )}>
                {/* Mobile back button */}
                <div className="md:hidden px-4 py-2 border-b">
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setSelectedJob(null)}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to results
                  </Button>
                </div>

                <ScrollArea className="flex-1">
                  <div className="max-w-3xl p-6 space-y-5">
                    {/* Job header */}
                    <div className="space-y-3">
                      <div className="flex gap-4">
                        <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <Building2 className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-xl font-bold leading-tight">{selectedJob.title}</h2>
                          <p className="text-sm text-muted-foreground mt-0.5">{selectedJob.company}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedJob.location}</span>
                            {selectedJob.date_posted && (
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedJob.date_posted}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {selectedJob.role_category && selectedJob.role_category !== "Other" && (
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{selectedJob.role_category}</Badge>
                        )}
                        {selectedJob.experience_level && (
                          <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs">{selectedJob.experience_level}</Badge>
                        )}
                        {selectedJob.remote && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs gap-1">
                            <Globe className="w-3 h-3" /> Remote
                          </Badge>
                        )}
                        {selectedJob.job_type && (
                          <Badge variant="secondary" className="text-xs">{selectedJob.job_type}</Badge>
                        )}
                        {selectedJob.salary && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <DollarSign className="w-3 h-3" /> {selectedJob.salary}
                          </Badge>
                        )}
                        {selectedJob.industry && (
                          <Badge variant="outline" className="text-xs">{selectedJob.industry}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs capitalize">{selectedJob.source}</Badge>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {selectedJob.apply_url && (
                          <Button className="gap-1.5" asChild>
                            <a href={selectedJob.apply_url} target="_blank" rel="noopener noreferrer">
                              Apply <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant={isJobSaved(selectedJob) ? "secondary" : "outline"}
                          className="gap-1.5"
                          onClick={() => toggleSaveJob(selectedJob)}
                          disabled={savingJobs.has(selectedJob.id)}
                        >
                          {savingJobs.has(selectedJob.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isJobSaved(selectedJob) ? (
                            <BookmarkCheck className="w-4 h-4 fill-current" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                          {isJobSaved(selectedJob) ? "Saved" : "Save"}
                        </Button>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="border-t pt-5">
                      <h3 className="font-semibold text-base mb-3">About the job</h3>
                      {selectedJob.description ? (
                        <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                          {selectedJob.description}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">
                          <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                          <p>No description available for this listing.</p>
                          <p className="text-xs mt-1">Click "Apply" to see full details on the job board.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              /* No job selected placeholder (desktop only) */
              <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a job to view details</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

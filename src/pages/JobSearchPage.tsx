import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Briefcase, ExternalLink, Building2,
  Clock, DollarSign, Loader2, Globe, Filter, ChevronDown, ChevronUp, FileText, MapPin, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { JOB_ROLES, COMMON_SKILLS } from "@/data/job-roles";

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
}

// Quick-access role chips (subset of full list)
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

  // Search state
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [salaryRange, setSalaryRange] = useState("any");
  const [jobType, setJobType] = useState("all");
  const [datePosted, setDatePosted] = useState("month");
  const [resumeText, setResumeText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResumeUpload, setShowResumeUpload] = useState(false);

  // Role search autocomplete
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const filteredRoles = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return JOB_ROLES.filter((r) => r.toLowerCase().includes(lower)).slice(0, 12);
  }, [query]);

  // Results
  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Active filters count (for badge)
  const activeFilters = [
    salaryRange !== "any" ? 1 : 0,
    jobType !== "all" ? 1 : 0,
    datePosted !== "month" ? 1 : 0,
    location ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const searchJobs = useCallback(async (overrideQuery?: string) => {
    const q = overrideQuery || query;
    if (!q.trim()) {
      toast({ title: "Enter a search term", description: "Type a job title or keyword" });
      return;
    }
    setLoading(true);
    setHasSearched(true);
    setShowRoleSuggestions(false);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt4F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g";

      // Build payload — only include non-empty/non-default values
      const payload: Record<string, any> = { query: q };
      if (location.trim()) payload.location = location.trim();
      if (salaryRange !== "any") payload.salary_range = salaryRange;
      if (jobType !== "all") payload.job_type = jobType;
      if (datePosted) payload.date_posted = datePosted;
      if (resumeText.trim()) payload.resume_text = resumeText.trim();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://woxtbyotydxorcdhhivr.supabase.co"}/functions/v1/perplexity-job-search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Search failed (${response.status})`);
      }

      const data = await response.json();
      setJobs(data.jobs || []);

      if ((data.jobs || []).length === 0) {
        toast({ title: "No results", description: `No jobs found for "${q}". Try broader keywords.` });
      }
    } catch (err: any) {
      console.error("Search failed:", err);
      toast({ title: "Search failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [query, location, salaryRange, jobType, datePosted, resumeText]);

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
    setLocation("");
  };

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="w-6 h-6 text-primary" />
            Job Search
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Search thousands of jobs across the web — powered by AI
          </p>
        </div>

        {/* Search Card */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Main search row */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Job title / role search with autocomplete */}
              <div className="relative flex-1">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Job title, role, or keywords..."
                  className="pl-10 h-11"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowRoleSuggestions(true);
                  }}
                  onFocus={() => { if (query.trim()) setShowRoleSuggestions(true); }}
                  onBlur={() => { setTimeout(() => setShowRoleSuggestions(false), 150); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setShowRoleSuggestions(false);
                      searchJobs();
                    }
                    if (e.key === "Escape") setShowRoleSuggestions(false);
                  }}
                  autoComplete="off"
                />
                {/* Role suggestions dropdown */}
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

              {/* Location autocomplete */}
              <div className="flex-1 sm:max-w-[240px]">
                <LocationAutocomplete
                  value={location}
                  onChange={setLocation}
                  placeholder="City, State or Remote"
                  onKeyDown={(e) => { if (e.key === "Enter") searchJobs(); }}
                />
              </div>

              <Button onClick={() => searchJobs()} disabled={loading} className="h-11 gap-2 px-6">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </Button>
            </div>

            {/* Filter toggles */}
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                variant={showAdvanced ? "default" : "outline"}
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {activeFilters > 0 && (
                  <span className="ml-1 bg-primary-foreground text-primary rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                    {activeFilters}
                  </span>
                )}
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setShowResumeUpload(!showResumeUpload)}>
                <FileText className="w-3.5 h-3.5" /> Resume for Relevance
                {resumeText && <span className="w-2 h-2 rounded-full bg-green-500" />}
              </Button>
              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-muted-foreground" onClick={clearFilters}>
                  <X className="w-3.5 h-3.5" /> Clear Filters
                </Button>
              )}
            </div>

            {/* Advanced filters */}
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Salary Range</Label>
                  <Select value={salaryRange} onValueChange={setSalaryRange}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Job Type</Label>
                  <Select value={jobType} onValueChange={setJobType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Date Posted</Label>
                  <Select value={datePosted} onValueChange={setDatePosted}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="3days">Past 3 Days</SelectItem>
                      <SelectItem value="week">Past Week</SelectItem>
                      <SelectItem value="2weeks">Past 2 Weeks</SelectItem>
                      <SelectItem value="month">Past Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Resume upload */}
            {showResumeUpload && (
              <div className="pt-3 border-t space-y-2">
                <Label className="text-xs">Upload resume or paste text for better search relevance (optional)</Label>
                <div className="flex gap-2">
                  <Input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleResumeFile} className="flex-1 h-9" />
                </div>
                {resumeText && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Resume loaded ({resumeText.length} chars) — will improve search relevance
                  </p>
                )}
              </div>
            )}

            {/* Quick role buttons — shown before first search */}
            {!hasSearched && (
              <div className="pt-3 border-t">
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
            )}
          </CardContent>
        </Card>

        {/* Active filter badges (when collapsed) */}
        {!showAdvanced && activeFilters > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground mr-1">Active filters:</span>
            {salaryRange !== "any" && (
              <Badge variant="secondary" className="text-xs gap-1">
                <DollarSign className="w-3 h-3" /> {salaryRange}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setSalaryRange("any")} />
              </Badge>
            )}
            {jobType !== "all" && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Briefcase className="w-3 h-3" /> {jobType}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setJobType("all")} />
              </Badge>
            )}
            {datePosted !== "month" && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Clock className="w-3 h-3" /> {datePosted}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setDatePosted("month")} />
              </Badge>
            )}
            {location && (
              <Badge variant="secondary" className="text-xs gap-1">
                <MapPin className="w-3 h-3" /> {location}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setLocation("")} />
              </Badge>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
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

        {/* Empty state */}
        {!loading && hasSearched && jobs.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-muted-foreground mt-1">Try different keywords or broader filters</p>
          </div>
        )}

        {/* Initial state */}
        {!loading && !hasSearched && (
          <div className="text-center py-16">
            <Globe className="w-16 h-16 mx-auto text-primary/20 mb-4" />
            <h3 className="text-lg font-medium">Find your next opportunity</h3>
            <p className="text-muted-foreground mt-1">
              Search across LinkedIn, Indeed, Glassdoor, and company career pages
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Click a role above or type your own search to get started
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && jobs.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{jobs.length} jobs found</p>
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-base leading-tight">{job.title}</h3>
                            <p className="text-sm text-muted-foreground">{job.company}</p>
                          </div>
                          {job.apply_url && (
                            <Button size="sm" className="gap-1.5 h-8 shrink-0" asChild>
                              <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                                Apply <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge variant="secondary" className="text-xs gap-1">
                            <MapPin className="w-3 h-3" /> {job.location}
                          </Badge>
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
                          {job.job_type && (
                            <Badge variant="outline" className="text-xs">{job.job_type}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="w-3 h-3" /> {job.date_posted}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">{job.source}</Badge>
                        </div>

                        {job.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

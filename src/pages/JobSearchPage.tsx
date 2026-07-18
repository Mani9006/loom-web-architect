/* eslint-disable @typescript-eslint/no-explicit-any -- legacy search results and generated Supabase joins are not yet fully typed */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Search, Briefcase, Building2,
  Clock, DollarSign, Loader2, Globe, Filter, ChevronDown, ChevronUp,
  FileText, MapPin, X, Ban, Bookmark, BookmarkCheck, ArrowLeft,
  ChevronLeft, ChevronRight, Sparkles, RefreshCw,
  CheckCircle2, ShieldCheck, WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
// resolveJobUrl moved into JobApplyButton component
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { JobApplyButton } from "@/components/JobApplyButton";
import { JOB_ROLES } from "@/data/job-roles";
import { captureIncident } from "@/lib/incidents";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";

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

interface MatchedJob extends SearchJob {
  match_score: number;
  match_reasons: Record<string, number>;
  match_id: string;
  match_summary: string;
  match_dimensions: Array<{
    key: string;
    label: string;
    score: number;
    evidence: string[];
    gaps: string[];
  }>;
  matched_keywords: string[];
  gaps: string[];
  fit_confidence: number | null;
}

const QUICK_ROLES = [
  "Software Engineer", "Data Scientist", "Product Manager",
  "UX Designer", "DevOps Engineer", "Frontend Developer",
  "Backend Developer", "Full Stack Developer", "Data Analyst",
  "Machine Learning Engineer", "Project Manager", "Business Analyst",
  "Marketing Manager", "Sales Engineer", "Cloud Engineer",
  "Cybersecurity Analyst",
];

function cleanJobDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (!value) return "";

  // Some feeds double-encode the description or wrap it in a JSON field.
  if ((value.startsWith('"') && value.endsWith('"')) || value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      value = typeof parsed === "string"
        ? parsed
        : String(parsed?.description ?? parsed?.content ?? parsed?.text ?? value);
    } catch {
      // Keep the original and continue with safe text normalization.
    }
  }

  value = value
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return value.slice(0, 40_000);
}

function safeMatchText(raw: unknown): string {
  return cleanJobDescription(raw)
    .replace(/blocked by a hard preference:?/gi, "Autopilot review needed:")
    .replace(/\bblocked\b/gi, "held for review");
}

function JobDescription({ value }: { value: string }) {
  const clean = cleanJobDescription(value);
  if (!clean) return null;
  const lines = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="space-y-2.5 text-sm leading-6 text-foreground/80">
      {lines.map((line, index) => {
        const bullet = line.match(/^(?:[•·▪◦*-]|\d+[.)])\s*(.+)$/);
        if (bullet) {
          return (
            <div key={`${index}-${line.slice(0, 16)}`} className="flex items-start gap-2.5 pl-1">
              <span aria-hidden="true" className="mt-[0.65rem] size-1 shrink-0 rounded-full bg-foreground/50" />
              <p>{bullet[1]}</p>
            </div>
          );
        }
        const heading = line.length <= 72 && (/^[A-Z][A-Za-z0-9 &/+-]+:$/.test(line) || /^[A-Z0-9 &/+-]{4,}$/.test(line));
        if (heading) return <h4 key={`${index}-${line}`} className="pt-2 text-sm font-semibold text-foreground">{line.replace(/:$/, "")}</h4>;
        return <p key={`${index}-${line.slice(0, 16)}`}>{line}</p>;
      })}
    </div>
  );
}

export default function JobSearchPage() {
  const navigate = useNavigate();
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Tab mode
  const [viewMode, setViewMode] = useState<"search" | "matched">("search");
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchLoadAttempted, setMatchLoadAttempted] = useState(false);
  const [matchRefreshing, setMatchRefreshing] = useState(false);
  const [preparingMatch, setPreparingMatch] = useState<string | null>(null);

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

  // Pagination
  const JOBS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = usePersistedState("jobSearch.currentPage", 1, "sessionStorage");
  const [nextPageFetched, setNextPageFetched] = useState(false);
  const [dbTotal, setDbTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(jobs.length / JOBS_PER_PAGE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * JOBS_PER_PAGE;
    return jobs.slice(start, start + JOBS_PER_PAGE);
  }, [jobs, currentPage]);

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
  }, [user]);

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
      void captureIncident(err, { source: "manual", operation: "job_save" });
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
  }, [toast]);

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
    setCurrentPage(1);
    setNextPageFetched(false);
    setDbTotal(0);

    const statusMessages = [
      { at: 0, msg: "Searching database...", pct: 15 },
      { at: 1500, msg: "Checking for matching jobs...", pct: 40 },
      { at: 4000, msg: "Scanning web if needed...", pct: 60 },
      { at: 8000, msg: "Gathering details & URLs...", pct: 75 },
      { at: 12000, msg: "Almost done...", pct: 88 },
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
      payload.search_source = "direct";

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
      const resultJobs = ((data.jobs || []) as SearchJob[]).map((job) => ({
        ...job,
        description: cleanJobDescription(job.description),
      }));
      setJobs(resultJobs);
      setSearchProgress(100);
      setSearchStatus(data.from_db ? `Found ${data.db_total || resultJobs.length} matching jobs!` : data.from_cache ? "Loaded from cache!" : "Done!");
      setFromCache(!!data.from_cache || !!data.from_db);
      if (data.elapsed_ms) setElapsedMs(data.elapsed_ms);
      if (data.db_total) setDbTotal(data.db_total);

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
        void captureIncident(err, { source: "manual", operation: "job_search" });
        const safeError = toUserFacingError(err, {
          operation: "job_search",
          defaultMessage: "Job discovery is temporarily unavailable. Try again in a moment.",
        });
        toast({
          title: safeError.title,
          description: withSupportReference(safeError),
          variant: "destructive",
        });
      }
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [
    datePosted,
    experienceLevel,
    jobType,
    location,
    query,
    remoteFilter,
    salaryRange,
    setCurrentPage,
    setHasSearched,
    setJobs,
    setSelectedJob,
    toast,
  ]);

  // Pre-fetch more jobs in background for the next page
  // Strategy: if DB has more results, fetch next page from DB; otherwise use Perplexity
  // Prefetch runs silently — no loading spinner shown to user
  const prefetchRef = useRef(false); // tracks if a prefetch is in-flight
  const fetchMoreJobs = useCallback(async () => {
    if (prefetchRef.current || !query.trim()) return;
    prefetchRef.current = true;
    // Don't set isFetchingMore to true — we want SILENT prefetch with no loading UI
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
      const userId = session.data.session?.user?.id;

      // Calculate the next page number for the API
      const nextPage = Math.ceil(jobs.length / JOBS_PER_PAGE) + 1;

      const payload: Record<string, any> = {
        query,
        page: nextPage,
      };

      // Never force web search from the auto-prefetch path. force_web_search +
      // skip_cache together kicks a >30s Perplexity call that timed out and
      // made the UI flash "Search took too long" / "No jobs found" even when
      // the DB had jobs. Let the backend decide whether to widen on its own
      // signals.

      if (userId) payload.user_id = userId;
      if (location.trim()) payload.location = location.trim();
      if (salaryRange !== "any") payload.salary_range = salaryRange;
      if (jobType !== "all") payload.job_type = jobType;
      if (datePosted) payload.date_posted = datePosted;
      if (experienceLevel !== "all") payload.experience_level = experienceLevel;
      if (remoteFilter !== "all") payload.remote_filter = remoteFilter;
      payload.search_source = "direct";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perplexity-job-search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newJobs = ((data.jobs || []) as SearchJob[]).map((job) => ({
          ...job,
          description: cleanJobDescription(job.description),
        }));
        if (newJobs.length > 0) {
          // Deduplicate — don't add jobs already in the list
          const existingKeys = new Set(jobs.map((j) => `${j.title}:::${j.company}`.toLowerCase()));
          const uniqueNew = newJobs.filter((j) => !existingKeys.has(`${j.title}:::${j.company}`.toLowerCase()));
          if (uniqueNew.length > 0) {
            setJobs((prev) => [...prev, ...uniqueNew]);
          }
        }
        // Update DB tracking state
        if (data.db_total) setDbTotal(data.db_total);
        setNextPageFetched(true);
      }
    } catch (err) {
      console.error("Pre-fetch more jobs failed:", err);
      void captureIncident(err, { source: "manual", operation: "job_search_prefetch" }, "warning");
    } finally {
      prefetchRef.current = false;
    }
  }, [datePosted, experienceLevel, jobType, jobs, location, query, remoteFilter, salaryRange, setJobs]);

  // Auto pre-fetch: only run after the user actively pages forward beyond
  // page 1. The previous logic fired this effect on every mount whenever
  // hasSearched was persisted from a prior session — which kicked an
  // expensive web-search call on every page load and frequently timed out.
  // Tracking a ref instead of an unconditional effect prevents the
  // "mount-time runaway prefetch" footgun.
  useEffect(() => {
    if (!hasSearched || loading || jobs.length === 0) return;
    if (currentPage < 2) return; // never prefetch from page 1 — too risky
    const totalLoaded = jobs.length;
    const jobsNeededForNextPage = (currentPage + 1) * JOBS_PER_PAGE;
    if (totalLoaded < jobsNeededForNextPage && !prefetchRef.current && !nextPageFetched) {
      fetchMoreJobs();
    }
  }, [currentPage, jobs.length, hasSearched, loading, nextPageFetched, fetchMoreJobs]);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    setSelectedJob(null);
    // Reset pre-fetch flag when navigating to allow fetching for new pages
    setNextPageFetched(false);
  };

  const clearFilters = () => {
    setSalaryRange("any");
    setJobType("all");
    setDatePosted("month");
    setExperienceLevel("all");
    setRemoteFilter("all");
    setLocation("");
  };

  // Rebuild the resume-evidence feed before loading it. The bootstrap is
  // zero-token and makes resume edits, experience corrections, and preference
  // changes visible immediately instead of serving stale generic results.
  const loadMatchedJobs = useCallback(async (refreshCareerEvidence = true) => {
    if (!user) return;
    setMatchLoading(true);
    setMatchLoadAttempted(true);
    try {
      const fetchEvaluations = () => supabase
          .from("job_evaluations")
          .select(`
          id,
          fit_score,
          score,
          dimension_scores,
          fit_confidence,
          summary,
          keyword_matches,
          gaps,
          evaluated_at,
          scanned_job:scanned_jobs!inner (
            id, title, location, description_md, apply_url,
            compensation_text, remote_policy, posted_at, last_seen_at,
            company:scan_companies(name, category)
          )
        `)
          .eq("user_id", user.id)
          .gte("fit_score", 50)
          .order("fit_score", { ascending: false })
          .limit(100);

      if (refreshCareerEvidence) {
        const { error: reviewError } = await supabase.functions.invoke("career-profile-review", { body: {} });
        if (reviewError) {
          void captureIncident(reviewError, { source: "manual", operation: "career_profile_review" }, "warning");
        }
        const { error: bootstrapError } = await supabase.functions.invoke("career-ops-bootstrap", { body: {} });
        if (bootstrapError) throw bootstrapError;
      }

      const { data, error } = await fetchEvaluations();
      if (error) throw error;
      if (data) {
        const mapped: MatchedJob[] = data
          .filter((m: any) => Math.round(m.fit_score ?? Number(m.score || 0) * 20) >= 50)
          .map((m: any) => ({
          id: m.scanned_job.id,
          title: m.scanned_job.title,
          company: m.scanned_job.company?.name || "Unknown",
          location: m.scanned_job.location || "Remote",
          description: cleanJobDescription(m.scanned_job.description_md || ""),
          apply_url: m.scanned_job.apply_url || "",
          salary: m.scanned_job.compensation_text,
          job_type: null,
          remote: /remote/i.test(`${m.scanned_job.remote_policy || ""} ${m.scanned_job.location || ""}`),
          date_posted: m.scanned_job.posted_at || m.scanned_job.last_seen_at || m.evaluated_at,
          source: "career pages",
          industry: m.scanned_job.company?.category,
          match_score: Math.round(m.fit_score ?? Number(m.score || 0) * 20),
          match_reasons: Object.fromEntries(
            (Array.isArray(m.dimension_scores) ? m.dimension_scores : [])
              .filter((dimension: any) => dimension?.key && Number.isFinite(Number(dimension?.score)))
              .map((dimension: any) => [String(dimension.key), Math.round(Number(dimension.score))]),
          ),
          match_id: m.id,
          match_summary: safeMatchText(m.summary || "This role was scored against the complete source resume and saved preferences."),
          match_dimensions: Array.isArray(m.dimension_scores) ? m.dimension_scores : [],
          matched_keywords: Array.isArray(m.keyword_matches) ? m.keyword_matches : [],
          gaps: Array.isArray(m.gaps) ? m.gaps : [],
          fit_confidence: typeof m.fit_confidence === "number" ? m.fit_confidence : null,
        }));
        setMatchedJobs(mapped);
        setSelectedJob(mapped[0] ?? null);
      }
    } catch (err) {
      console.error("Load matched jobs failed:", err);
      void captureIncident(err, { source: "manual", operation: "job_matches_load" });
      const safeError = toUserFacingError(err, {
        operation: "job_matches_load",
        defaultMessage: "Your match feed could not be built right now. Try again in a moment.",
      });
      toast({ title: safeError.title, description: withSupportReference(safeError), variant: "destructive" });
    } finally {
      setMatchLoading(false);
    }
  }, [setSelectedJob, user, toast]);

  // Refresh the current career-fit feed. New evaluations are generated from
  // the dedicated Matches workspace and the Autopilot agent.
  const refreshMatches = useCallback(async () => {
    if (!user) return;
    setMatchRefreshing(true);
    try {
      await loadMatchedJobs(true);
      toast({ title: "Matches refreshed", description: "Fresh roles were checked against your resume and preferences." });
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally {
      setMatchRefreshing(false);
    }
  }, [user, loadMatchedJobs, toast]);

  const prepareMatchedApplication = useCallback(async (job: MatchedJob) => {
    setPreparingMatch(job.match_id);
    try {
      const { data: existing } = await supabase
        .from("draft_applications")
        .select("id,tailored_resume_id")
        .eq("user_id", user?.id ?? "")
        .eq("evaluation_id", job.match_id)
        .maybeSingle();

      let draft = existing;
      if (!draft) {
        const { data, error } = await supabase.functions.invoke("career-ops-tailor", {
          body: { evaluation_id: job.match_id, allow_outside_preferences: true },
        });
        if (error) throw error;
        draft = data?.draft ?? null;
      }
      if (!draft?.id) throw new Error("The tailored application draft was not returned.");

      let atsScore: number | null = null;
      if (draft.tailored_resume_id) {
        const { data: atsData, error: atsError } = await supabase.functions.invoke("career-ops-ats", {
          body: { resume_id: draft.tailored_resume_id, scanned_job_id: job.id },
        });
        if (atsError) throw atsError;
        atsScore = Number(atsData?.ats?.overall ?? 0);
      }

      toast({
        title: atsScore ? `Tailored resume ready · ${Math.round(atsScore)} ATS` : "Tailored resume ready",
        description: "Review every claim, answer, and attachment before submission.",
      });
      navigate(`/applications/${draft.id}`);
    } catch (error) {
      void captureIncident(error, { source: "manual", operation: "matched_job_prepare" });
      const safeError = toUserFacingError(error, {
        operation: "matched_job_prepare",
        defaultMessage: "The application draft could not be prepared. Try again in a moment.",
      });
      toast({ title: safeError.title, description: withSupportReference(safeError), variant: "destructive" });
    } finally {
      setPreparingMatch(null);
    }
  }, [navigate, toast, user?.id]);

  // Auto-load matches when switching to matched tab
  useEffect(() => {
    if (viewMode === "matched" && !matchLoadAttempted && !matchLoading) {
      void loadMatchedJobs(true);
    }
  }, [viewMode, matchLoadAttempted, matchLoading, loadMatchedJobs]);

  useEffect(() => {
    setMatchLoadAttempted(false);
    setMatchedJobs([]);
  }, [user?.id]);

  // Whether we're in split view (results exist)
  const showSplitView = !loading && jobs.length > 0;

  return (
    <div className="bg-muted/30 h-full flex flex-col overflow-hidden">
      {/* Search Header - always visible */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto p-3 sm:p-4 space-y-3">
          {/* Tab row */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode("search")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                viewMode === "search"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Search className="w-4 h-4" />
              Search
            </button>
            <button
              onClick={() => setViewMode("matched")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                viewMode === "matched"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Sparkles className="w-4 h-4" />
              Matched For You
              {matchedJobs.length > 0 && (
                <span className="ml-1 bg-primary-foreground/20 text-[10px] rounded-full px-1.5 py-0.5">
                  {matchedJobs.length}
                </span>
              )}
            </button>
          </div>

          {viewMode === "search" && (
            <>
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
            {/* All-Sources chip removed — we always target company-direct pages. */}
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
                    <SelectItem value="24h">Past 24 Hours</SelectItem>
                    <SelectItem value="48h">Past 48 Hours</SelectItem>
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
              {/* Search Source dropdown removed — we always target direct
                  company career pages (Greenhouse, Ashby, Lever, Workday,
                  etc.). No more LinkedIn/Indeed/Dice aggregators. */}
            </div>
          )}

            </>
          )}

          {viewMode === "matched" && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Fresh roles ranked against your complete resume story, skills, experience, and preferences
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={refreshMatches}
                disabled={matchRefreshing}
              >
                {matchRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh Matches
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Loading state */}
        {viewMode === "search" && loading && (
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
                  Searching company career pages — Greenhouse, Ashby, Lever, Workday & more
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {viewMode === "search" && !loading && hasSearched && jobs.length === 0 && (
          <div className="text-center py-20">
            <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-muted-foreground mt-1">Try different keywords or broader filters</p>
          </div>
        )}

        {/* Initial state — quick roles */}
        {viewMode === "search" && !loading && !hasSearched && (
          <div className="max-w-3xl mx-auto p-6">
            <div className="text-center py-12">
              <Globe className="w-16 h-16 mx-auto text-primary/20 mb-4" />
              <h3 className="text-lg font-medium">Find your next opportunity</h3>
              <p className="text-muted-foreground mt-1">
                Real openings straight from company career pages — no aggregator spam
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
        {viewMode === "search" && showSplitView && (
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
                  {totalPages > 1 && <span className="ml-1"> · Page {currentPage} of {totalPages}</span>}
                  {fromCache && (
                    <span className="ml-1.5 text-green-600 dark:text-green-400">⚡ Cached</span>
                  )}
                  {/* Prefetch is silent — no loading indicator */}
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
                  {paginatedJobs.map((job) => {
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

              {/* Pagination controls — always visible at bottom */}
              {totalPages > 0 && (
                <div className="border-t bg-background px-3 py-2 flex items-center justify-between shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {/* Show page numbers */}
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "ghost"}
                          size="sm"
                          className={cn("h-7 w-7 text-xs p-0", currentPage === page && "pointer-events-none")}
                          onClick={() => goToPage(page)}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    disabled={currentPage >= totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
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
                      <div className="flex items-center gap-2">
                        <JobApplyButton
                          job={{
                            id: selectedJob.id,
                            title: selectedJob.title,
                            company: selectedJob.company,
                            location: selectedJob.location,
                            apply_url: selectedJob.apply_url,
                            source: selectedJob.source,
                            description: selectedJob.description,
                          }}
                          variant="compact"
                        />
                        <Button
                          variant={isJobSaved(selectedJob) ? "secondary" : "outline"}
                          size="sm"
                          className="gap-1.5 h-8"
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
                        <JobDescription value={selectedJob.description} />
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

        {/* Matched jobs view */}
        {viewMode === "matched" && (
          <>
            {matchLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">Building your match feed</p>
                <p className="mt-1 text-xs text-muted-foreground">Checking fresh roles against your resume and preferences…</p>
              </div>
            )}

            {!matchLoading && matchedJobs.length === 0 && (
              <div className="text-center py-20">
                <Sparkles className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium">No personalized matches yet</h3>
                <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                  Confirm your source resume and broaden any strict role, location, seniority, or work-mode preferences.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" onClick={() => navigate("/career-ops/preferences")}>Review preferences</Button>
                  <Button className="gap-2" onClick={() => navigate("/matches")}>
                    <Sparkles className="w-4 h-4" /> Browse scored roles
                  </Button>
                </div>
              </div>
            )}

            {!matchLoading && matchedJobs.length > 0 && (
              <div className="flex h-full overflow-hidden">
                {/* LEFT PANE: Matched job list */}
                <div className={cn(
                  "border-r bg-background flex flex-col",
                  selectedJob ? "hidden md:flex md:w-[420px] lg:w-[460px]" : "w-full md:w-[420px] lg:w-[460px]"
                )}>
                  <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      {matchedJobs.length} matched jobs · Sorted by match score
                    </p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="divide-y">
                      {matchedJobs.map((job) => {
                        const selected = selectedJob?.id === job.id;
                        const saved = isJobSaved(job);
                        const saving = savingJobs.has(job.id);
                        return (
                          <div
                            key={job.match_id}
                            onClick={() => setSelectedJob(job)}
                            className={cn(
                              "px-4 py-3.5 cursor-pointer transition-colors hover:bg-muted/60 group relative",
                              selected && "bg-muted border-l-[3px] border-l-primary"
                            )}
                          >
                            <div className="flex gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-1">
                                  <h3 className="font-semibold text-sm leading-tight line-clamp-1">{job.title}</h3>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{job.company}</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <Progress value={job.match_score} className="h-1.5 flex-1" aria-label={`${job.match_score}% career fit`} />
                                  <span className="w-10 text-right text-xs font-semibold tabular-nums">{job.match_score}%</span>
                                </div>
                                <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                                  {job.match_score >= 80 ? "Strong fit" : job.match_score >= 60 ? "Possible fit" : "Outside some preferences"}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" /> {job.location}
                                  </span>
                                  {job.remote && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Remote</Badge>
                                  )}
                                  {job.salary && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <DollarSign className="w-2.5 h-2.5" /> {job.salary}
                                    </span>
                                  )}
                                </div>
                                {/* Match reason tags */}
                                {job.match_reasons && Object.keys(job.match_reasons).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {Object.entries(job.match_reasons)
                                      .sort(([,a], [,b]) => (b as number) - (a as number))
                                      .slice(0, 3)
                                      .map(([reason, score]) => (
                                        <Badge key={reason} variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5">
                                          {reason.replace(/_/g, " ")}: {score}%
                                        </Badge>
                                      ))}
                                  </div>
                                )}
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{job.match_summary}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* RIGHT PANE: reuse the same detail panel as search */}
                {selectedJob ? (
                  <div className={cn("flex-1 flex flex-col bg-background overflow-hidden", "w-full md:w-auto")}>
                    <div className="md:hidden px-4 py-2 border-b">
                      <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setSelectedJob(null)}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to matches
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="max-w-3xl p-6 space-y-5">
                        {/* Match score banner — single accent palette */}
                        {"match_score" in selectedJob && (
                          <div className={cn(
                            "rounded-lg p-3 flex items-center gap-3 border",
                            (selectedJob as MatchedJob).match_score >= 80 ? "bg-rp-accent/10 border-rp-accent/30" :
                            (selectedJob as MatchedJob).match_score >= 60 ? "bg-rp-paper border-rp-rule-2" :
                            "bg-rp-paper border-rp-rule"
                          )}>
                            <div className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg tabular-nums",
                              (selectedJob as MatchedJob).match_score >= 80 ? "bg-rp-accent/20 text-rp-accent" :
                              (selectedJob as MatchedJob).match_score >= 60 ? "bg-rp-paper-2 text-rp-ink" :
                              "bg-rp-paper-2 text-rp-ink-2"
                            )}>
                              {(selectedJob as MatchedJob).match_score}%
                            </div>
                            <div>
                              <p className="text-sm font-medium text-rp-ink">Career fit</p>
                              <p className="text-xs text-rp-ink-2">
                                Resume evidence + hard preferences
                                {(selectedJob as MatchedJob).fit_confidence != null
                                  ? ` · ${Math.round(((selectedJob as MatchedJob).fit_confidence ?? 0) * 100)}% confidence`
                                  : ""}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Job header - same as search view */}
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
                          <div className="flex flex-wrap gap-1.5">
                            {selectedJob.role_category && selectedJob.role_category !== "Other" && (
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{selectedJob.role_category}</Badge>
                            )}
                            {selectedJob.remote && (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs gap-1">
                                <Globe className="w-3 h-3" /> Remote
                              </Badge>
                            )}
                            {selectedJob.salary && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <DollarSign className="w-3 h-3" /> {selectedJob.salary}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={preparingMatch === (selectedJob as MatchedJob).match_id}
                              onClick={() => void prepareMatchedApplication(selectedJob as MatchedJob)}
                            >
                              {preparingMatch === (selectedJob as MatchedJob).match_id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <WandSparkles className="h-4 w-4" />}
                              Tailor + ATS
                            </Button>
                            <JobApplyButton
                              job={{
                                id: selectedJob.id,
                                title: selectedJob.title,
                                company: selectedJob.company,
                                location: selectedJob.location,
                                apply_url: selectedJob.apply_url,
                                source: selectedJob.source,
                                description: selectedJob.description,
                              }}
                              variant="compact"
                            />
                            <Button
                              variant={isJobSaved(selectedJob) ? "secondary" : "outline"}
                              size="sm"
                              className="gap-1.5 h-8"
                              onClick={() => toggleSaveJob(selectedJob)}
                              disabled={savingJobs.has(selectedJob.id)}
                            >
                              {isJobSaved(selectedJob) ? <BookmarkCheck className="w-4 h-4 fill-current" /> : <Bookmark className="w-4 h-4" />}
                              {isJobSaved(selectedJob) ? "Saved" : "Save"}
                            </Button>
                          </div>
                        </div>
                        {(selectedJob as MatchedJob).match_dimensions.length > 0 && (
                          <div className="border-t pt-5">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-rp-accent" />
                              <h3 className="font-semibold text-base">Why this role fits</h3>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{(selectedJob as MatchedJob).match_summary}</p>
                            <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                              {(selectedJob as MatchedJob).match_dimensions.map((dimension) => (
                                <div key={dimension.key}>
                                  <div className="mb-1.5 flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{dimension.label}</span>
                                    <span className="font-semibold tabular-nums">{Math.round(dimension.score)}%</span>
                                  </div>
                                  <Progress value={dimension.score} className="h-1.5" />
                                  {dimension.evidence?.[0] && (
                                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{dimension.evidence[0]}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                            {((selectedJob as MatchedJob).matched_keywords.length > 0 || (selectedJob as MatchedJob).gaps.length > 0) && (
                              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                                <div className="border border-emerald-500/20 bg-emerald-500/5 p-3">
                                  <p className="flex items-center gap-1.5 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Evidence found</p>
                                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{(selectedJob as MatchedJob).matched_keywords.slice(0, 8).join(" · ") || "No explicit keyword evidence recorded."}</p>
                                </div>
                                <div className="border border-amber-500/20 bg-amber-500/5 p-3">
                                  <p className="text-xs font-semibold">Gaps to review</p>
                                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{(selectedJob as MatchedJob).gaps.slice(0, 4).join(" · ") || "No material gaps recorded."}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="border-t pt-5">
                          <h3 className="font-semibold text-base mb-3">About the job</h3>
                          {selectedJob.description ? (
                            <JobDescription value={selectedJob.description} />
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
                  <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Select a matched job to view details</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
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
  SlidersHorizontal, Globe, Sparkles, ThumbsUp, ThumbsDown, Zap,
  TrendingUp, Crown, RefreshCw, Send, CheckCircle2, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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

interface MatchedJob extends Job {
  match_score?: number;
  match_reasons?: {
    title_match: number;
    skills_match: number;
    location_match: number;
    seniority_match: number;
    salary_match: number;
    details: string[];
  };
  applied?: boolean;
  liked?: boolean;
}

const POPULAR_ROLES = [
  "Software Engineer", "Data Scientist", "Product Manager",
  "UX Designer", "DevOps Engineer", "Frontend Developer",
  "Backend Developer", "Full Stack Developer", "Data Analyst",
];

export default function JobSearchPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [jobType, setJobType] = useState("all");
  const [datePosted, setDatePosted] = useState("week");
  const [sortBy, setSortBy] = useState("relevance");
  const [showFilters, setShowFilters] = useState(false);

  // Combined job list
  const [allJobs, setAllJobs] = useState<MatchedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [applyingJobs, setApplyingJobs] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  // Stats
  const [stats, setStats] = useState({ total: 0, newToday: 0, applied: 0, matches: 0 });
  const [isPremium, setIsPremium] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadStats();
      checkSubscription();
      loadAppliedJobs();
      // Auto-load DB jobs on mount
      loadJobsFromDB();
    }
  }, [user]);

  const checkSubscription = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("subscription_plans")
      .select("plan_type, status")
      .eq("user_id", user.id)
      .maybeSingle();
    setIsPremium(data?.plan_type === "premium" && data?.status === "active");
  };

  const loadProfile = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("target_role, desired_roles, preferred_work_type, desired_locations, profile_setup_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      setProfileComplete(!!(profile as any).profile_setup_completed);
      const roles = (profile as any).desired_roles;
      if (Array.isArray(roles) && roles.length > 0) {
        setQuery(roles[0]);
      } else if (profile.target_role) {
        setQuery(profile.target_role);
      }
      // Set remote preference from profile
      const workType = (profile as any).preferred_work_type;
      if (workType === "remote") setRemote(true);
    }
  };

  const loadStats = async () => {
    if (!user) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [matchCount, todayCount, appliedCount] = await Promise.all([
      supabase.from("job_matches").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    setStats({
      total: (matchCount.count || 0) + (todayCount.count || 0),
      newToday: todayCount.count || 0,
      applied: appliedCount.count || 0,
      matches: matchCount.count || 0,
    });
  };

  const loadAppliedJobs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("job_applications")
      .select("job_id")
      .eq("user_id", user.id);
    if (data) {
      setAppliedJobIds(new Set(data.map((d: any) => d.job_id).filter(Boolean)));
    }
  };

  // Load jobs from the local DB (already fetched by daily-job-fetch)
  const loadJobsFromDB = async (searchQuery?: string) => {
    if (!user) return;
    setLoading(true);

    try {
      // First, load AI matches
      const { data: matches } = await supabase
        .from("job_matches")
        .select(`match_score, match_reasons, liked, dismissed, job_id, jobs (*)`)
        .eq("user_id", user.id)
        .eq("dismissed", false)
        .order("match_score", { ascending: false })
        .limit(200);

      // Then, search the DB for matching jobs
      let dbQuery = supabase
        .from("jobs")
        .select("*")
        .order("date_posted", { ascending: false })
        .limit(100);

      const q = searchQuery || query;
      if (q) {
        dbQuery = dbQuery.or(`title.ilike.%${q}%,company.ilike.%${q}%,description.ilike.%${q}%`);
      }
      if (remote) {
        dbQuery = dbQuery.eq("remote", true);
      }
      if (jobType !== "all") {
        dbQuery = dbQuery.ilike("job_type", `%${jobType}%`);
      }

      const { data: dbJobs } = await dbQuery;

      // Build a map of match data by job_id
      const matchMap = new Map<string, { score: number; reasons: any; liked: boolean }>();
      if (matches) {
        for (const m of matches as any[]) {
          if (m.jobs) {
            matchMap.set(m.jobs.id, {
              score: m.match_score,
              reasons: m.match_reasons,
              liked: m.liked || false,
            });
          }
        }
      }

      // Merge: matched jobs first (with scores), then DB search results (without duplicates)
      const seen = new Set<string>();
      const combined: MatchedJob[] = [];

      // Add matched jobs first
      if (matches) {
        for (const m of matches as any[]) {
          if (!m.jobs) continue;
          const j = m.jobs;
          seen.add(j.id);
          combined.push({
            id: j.id,
            title: j.title,
            company: j.company,
            logo: j.employer_logo,
            location: j.location || "Unknown",
            description: j.description || "",
            apply_url: j.apply_url || "",
            date_posted: j.date_posted || "",
            salary_min: j.salary_min,
            salary_max: j.salary_max,
            job_type: j.job_type || "",
            remote: j.remote || false,
            source: j.source || "unknown",
            match_score: m.match_score,
            match_reasons: m.match_reasons,
            liked: m.liked,
            applied: appliedJobIds.has(j.id),
          });
        }
      }

      // Add DB results that aren't already in matches
      if (dbJobs) {
        for (const j of dbJobs) {
          if (seen.has(j.id)) continue;
          seen.add(j.id);
          const matchData = matchMap.get(j.id);
          combined.push({
            id: j.id,
            title: j.title,
            company: j.company,
            logo: (j as any).employer_logo,
            location: j.location || "Unknown",
            description: j.description || "",
            apply_url: j.apply_url || "",
            date_posted: j.date_posted || "",
            salary_min: j.salary_min,
            salary_max: j.salary_max,
            job_type: j.job_type || "",
            remote: j.remote || false,
            source: j.source || "unknown",
            match_score: matchData?.score,
            match_reasons: matchData?.reasons,
            liked: matchData?.liked,
            applied: appliedJobIds.has(j.id),
          });
        }
      }

      setAllJobs(combined);
      setHasSearched(true);
    } catch (err) {
      console.error("Failed to load jobs:", err);
      toast({ title: "Failed to load jobs", description: "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Live search: fetches from external APIs via edge function + merges with DB results
  const searchJobs = useCallback(async (overrideQuery?: string, searchPage = 1) => {
    const q = overrideQuery || query;
    if (!q.trim()) {
      toast({ title: "Enter a search term", description: "Type a job title or keyword to search" });
      return;
    }
    setLoading(true);
    setHasSearched(true);
    setPage(searchPage);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt8F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g";
      const authToken = token || anonKey;

      // Fetch from live API
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://woxtbyotydxorcdhhivr.supabase.co"}/functions/v1/job-search-v2`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            query: q,
            location,
            jobType: jobType !== "all" ? jobType : undefined,
            remote,
            datePosted,
            page: searchPage,
          }),
        }
      );

      let liveJobs: Job[] = [];
      if (response.ok) {
        const data = await response.json();
        liveJobs = data.jobs || [];
      }

      // Also get AI match data if user is logged in
      let matchMap = new Map<string, { score: number; reasons: any; liked: boolean }>();
      if (user) {
        const { data: matches } = await supabase
          .from("job_matches")
          .select("match_score, match_reasons, liked, job_id")
          .eq("user_id", user.id);
        if (matches) {
          for (const m of matches as any[]) {
            matchMap.set(m.job_id, { score: m.match_score, reasons: m.match_reasons, liked: m.liked });
          }
        }
      }

      // Merge live results with match data
      const seen = new Set<string>();
      const combined: MatchedJob[] = [];

      for (const j of liveJobs) {
        seen.add(j.id);
        const matchData = matchMap.get(j.id);
        combined.push({
          ...j,
          match_score: matchData?.score,
          match_reasons: matchData?.reasons,
          liked: matchData?.liked,
          applied: appliedJobIds.has(j.id),
        });
      }

      // Also search local DB for more results
      let dbQuery = supabase
        .from("jobs")
        .select("*")
        .or(`title.ilike.%${q}%,company.ilike.%${q}%`)
        .order("date_posted", { ascending: false })
        .limit(50);

      if (remote) dbQuery = dbQuery.eq("remote", true);

      const { data: dbJobs } = await dbQuery;
      if (dbJobs) {
        for (const j of dbJobs) {
          if (seen.has(j.id)) continue;
          seen.add(j.id);
          const matchData = matchMap.get(j.id);
          combined.push({
            id: j.id,
            title: j.title,
            company: j.company,
            logo: (j as any).employer_logo,
            location: j.location || "Unknown",
            description: j.description || "",
            apply_url: j.apply_url || "",
            date_posted: j.date_posted || "",
            salary_min: j.salary_min,
            salary_max: j.salary_max,
            job_type: j.job_type || "",
            remote: j.remote || false,
            source: j.source || "unknown",
            match_score: matchData?.score,
            match_reasons: matchData?.reasons,
            liked: matchData?.liked,
            applied: appliedJobIds.has(j.id),
          });
        }
      }

      setAllJobs(combined);
      if (combined.length === 0) {
        toast({ title: `No jobs found for "${q}"`, description: "Try broader keywords or different filters" });
      }
    } catch (err) {
      console.error("Search failed:", err);
      toast({ title: "Search failed", description: "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [query, location, jobType, remote, datePosted, user, appliedJobIds]);

  const triggerMatchCompute = async () => {
    if (!user) return;
    setMatchLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt8F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://woxtbyotydxorcdhhivr.supabase.co"}/functions/v1/match-jobs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({ user_id: user.id }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        toast({ title: "Matches updated!", description: `Found ${data.total} matching jobs` });
        await loadJobsFromDB();
        await loadStats();
      } else {
        toast({ title: "Match update failed", description: "Make sure your profile is complete", variant: "destructive" });
      }
    } catch (err) {
      console.error("Match compute error:", err);
      toast({ title: "Error computing matches", variant: "destructive" });
    } finally {
      setMatchLoading(false);
    }
  };

  const saveJob = async (job: MatchedJob) => {
    if (!user) {
      toast({ title: "Sign in to save jobs", variant: "destructive" });
      return;
    }
    try {
      await supabase.from("tracked_jobs").insert({
        user_id: user.id,
        title: job.title,
        company: job.company,
        url: job.apply_url,
        status: "Saved",
      });
      toast({ title: "Saved!", description: `${job.title} at ${job.company}` });
    } catch {
      toast({ title: "Already saved", description: "This job is already in your tracker" });
    }
  };

  const applyToJob = async (job: MatchedJob) => {
    if (!user) {
      toast({ title: "Sign in to apply", variant: "destructive" });
      return;
    }

    setApplyingJobs((prev) => new Set(prev).add(job.id));

    try {
      // Record the application
      await supabase.from("job_applications").upsert({
        user_id: user.id,
        job_id: job.id,
        title: job.title,
        company: job.company,
        apply_url: job.apply_url,
        status: "applied",
      }, { onConflict: "user_id,job_id" });

      // Mark as applied locally
      setAppliedJobIds((prev) => new Set(prev).add(job.id));
      setAllJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, applied: true } : j))
      );

      // Open job link
      if (job.apply_url) {
        window.open(job.apply_url, "_blank");
      }
      toast({ title: "Applied!", description: `Opening ${job.company} application` });
      loadStats();
    } catch {
      // already applied
    } finally {
      setApplyingJobs((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const autoApply = async (job: MatchedJob) => {
    if (!isPremium) {
      toast({ title: "Premium feature", description: "Upgrade to enable auto-apply" });
      navigate("/pricing");
      return;
    }
    // TODO: Implement actual auto-apply via edge function
    toast({ title: "Auto-Apply", description: `Auto-applying to ${job.company}... (coming soon)` });
  };

  const likeJob = async (jobId: string, liked: boolean) => {
    if (!user) return;
    await supabase
      .from("job_matches")
      .update({ liked })
      .eq("user_id", user.id)
      .eq("job_id", jobId);
    setAllJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, liked } : j))
    );
  };

  const dismissJob = async (jobId: string) => {
    if (!user) return;
    await supabase
      .from("job_matches")
      .update({ dismissed: true })
      .eq("user_id", user.id)
      .eq("job_id", jobId);
    setAllJobs((prev) => prev.filter((j) => j.id !== jobId));
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
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400";
    if (score >= 40) return "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400";
    return "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400";
  };

  // Sort the combined list
  const sortedJobs = [...allJobs].sort((a, b) => {
    if (sortBy === "relevance") {
      // Jobs with match scores first, then by score, then by date
      if (a.match_score && !b.match_score) return -1;
      if (!a.match_score && b.match_score) return 1;
      if (a.match_score && b.match_score) return b.match_score - a.match_score;
      return new Date(b.date_posted || 0).getTime() - new Date(a.date_posted || 0).getTime();
    }
    if (sortBy === "date") return new Date(b.date_posted || 0).getTime() - new Date(a.date_posted || 0).getTime();
    if (sortBy === "salary") return (b.salary_max || 0) - (a.salary_max || 0);
    if (sortBy === "match_score") return (b.match_score || 0) - (a.match_score || 0);
    return 0;
  });

  const matchedCount = allJobs.filter((j) => j.match_score !== undefined).length;

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-primary" />
              Jobs
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Search, match, and apply — all in one place</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={triggerMatchCompute} disabled={matchLoading} className="gap-1.5">
              {matchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {matchLoading ? "Matching..." : "Refresh Matches"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/profile-setup")} className="gap-1.5">
              <Zap className="w-4 h-4" /> Profile
            </Button>
            {!isPremium && (
              <Button size="sm" onClick={() => navigate("/pricing")} className="gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                <Crown className="w-4 h-4" /> Auto-Apply
              </Button>
            )}
          </div>
        </div>

        {/* Profile setup nudge */}
        {user && !profileComplete && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-sm font-medium">Complete your profile for better matches</p>
                  <p className="text-xs text-muted-foreground">Add skills, preferences, and target roles to get AI-powered job matches</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/profile-setup")} className="shrink-0">
                Setup Profile
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-primary">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground">Available Jobs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-purple-600">{stats.matches}</p>
              <p className="text-[11px] text-muted-foreground">AI Matches</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-green-600">{stats.newToday}</p>
              <p className="text-[11px] text-muted-foreground">New Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{stats.applied}</p>
              <p className="text-[11px] text-muted-foreground">Applied</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
              <Button variant="outline" className="h-11" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="w-4 h-4" />
              </Button>
            </div>

            {/* Quick role suggestions */}
            {!hasSearched && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground py-1">Popular:</span>
                {POPULAR_ROLES.map((role) => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setQuery(role);
                      searchJobs(role);
                    }}
                  >
                    {role}
                  </Button>
                ))}
              </div>
            )}

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
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort By</Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">Relevance</SelectItem>
                      <SelectItem value="match_score">Match Score</SelectItem>
                      <SelectItem value="date">Date Posted</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
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

        {/* Results info */}
        {hasSearched && !loading && allJobs.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {allJobs.length} jobs found
              {matchedCount > 0 && (
                <span className="ml-1 text-primary font-medium">• {matchedCount} with AI match scores</span>
              )}
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex gap-4">
                    <Skeleton className="w-14 h-14 rounded-xl" />
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
        {!loading && hasSearched && allJobs.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-muted-foreground mt-1">Try different keywords, broader filters, or refresh your matches</p>
            <div className="flex justify-center gap-3 mt-4">
              <Button onClick={triggerMatchCompute} disabled={matchLoading} className="gap-2">
                <Sparkles className="w-4 h-4" /> Compute AI Matches
              </Button>
              <Button variant="outline" onClick={() => { setQuery("Software Engineer"); searchJobs("Software Engineer"); }}>
                Try "Software Engineer"
              </Button>
            </div>
          </div>
        )}

        {/* Initial state - no search yet */}
        {!loading && !hasSearched && allJobs.length === 0 && (
          <div className="text-center py-16">
            <Sparkles className="w-16 h-16 mx-auto text-primary/20 mb-4" />
            <h3 className="text-lg font-medium">Find your next opportunity</h3>
            <p className="text-muted-foreground mt-1">Search for jobs, get AI match scores, and apply with one click</p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {POPULAR_ROLES.slice(0, 5).map((role) => (
                <Button key={role} variant="outline" size="sm" onClick={() => { setQuery(role); searchJobs(role); }}>
                  {role}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Job Cards */}
        {!loading && sortedJobs.length > 0 && (
          <div className="space-y-3">
            {sortedJobs.map((job) => (
              <Card key={job.id} className={cn("hover:shadow-md transition-shadow", job.applied && "border-green-200 bg-green-50/30 dark:bg-green-950/10")}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex gap-3 sm:gap-4">
                    {/* Match Score or Logo */}
                    {job.match_score !== undefined ? (
                      <div className={cn("w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0", scoreColor(job.match_score))}>
                        <span className="text-lg font-bold">{job.match_score}</span>
                        <span className="text-[10px] font-medium -mt-0.5">match</span>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {job.logo ? (
                          <img src={job.logo} alt={job.company} className="w-full h-full object-contain" />
                        ) : (
                          <Building2 className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base leading-tight truncate">{job.title}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
                        </div>
                        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                          {/* Like / Dismiss for matched jobs */}
                          {job.match_score !== undefined && (
                            <>
                              <Button variant="ghost" size="icon" className={cn("h-8 w-8", job.liked && "text-green-600 bg-green-100")} onClick={() => likeJob(job.id, !job.liked)} title="Like">
                                <ThumbsUp className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => dismissJob(job.id)} title="Not interested">
                                <ThumbsDown className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveJob(job)} title="Save to tracker">
                            <Bookmark className="w-4 h-4" />
                          </Button>

                          {/* Apply buttons */}
                          {job.applied ? (
                            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-green-600 border-green-300" disabled>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                            </Button>
                          ) : (
                            <div className="flex gap-1">
                              <Button size="sm" className="gap-1.5 h-8" onClick={() => applyToJob(job)} disabled={applyingJobs.has(job.id)}>
                                {applyingJobs.has(job.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                                Apply
                              </Button>
                              {isPremium && (
                                <Button size="sm" variant="secondary" className="gap-1.5 h-8 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 dark:from-purple-900/30 dark:to-blue-900/30 dark:text-purple-300" onClick={() => autoApply(job)}>
                                  <Zap className="w-3.5 h-3.5" /> Auto
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Match reasons */}
                      {job.match_reasons?.details && job.match_reasons.details.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {job.match_reasons.details.slice(0, 3).map((reason, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] gap-1 bg-primary/5 text-primary">
                              <Sparkles className="w-2.5 h-2.5" /> {reason}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
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

                      {/* Description */}
                      {job.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination for search results */}
        {!loading && sortedJobs.length >= 10 && (
          <div className="flex justify-center gap-2 pt-2 pb-6">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => searchJobs(undefined, page - 1)} className="gap-1">
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" onClick={() => searchJobs(undefined, page + 1)} className="gap-1">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

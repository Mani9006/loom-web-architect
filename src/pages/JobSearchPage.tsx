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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, MapPin, Briefcase, ExternalLink, Building2,
  Clock, DollarSign, Loader2, Bookmark, ChevronLeft, ChevronRight,
  SlidersHorizontal, Globe, Sparkles, ThumbsUp, ThumbsDown, Zap,
  TrendingUp, Crown, RefreshCw,
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
}

export default function JobSearchPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [jobType, setJobType] = useState("all");
  const [datePosted, setDatePosted] = useState("week");
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState("matches");
  const [sortBy, setSortBy] = useState("match_score");
  const [stats, setStats] = useState({ total: 0, newToday: 0, applied: 0 });
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (user) {
      loadDefaultQuery();
      loadMatchedJobs();
      loadStats();
      checkSubscription();
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
      total: matchCount.count || 0,
      newToday: todayCount.count || 0,
      applied: appliedCount.count || 0,
    });
  };

  const loadDefaultQuery = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("target_role, desired_roles")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      const roles = (profile as any).desired_roles;
      if (Array.isArray(roles) && roles.length > 0) {
        setQuery(roles[0]);
      } else if (profile.target_role) {
        setQuery(profile.target_role);
      }
    }

    // Fallback to resume
    if (!query) {
      const { data: resume } = await supabase
        .from("resumes")
        .select("personal_info")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (resume) {
        const info = resume.personal_info as any;
        if (info?.jobTitle) setQuery(info.jobTitle);
      }
    }
  };

  const loadMatchedJobs = async () => {
    if (!user) return;
    setMatchLoading(true);

    try {
      // Get matched jobs with job details
      const { data: matches } = await supabase
        .from("job_matches")
        .select(`
          match_score,
          match_reasons,
          liked,
          dismissed,
          job_id,
          jobs (*)
        `)
        .eq("user_id", user.id)
        .eq("dismissed", false)
        .order("match_score", { ascending: false })
        .limit(100);

      if (matches && matches.length > 0) {
        const mapped: MatchedJob[] = matches
          .filter((m: any) => m.jobs)
          .map((m: any) => ({
            id: m.jobs.id,
            title: m.jobs.title,
            company: m.jobs.company,
            logo: m.jobs.employer_logo,
            location: m.jobs.location || "Unknown",
            description: m.jobs.description || "",
            apply_url: m.jobs.apply_url || "",
            date_posted: m.jobs.date_posted || "",
            salary_min: m.jobs.salary_min,
            salary_max: m.jobs.salary_max,
            job_type: m.jobs.job_type || "",
            remote: m.jobs.remote || false,
            source: m.jobs.source || "unknown",
            match_score: m.match_score,
            match_reasons: m.match_reasons,
          }));
        setMatchedJobs(mapped);
      }
    } catch (err) {
      console.error("Failed to load matches:", err);
    } finally {
      setMatchLoading(false);
    }
  };

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
        toast({ title: "Matches updated", description: `Found ${data.total} matching jobs!` });
        await loadMatchedJobs();
        await loadStats();
      }
    } catch (err) {
      console.error("Match compute error:", err);
    } finally {
      setMatchLoading(false);
    }
  };

  const searchJobs = async (searchPage = 1) => {
    setLoading(true);
    setHasSearched(true);
    setPage(searchPage);
    setActiveTab("search");

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      // Use user JWT if logged in, otherwise fall back to anon key for public job search
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt8F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g";
      const authToken = token || anonKey;

      const response = await fetch(
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

      if (!response.ok) throw new Error("Job search failed");

      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error("Search failed:", err);
      toast({ title: "Search failed", description: "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveJob = async (job: MatchedJob) => {
    if (!user) return;
    try {
      await supabase.from("tracked_jobs").insert({
        user_id: user.id,
        title: job.title,
        company: job.company,
        url: job.apply_url,
        status: "Saved",
      });
      toast({ title: "Job saved", description: `${job.title} at ${job.company} added to tracker.` });
    } catch {
      toast({ title: "Error", description: "Failed to save job", variant: "destructive" });
    }
  };

  const applyToJob = async (job: MatchedJob) => {
    if (!user) return;
    // Record application
    try {
      await supabase.from("job_applications").insert({
        user_id: user.id,
        job_id: job.id,
        title: job.title,
        company: job.company,
        apply_url: job.apply_url,
        status: "applied",
      });
    } catch {
      // May fail if already applied
    }
    // Open job link
    window.open(job.apply_url, "_blank");
    toast({ title: "Applied!", description: `Opening ${job.company} application page...` });
    loadStats();
  };

  const likeJob = async (jobId: string, liked: boolean) => {
    if (!user) return;
    await supabase
      .from("job_matches")
      .update({ liked })
      .eq("user_id", user.id)
      .eq("job_id", jobId);
  };

  const dismissJob = async (jobId: string) => {
    if (!user) return;
    await supabase
      .from("job_matches")
      .update({ dismissed: true })
      .eq("user_id", user.id)
      .eq("job_id", jobId);
    setMatchedJobs((prev) => prev.filter((j) => j.id !== jobId));
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

  const displayJobs = activeTab === "matches" ? matchedJobs : jobs;
  const sortedJobs = [...displayJobs].sort((a, b) => {
    if (sortBy === "match_score") return (b.match_score || 0) - (a.match_score || 0);
    if (sortBy === "date") return new Date(b.date_posted || 0).getTime() - new Date(a.date_posted || 0).getTime();
    if (sortBy === "salary") return ((b.salary_max || 0) - (a.salary_max || 0));
    return 0;
  });

  const renderJobCard = (job: MatchedJob) => (
    <Card key={job.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Match Score */}
          {job.match_score !== undefined && (
            <div className={cn("w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0", scoreColor(job.match_score))}>
              <span className="text-lg font-bold">{job.match_score}</span>
              <span className="text-[10px] font-medium -mt-0.5">match</span>
            </div>
          )}

          {/* Logo fallback if no match score */}
          {job.match_score === undefined && (
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
              <div>
                <h3 className="font-semibold text-base leading-tight">{job.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {job.match_score !== undefined && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => likeJob(job.id, true)} title="Like">
                      <ThumbsUp className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => dismissJob(job.id)} title="Dismiss">
                      <ThumbsDown className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveJob(job)} title="Save">
                  <Bookmark className="w-4 h-4" />
                </Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => applyToJob(job)}>
                  Apply <ExternalLink className="w-3.5 h-3.5" />
                </Button>
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
            <div className="flex flex-wrap gap-2 mt-2">
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
  );

  return (
    <div className="bg-muted/30 min-h-full">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Job Discovery
            </h1>
            <p className="text-muted-foreground mt-1">AI-matched jobs tailored to your profile</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/profile-setup")} className="gap-1.5">
              <Zap className="w-4 h-4" /> Edit Profile
            </Button>
            {!isPremium && (
              <Button size="sm" onClick={() => navigate("/pricing")} className="gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600">
                <Crown className="w-4 h-4" /> Upgrade
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Matches</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.newToday}</p>
              <p className="text-xs text-muted-foreground">New Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.applied}</p>
              <p className="text-xs text-muted-foreground">Applied</p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Job title, skills, or keywords..." className="pl-10 h-11" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchJobs()} />
              </div>
              <div className="relative flex-1 sm:max-w-[200px]">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Location..." className="pl-10 h-11" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchJobs()} />
              </div>
              <Button onClick={() => searchJobs()} disabled={loading} className="h-11 gap-2 px-6">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </div>

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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="matches" className="gap-1.5">
                <Sparkles className="w-4 h-4" /> AI Matches ({matchedJobs.length})
              </TabsTrigger>
              <TabsTrigger value="search" className="gap-1.5">
                <Search className="w-4 h-4" /> Search Results ({jobs.length})
              </TabsTrigger>
            </TabsList>
            {activeTab === "matches" && (
              <Button variant="outline" size="sm" onClick={triggerMatchCompute} disabled={matchLoading} className="gap-1.5">
                {matchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh Matches
              </Button>
            )}
          </div>

          <TabsContent value="matches" className="mt-4 space-y-3">
            {matchLoading && (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i}><CardContent className="p-5"><div className="flex gap-4"><Skeleton className="w-14 h-14 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-full" /></div></div></CardContent></Card>
                ))}
              </div>
            )}

            {!matchLoading && matchedJobs.length === 0 && (
              <div className="text-center py-16">
                <TrendingUp className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium">No matches yet</h3>
                <p className="text-muted-foreground mt-1">Complete your profile setup to get AI-powered job matches</p>
                <div className="flex justify-center gap-3 mt-4">
                  <Button onClick={() => navigate("/profile-setup")} className="gap-2">
                    <Zap className="w-4 h-4" /> Setup Profile
                  </Button>
                  <Button variant="outline" onClick={triggerMatchCompute} disabled={matchLoading} className="gap-2">
                    <RefreshCw className="w-4 h-4" /> Compute Matches
                  </Button>
                </div>
              </div>
            )}

            {!matchLoading && sortedJobs.filter(() => activeTab === "matches").length > 0 && (
              <div className="space-y-3">
                {sortedJobs.map(renderJobCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="search" className="mt-4 space-y-3">
            {loading && (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i}><CardContent className="p-5"><div className="flex gap-4"><Skeleton className="w-12 h-12 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-full" /></div></div></CardContent></Card>
                ))}
              </div>
            )}

            {!loading && hasSearched && jobs.length === 0 && (
              <div className="text-center py-16">
                <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium">No jobs found</h3>
                <p className="text-muted-foreground mt-1">Try different keywords or filters</p>
              </div>
            )}

            {!loading && jobs.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">{jobs.length} jobs found</p>
                <div className="space-y-3">
                  {jobs.map(renderJobCard)}
                </div>
                <div className="flex justify-center gap-2 pt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => searchJobs(page - 1)} className="gap-1">
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Button>
                  <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page}</span>
                  <Button variant="outline" size="sm" onClick={() => searchJobs(page + 1)} className="gap-1">
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}

            {!hasSearched && !loading && activeTab === "search" && (
              <div className="text-center py-16">
                <Search className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
                <h3 className="text-lg font-medium">Search for opportunities</h3>
                <p className="text-muted-foreground mt-1">Enter a job title or use the suggestions below</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {["Software Engineer", "Data Scientist", "Product Manager", "UX Designer", "DevOps Engineer"].map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => { setQuery(s); searchJobs(); }}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

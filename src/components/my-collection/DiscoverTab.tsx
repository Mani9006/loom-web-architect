import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ExternalLink,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Building2,
  MapPin,
  Plus,
  Settings,
} from "lucide-react";
import { Link } from "react-router-dom";
import AddJobManuallyDialog from "./AddJobManuallyDialog";

const PAGE_SIZE = 25;

interface ScannedJob {
  id: string;
  title: string;
  company_id: string | null;
  location: string | null;
  department: string | null;
  remote_policy: string | null;
  compensation_text: string | null;
  description_md: string | null;
  apply_url: string | null;
  posted_at: string | null;
  is_live: boolean;
}

interface CompanyMap {
  [key: string]: { name: string; slug: string };
}

interface MCEvaluation {
  id: string;
  scanned_job_id: string;
  score: number | null;
  tier: string | null;
  summary: string | null;
}

interface MCTrackedJob {
  id: string;
  scanned_job_id: string | null;
  status: string;
}

interface Props {
  sessionId: string;
  session: { master_resume_id: string | null; target_profile: Record<string, unknown> };
}

export default function DiscoverTab({ sessionId, session }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<ScannedJob[]>([]);
  const [companies, setCompanies] = useState<CompanyMap>({});
  const [evaluations, setEvaluations] = useState<Record<string, MCEvaluation>>({});
  const [trackedByJob, setTrackedByJob] = useState<Record<string, MCTrackedJob>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [scoringJobId, setScoringJobId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const tp = (session.target_profile ?? {}) as Record<string, unknown>;
  const targetRoles = (tp.target_roles as string[]) ?? [];
  const targetLocations = (tp.target_locations as string[]) ?? [];
  const remoteOnly = !!tp.remote_only;

  const titleFilter = useMemo(() => {
    if (targetRoles.length === 0) return null;
    return targetRoles.join("|");
  }, [targetRoles]);

  async function loadCompanies() {
    const { data } = await supabase.from("scan_companies").select("id,name,slug");
    if (data) {
      const m: CompanyMap = {};
      data.forEach((c: { id: string; name: string; slug: string }) => {
        m[c.id] = { name: c.name, slug: c.slug };
      });
      setCompanies(m);
    }
  }

  async function loadJobs() {
    setLoading(true);

    let query = supabase
      .from("scanned_jobs")
      .select("*", { count: "exact" })
      .eq("is_live", true);

    if (titleFilter) {
      const orFilter = targetRoles.map((r) => `title.ilike.%${r}%`).join(",");
      query = query.or(orFilter);
    }
    if (searchTerm.trim()) {
      query = query.ilike("title", `%${searchTerm.trim()}%`);
    }
    if (remoteOnly) {
      query = query.or("remote_policy.ilike.%remote%,location.ilike.%remote%");
    }

    query = query.order("posted_at", { ascending: false, nullsFirst: false });
    query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, error, count } = await query;
    setHasLoadedOnce(true);
    if (error) {
      toast({ title: "Couldn't load jobs", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const newJobs = (data as ScannedJob[]) ?? [];
    setJobs(newJobs);
    setTotal(count ?? 0);
    // If the user clicked Apply Filters and got 0 results, give them a clear
    // toast so the click feels like it did something. (On first auto-load
    // the empty-state card itself communicates this — no toast needed.)
    if (hasLoadedOnce && newJobs.length === 0) {
      toast({
        title: "No matching jobs",
        description:
          "Try broadening your target roles in Settings, or add a job manually from the empty card below.",
      });
    }

    const ids = (data ?? []).map((j: ScannedJob) => j.id);
    if (ids.length > 0) {
      const { data: evals } = await (supabase as any)
        
.from("mc_evaluations")
        .select("id,scanned_job_id,score,tier,summary")
        .eq("session_id", sessionId)
        .in("scanned_job_id", ids);
      const evMap: Record<string, MCEvaluation> = {};
      (evals ?? []).forEach((e: MCEvaluation) => {
        evMap[e.scanned_job_id] = e;
      });
      setEvaluations(evMap);

      const { data: tracked } = await (supabase as any)
        
.from("mc_tracked_jobs")
        .select("id,scanned_job_id,status")
        .eq("session_id", sessionId)
        .in("scanned_job_id", ids);
      const tMap: Record<string, MCTrackedJob> = {};
      (tracked ?? []).forEach((t: MCTrackedJob) => {
        if (t.scanned_job_id) tMap[t.scanned_job_id] = t;
      });
      setTrackedByJob(tMap);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sessionId, titleFilter, remoteOnly]);

  async function saveToBoard(job: ScannedJob) {
    const company = job.company_id ? companies[job.company_id]?.name ?? "Unknown" : "Unknown";
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await (supabase as any)
      
.from("mc_tracked_jobs")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        scanned_job_id: job.id,
        job_title: job.title,
        company,
        location: job.location,
        apply_url: job.apply_url,
        jd_md: job.description_md,
        status: "saved",
      })
      .select("id,scanned_job_id,status")
      .single();
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    setTrackedByJob((m) => ({ ...m, [job.id]: data as MCTrackedJob }));
    toast({ title: "Saved to board", description: job.title });
  }

  async function scoreJob(job: ScannedJob) {
    if (!session.master_resume_id) {
      toast({
        title: "No master resume",
        description: "Pick a master resume in session settings to enable scoring.",
        variant: "destructive",
      });
      return;
    }
    setScoringJobId(job.id);
    try {
      const { data, error } = await (supabase as any).functions.invoke("career-ops-evaluate", {
        body: {
          scanned_job_id: job.id,
          resume_id: session.master_resume_id,
          session_id: sessionId,
          write_to: "mc_evaluations",
        },
      });
      if (error) throw error;
      if (data?.evaluation) {
        setEvaluations((m) => ({ ...m, [job.id]: data.evaluation }));
      }
      toast({ title: "Scored", description: data?.evaluation?.tier ?? "Done" });
    } catch (e) {
      toast({
        title: "Scoring failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setScoringJobId(null);
    }
  }

  async function trackApplyClick(job: ScannedJob) {
    const tracked = trackedByJob[job.id];
    if (tracked) {
      await (supabase as any)
        
.from("mc_tracked_jobs")
        .update({ status: "applied", clicked_at: new Date().toISOString(), applied_at: new Date().toISOString() })
        .eq("id", tracked.id);
    } else {
      await saveToBoard({ ...job });
      const company = job.company_id ? companies[job.company_id]?.name ?? "Unknown" : "Unknown";
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any)
          
.from("mc_tracked_jobs")
          .update({ status: "applied", clicked_at: new Date().toISOString(), applied_at: new Date().toISOString() })
          .eq("session_id", sessionId)
          .eq("scanned_job_id", job.id);
      }
    }
    if (job.apply_url) window.open(job.apply_url, "_blank", "noopener,noreferrer");
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filter / search bar */}
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(0), loadJobs())}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => (setPage(0), loadJobs())} disabled={loading}>
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Filter className="w-3.5 h-3.5 mr-1" />
          )}
          {loading ? "Searching…" : "Apply filters"}
        </Button>
        <div className="text-xs text-muted-foreground ml-auto">
          {total > 0 && `${total} matching jobs`}
        </div>
      </Card>

      {/* Active filters */}
      <div className="flex flex-wrap gap-1">
        {targetRoles.map((r) => (
          <Badge key={r} variant="secondary" className="font-normal">
            {r}
          </Badge>
        ))}
        {remoteOnly && <Badge variant="outline">Remote only</Badge>}
        {targetLocations.map((l) => (
          <Badge key={l} variant="outline" className="font-normal">
            <MapPin className="w-3 h-3 mr-1" />
            {l}
          </Badge>
        ))}
      </div>

      {/* Job list. We only show the full-list skeleton on the very FIRST load.
          On subsequent re-fetches (Apply Filters, page change) the button itself
          shows a spinner — the list keeps showing the previous results so the
          UI doesn't flicker between content and skeleton. */}
      {loading && !hasLoadedOnce ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            No jobs match this session's filters yet.
          </p>
          <p className="text-xs text-muted-foreground mb-5">
            The job scanner runs hourly. While you wait, you can add a job by hand or widen your
            target roles.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add job manually
            </Button>
            <Button asChild variant="outline">
              <Link to={`/my-collection/${sessionId}?tab=board`}>
                Go to board
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const ev = evaluations[job.id];
            const tracked = trackedByJob[job.id];
            const company = job.company_id ? companies[job.company_id]?.name ?? "—" : "—";
            return (
              <Card key={job.id} className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h4 className="font-medium text-[14px] leading-snug">{job.title}</h4>
                    {ev?.tier && <TierBadge tier={ev.tier} score={ev.score} />}
                    {tracked && (
                      <Badge variant="outline" className="text-[10px]">
                        On board · {tracked.status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {company}
                    </span>
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {job.location}
                      </span>
                    )}
                    {job.compensation_text && <span>{job.compensation_text}</span>}
                  </div>
                  {ev?.summary && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{ev.summary}</p>}
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => scoreJob(job)}
                    disabled={scoringJobId === job.id || !!ev}
                    className="h-7 text-[11px]"
                  >
                    {scoringJobId === job.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-1" />
                    )}
                    {ev ? "Scored" : "Score"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => saveToBoard(job)}
                    disabled={!!tracked}
                    className="h-7 text-[11px]"
                  >
                    {tracked ? <BookmarkCheck className="w-3 h-3 mr-1" /> : <Bookmark className="w-3 h-3 mr-1" />}
                    {tracked ? "Saved" : "Save"}
                  </Button>
                  {job.apply_url && (
                    <Button size="sm" onClick={() => trackApplyClick(job)} className="h-7 text-[11px]">
                      <ExternalLink className="w-3 h-3 mr-1" /> Apply
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
          </Button>
          <div className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}

      <AddJobManuallyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sessionId={sessionId}
        onCreated={() => setAddOpen(false)}
      />
    </div>
  );
}

function TierBadge({ tier, score }: { tier: string; score: number | null }) {
  const colors: Record<string, string> = {
    A: "bg-green-100 text-green-800 border-green-300",
    B: "bg-blue-100 text-blue-800 border-blue-300",
    C: "bg-yellow-100 text-yellow-800 border-yellow-300",
    D: "bg-orange-100 text-orange-800 border-orange-300",
    F: "bg-red-100 text-red-800 border-red-300",
  };
  const cls = colors[tier] ?? "bg-gray-100 text-gray-800 border-gray-300";
  return (
    <Badge className={`text-[10px] border ${cls}`}>
      {tier} · {score?.toFixed(1) ?? "—"}/5
    </Badge>
  );
}

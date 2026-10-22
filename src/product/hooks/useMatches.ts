import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, invokeFunction } from "@/product/lib/table";
import { isUsLocation } from "@/product/lib/us-jobs";
import { careerFitScore } from "@/product/lib/format";
import { matchesFilters, type MatchFilters } from "@/product/lib/filters";

export interface ProductJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workplace: string | null;
  applyUrl: string;
  description: string | null;
  postedAt: string | null;
  department: string | null;
}

export interface ProductEvaluation {
  id: string;
  scannedJobId: string;
  score: number;
  summary: string | null;
  eligible: boolean;
  gaps: string[] | null;
  dismissed: boolean;
}

export interface ProductDraft {
  id: string;
  evaluationId: string;
  status: string;
}

export function useMatches() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<ProductJob[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, ProductEvaluation>>({});
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (announce = false) => {
    if (!user) return;
    if (announce) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [evalRes, draftsRes, savedRes] = await Promise.all([
        db()
          .from("job_evaluations")
          .select("id,scanned_job_id,score,fit_score,eligible,summary,gaps,dismissed_at")
          .eq("user_id", user.id)
          .order("fit_score", { ascending: false })
          .limit(200),
        db().from("draft_applications").select("id,evaluation_id,status").eq("user_id", user.id),
        db().from("saved_matches").select("scanned_job_id").eq("user_id", user.id),
      ]);

      if (evalRes.error) throw evalRes.error;
      const rows = (evalRes.data || []) as Array<{
        id: string;
        scanned_job_id: string;
        score: number;
        fit_score: number | null;
        eligible: boolean;
        summary: string | null;
        gaps: string[] | null;
        dismissed_at: string | null;
      }>;
      const map: Record<string, ProductEvaluation> = {};
      for (const row of rows) {
        map[row.scanned_job_id] = {
          id: row.id,
          scannedJobId: row.scanned_job_id,
          score: careerFitScore(row),
          summary: row.summary,
          eligible: row.eligible,
          gaps: row.gaps,
          dismissed: Boolean(row.dismissed_at),
        };
      }

      const ids = rows.map((r) => r.scanned_job_id);
      const jobsRes = ids.length
        ? await db()
            .from("scanned_jobs")
            .select("id,title,location,department,remote_policy,apply_url,description_md,posted_at,is_live,company:scan_companies(name)")
            .in("id", ids)
            .eq("is_live", true)
        : { data: [], error: null };
      if (jobsRes.error) throw jobsRes.error;

      const nextJobs: ProductJob[] = ((jobsRes.data || []) as Array<Record<string, unknown>>)
        .map((job) => {
          const company = job.company as { name?: string } | null;
          return {
            id: String(job.id),
            title: String(job.title || "Untitled role"),
            company: company?.name || "Company",
            location: (job.location as string | null) ?? null,
            workplace: (job.remote_policy as string | null) ?? null,
            applyUrl: String(job.apply_url || ""),
            description: (job.description_md as string | null) ?? null,
            postedAt: (job.posted_at as string | null) ?? null,
            department: (job.department as string | null) ?? null,
          };
        })
        .filter((job) => isUsLocation(job.location))
        .sort((a, b) => (map[b.id]?.score ?? 0) - (map[a.id]?.score ?? 0));

      const draftMap: Record<string, ProductDraft> = {};
      for (const draft of (draftsRes.data || []) as Array<{ id: string; evaluation_id: string; status: string }>) {
        draftMap[draft.evaluation_id] = { id: draft.id, evaluationId: draft.evaluation_id, status: draft.status };
      }

      setJobs(nextJobs);
      setEvaluations(map);
      setDrafts(draftMap);
      setSaved(new Set(((savedRes.data || []) as Array<{ scanned_job_id: string }>).map((r) => r.scanned_job_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load matches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const refreshPipeline = useCallback(async () => {
    setRefreshing(true);
    await invokeFunction("career-profile-review", {});
    await invokeFunction("career-ops-bootstrap", {});
    await load(true);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const pass = useCallback(async (evaluationId: string) => {
    await invokeFunction("career-agent-control", { action: "pass", evaluation_id: evaluationId });
    setEvaluations((prev) => {
      const next = { ...prev };
      for (const [jobId, evaluation] of Object.entries(next)) {
        if (evaluation.id === evaluationId) next[jobId] = { ...evaluation, dismissed: true };
      }
      return next;
    });
  }, []);

  const saveJob = useCallback(async (jobId: string) => {
    if (!user) return;
    const next = !saved.has(jobId);
    setSaved((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(jobId);
      else copy.delete(jobId);
      return copy;
    });
    if (next) {
      const { error } = await db().from("saved_matches").insert({ user_id: user.id, scanned_job_id: jobId });
      if (error) {
        await db().from("saved_jobs").insert({
          user_id: user.id,
          title: jobs.find((j) => j.id === jobId)?.title,
          company: jobs.find((j) => j.id === jobId)?.company,
          url: jobs.find((j) => j.id === jobId)?.applyUrl,
        });
      }
    } else {
      await db().from("saved_matches").delete().eq("user_id", user.id).eq("scanned_job_id", jobId);
    }
  }, [user, saved, jobs]);

  const visible = useMemo(() => jobs.filter((job) => !evaluations[job.id]?.dismissed), [jobs, evaluations]);

  const filterJobs = useCallback((filters: MatchFilters) => {
    return visible.filter((job) =>
      matchesFilters({
        title: job.title,
        company: job.company,
        location: job.location,
        workplace: job.workplace,
        postedAt: job.postedAt,
        description: job.description,
      }, filters),
    );
  }, [visible]);

  return {
    loading,
    refreshing,
    error,
    jobs: visible,
    evaluations,
    drafts,
    saved,
    load,
    refreshPipeline,
    pass,
    saveJob,
    filterJobs,
  };
}

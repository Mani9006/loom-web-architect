import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CreditBalance } from "@/components/apply/CreditBalance";
import ApplyProgressModal from "@/components/agent/ApplyProgressModal";
import type { ApplyProgressJob } from "@/components/agent/apply-progress-core";
import { EmptyState, Panel, PrimaryButton } from "@/components/brand/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useApplyCredits } from "@/hooks/use-apply-credits";
import { APPLY_ENGINE_BATCH_LIMIT } from "@/lib/apply-credits";
import { uniqueEvaluationIds } from "@/lib/apply-engine";
import { detectAtsFromUrl } from "@/lib/ats-detect";
import { looksLikeUsLocation } from "@/lib/us-geo";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Job {
  id: string;
  title: string;
  location: string | null;
  apply_url: string;
  company: { name: string };
}

interface Evaluation {
  id: string;
  scanned_job_id: string;
  fit_score: number | null;
  score: number;
  eligible: boolean;
  summary: string | null;
}

export default function MatchesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { snapshot: credits, refresh: refreshCredits } = useApplyCredits();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});
  const [drafts, setDrafts] = useState<Record<string, { id: string; status: string }>>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasteUrl, setPasteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [passingId, setPassingId] = useState<string | null>(null);
  const [applyJobs, setApplyJobs] = useState<ApplyProgressJob[]>([]);
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const evalRes = await supabase
      .from("job_evaluations")
      .select("id,scanned_job_id,score,fit_score,eligible,summary,dismissed_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("fit_score", { ascending: false })
      .limit(120);
    const rows = (evalRes.data || []) as Evaluation[];
    const ids = rows.map((row) => row.scanned_job_id);
    const jobsRes = ids.length
      ? await supabase.from("scanned_jobs").select("id,title,location,apply_url,company:scan_companies(name)").eq("is_live", true).in("id", ids)
      : { data: [] };
    const map: Record<string, Evaluation> = {};
    for (const row of rows) map[row.scanned_job_id] = row;
    const ordered = ((jobsRes.data || []) as unknown as Job[]).filter((job) => looksLikeUsLocation(job.location));
    setJobs(ordered);
    setEvaluations(map);
    const draftsRes = await supabase.from("draft_applications").select("id,evaluation_id,status").eq("user_id", user.id);
    const draftMap: Record<string, { id: string; status: string }> = {};
    for (const draft of (draftsRes.data || []) as Array<{ id: string; evaluation_id: string; status: string }>) {
      draftMap[draft.evaluation_id] = { id: draft.id, status: draft.status };
    }
    setDrafts(draftMap);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return jobs
      .map((job) => ({ job, evaluation: evaluations[job.id] }))
      .filter((row): row is { job: Job; evaluation: Evaluation } => Boolean(row.evaluation))
      .filter(({ job }) => !term || `${job.title} ${job.company.name} ${job.location || ""}`.toLowerCase().includes(term));
  }, [jobs, evaluations, query]);

  const enqueue = async (evaluationIds: string[]) => {
    const ids = uniqueEvaluationIds(evaluationIds).slice(0, APPLY_ENGINE_BATCH_LIMIT);
    if (ids.length === 0) return;
    setBusy(true);
    setApplyJobs(ids.map((id) => {
      const job = jobs.find((item) => evaluations[item.id]?.id === id);
      return { evaluationId: id, title: job?.title ?? "Match", company: job?.company.name ?? "Company" };
    }));
    setModalOpen(true);
    const { data, error } = await supabase.functions.invoke("apply-engine-enqueue", {
      body: { evaluation_ids: ids, intent: "user_selected" },
    });
    setBusy(false);
    if (error) {
      toast.error("Those jobs could not be queued.");
      return;
    }
    const result = data as { queued?: number; needs_you?: number; jobs?: Array<{ evaluation_id: string; status: string; reason: string; draft_id?: string }> };
    for (const row of result.jobs ?? []) {
      if (row.draft_id) setDrafts((prev) => ({ ...prev, [row.evaluation_id]: { id: row.draft_id as string, status: row.status } }));
      if (row.status === "error") setApplyErrors((current) => ({ ...current, [row.evaluation_id]: row.reason }));
    }
    toast.success(`${result.queued ?? 0} queued · ${result.needs_you ?? 0} need you`);
    setSelected(new Set());
    void refreshCredits();
  };

  const passMatch = async (jobId: string) => {
    if (!user) return;
    setPassingId(jobId);
    const { error } = await (supabase.from("job_evaluations") as never as {
      update: (v: { dismissed_at: string }) => { eq: (a: string, b: string) => { eq: (c: string, d: string) => Promise<{ error: { message: string } | null }> } };
    }).update({ dismissed_at: new Date().toISOString() }).eq("scanned_job_id", jobId).eq("user_id", user.id);
    setPassingId(null);
    if (error) {
      toast.error("Could not pass this match.");
      return;
    }
    toast.success("Passed. Hidden from the feed — not an application.");
    await load();
  };

  const paste = async () => {
    const url = pasteUrl.trim();
    if (!url) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("apply-engine-enqueue", {
      body: { apply_url: url, intent: "user_selected" },
    });
    setBusy(false);
    if (error) {
      toast.error("Use a direct employer posting URL.");
      return;
    }
    setPasteUrl("");
    toast.success(detectAtsFromUrl(url).submittable ? "Queued to the cloud worker." : "Packet will be prepared. This ATS is Needs you.");
    void refreshCredits();
    await load();
  };

  if (loading) return <div className="h-80 animate-pulse rounded-lg bg-rp-paper" />;

  const topEligible = visible.filter((row) => row.evaluation.eligible).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Job matches"
        status="united states only"
        description="Pass hides a role. Apply starts a cloud job. Apply these matches queues the current top eligible rows — our name, not a clone of anyone else's batch label."
        action={<CreditBalance snapshot={credits} />}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          value={pasteUrl}
          onChange={(event) => setPasteUrl(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void paste(); }}
          placeholder="Paste a supported job URL"
          className="h-10 min-w-[260px] flex-1 rounded-md border border-rp-ink/15 bg-rp-paper px-3 text-[13px]"
        />
        <PrimaryButton onClick={() => void paste()} disabled={busy || !pasteUrl.trim()}>{busy ? "Queuing…" : "Apply this URL"}</PrimaryButton>
        <PrimaryButton
          disabled={busy || topEligible.length === 0}
          onClick={() => void enqueue(topEligible.map((row) => row.evaluation.id))}
        >
          <Send className="h-3.5 w-3.5" /> Apply these matches
        </PrimaryButton>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by role, company, or city"
        className="mb-4 h-10 w-full max-w-md rounded-md border border-rp-ink/15 bg-rp-paper px-3 text-[13px]"
      />

      <Panel>
        {visible.length === 0 ? (
          <EmptyState
            title="No US matches in view"
            body="Upload a resume, refresh later, or paste a Greenhouse / Lever / Ashby / Workday URL."
            action={<PrimaryButton onClick={() => navigate("/resume-builder")}>My resume</PrimaryButton>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-rp-ink/10 text-left text-[11px] uppercase tracking-[0.12em] text-rp-ink-3">
                  <th className="px-4 py-3">Fit</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">ATS</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ job, evaluation }) => {
                  const ats = detectAtsFromUrl(job.apply_url);
                  const score = Math.round(evaluation.fit_score ?? evaluation.score * 20);
                  return (
                    <tr key={job.id} className="border-b border-rp-ink/10 last:border-0">
                      <td className="px-4 py-4 font-mono text-rp-accent-2">{score}%</td>
                      <td className="px-4 py-4">
                        <p className="font-medium">{job.title}</p>
                        <p className="text-[12px] text-rp-ink-2">{job.company.name}</p>
                      </td>
                      <td className="px-4 py-4 text-rp-ink-2">{job.location || "United States"}</td>
                      <td className="px-4 py-4 text-[12px] text-rp-ink-2">{ats.label}{ats.submittable ? "" : " · needs you"}</td>
                      <td className="px-4 py-4 text-right">
                        {drafts[evaluation.id] ? (
                          <button type="button" onClick={() => navigate(`/applications/${drafts[evaluation.id].id}`)} className="text-[12px] text-rp-accent">Watch</button>
                        ) : (
                          <div className="inline-flex gap-2">
                            <button type="button" disabled={passingId === job.id} onClick={() => void passMatch(job.id)} className="text-[12px] text-rp-ink-2">
                              {passingId === job.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Pass"}
                            </button>
                            <button type="button" disabled={busy} onClick={() => void enqueue([evaluation.id])} className="rounded-md bg-primary px-2.5 py-1 text-[12px] text-primary-foreground">Apply</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full border border-rp-ink/15 bg-rp-paper px-5 py-3 shadow-lg">
          <button type="button" onClick={() => void enqueue([...selected])} className={cn("text-[13px] font-medium")}>Apply selected ({selected.size})</button>
        </div>
      )}

      <ApplyProgressModal
        open={modalOpen}
        jobs={applyJobs}
        errors={applyErrors}
        onClose={() => setModalOpen(false)}
        onOpenApplication={(draftId) => { setModalOpen(false); navigate(`/applications/${draftId}`); }}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ExternalLink,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  Loader2,
  Building2,
  MapPin,
  MessageCircle,
  ChevronRight,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  runOnLocalWorker,
  resumeRowToMarkdown,
  waitForJob,
  enqueueJob,
  isJobCancelled,
  type JobStatus,
  type AIJob,
} from "@/lib/mc-ai-jobs";
import AddJobManuallyDialog from "./AddJobManuallyDialog";

// ── Persistence ─────────────────────────────────────────────────────────────
// Discover state lives in sessionStorage so switching apps/tabs/refreshing the
// page doesn't lose the user's search progress. We also persist the in-flight
// mc_ai_jobs row id so we can re-attach to a search that started on the
// previous mount and is still running on the user's Mac mini worker.

interface PersistedDiscover {
  foundJobs: FoundJob[];
  clarification: { questions: string[]; answers: string[] } | null;
  conversation: ClarificationTurn[];
  savedKeys: string[];
  /** mc_ai_jobs.id of the most recent search. Used to re-attach if user
   *  switches away mid-search and comes back. */
  activeJobId: string | null;
  /** Snapshot of the conversation that the activeJobId was launched with ,
   *  needed because Claude's response interpretation depends on history. */
  activeJobHistory: ClarificationTurn[];
}

const stateKey = (sid: string) => `mc:discover-state:${sid}:v1`;

function readPersisted(sid: string): PersistedDiscover | null {
  try {
    const raw = sessionStorage.getItem(stateKey(sid));
    return raw ? (JSON.parse(raw) as PersistedDiscover) : null;
  } catch {
    return null;
  }
}

function writePersisted(sid: string, p: PersistedDiscover) {
  try {
    sessionStorage.setItem(stateKey(sid), JSON.stringify(p));
  } catch {
    // sessionStorage can throw in private mode, non-fatal
  }
}

function clearPersisted(sid: string) {
  try {
    sessionStorage.removeItem(stateKey(sid));
  } catch {
    // non-fatal
  }
}

interface FoundJob {
  title: string;
  company: string;
  location?: string;
  apply_url?: string;
  summary?: string;
  fit_score?: number;
  fit_reason?: string;
}

interface ClarificationTurn {
  questions: string[];
  answers: string[];
}

interface Props {
  sessionId: string;
  session: { master_resume_id: string | null; target_profile: Record<string, unknown> };
}

/**
 * AI-driven job discovery. Standalone, does NOT touch the rest of the
 * site's job-search / matches / scanned_jobs infrastructure. The user's
 * Mac mini worker runs Claude with their master resume + target profile,
 * and Claude either asks clarifying questions or returns a list of jobs.
 */
export default function DiscoverTab({ sessionId, session }: Props) {
  const { toast } = useToast();
  // Read persisted state once on mount. After this the React state is the
  // source of truth and the persistence effect mirrors it back to storage.
  const initial = useRef<PersistedDiscover | null>(readPersisted(sessionId));

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<JobStatus | null>(null);
  const [foundJobs, setFoundJobs] = useState<FoundJob[]>(initial.current?.foundJobs ?? []);
  const [clarification, setClarification] = useState<{ questions: string[]; answers: string[] } | null>(
    initial.current?.clarification ?? null,
  );
  const [conversation, setConversation] = useState<ClarificationTurn[]>(
    initial.current?.conversation ?? [],
  );
  const [savedTitles, setSavedTitles] = useState<Set<string>>(
    new Set(initial.current?.savedKeys ?? []),
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(
    initial.current?.activeJobId ?? null,
  );
  const [activeJobHistory, setActiveJobHistory] = useState<ClarificationTurn[]>(
    initial.current?.activeJobHistory ?? [],
  );
  const [tailoringKey, setTailoringKey] = useState<string | null>(null);
  const [tailoringStatus, setTailoringStatus] = useState<JobStatus | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Ties every waitForJob/runOnLocalWorker call below to this component
  // instance's lifetime, so a tab switch that unmounts DiscoverTab (Radix
  // Tabs unmounts inactive content) tears down the realtime subscription
  // and poll interval instead of leaking them until the AI job times out.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  // Mirror state to sessionStorage on every change.
  useEffect(() => {
    writePersisted(sessionId, {
      foundJobs,
      clarification,
      conversation,
      savedKeys: Array.from(savedTitles),
      activeJobId,
      activeJobHistory,
    });
  }, [sessionId, foundJobs, clarification, conversation, savedTitles, activeJobId, activeJobHistory]);

  // Auto-reattach to an in-flight search on mount. If the user clicked
  // "Find jobs with AI" and switched apps/tabs/refreshed before the worker
  // finished, this effect picks back up where they left off.
  const reattachedRef = useRef(false);
  useEffect(() => {
    if (reattachedRef.current) return;
    if (!activeJobId) return;
    // If we already have results loaded for this jobId, no need to reattach.
    if (foundJobs.length > 0 || clarification) {
      reattachedRef.current = true;
      return;
    }
    reattachedRef.current = true;

    let cancelled = false;
    (async () => {
      setBusy(true);
      setProgress("running");
      try {
        const job: AIJob = await waitForJob(activeJobId, {
          timeoutMs: 5 * 60 * 1000,
          onProgress: (s) => {
            if (!cancelled) setProgress(s);
          },
          signal: abortRef.current?.signal,
        });
        if (cancelled) return;
        await handleSearchResult(job, activeJobHistory);
      } catch (e) {
        if (cancelled) return;
        // Job is gone or timed out, clear so the user can re-trigger.
        setActiveJobId(null);
        setActiveJobHistory([]);
        // Don't toast on transient mount-time failures; the user might not
        // have triggered this run themselves (page was just rehydrated).

        console.warn("[Discover] couldn't reattach to previous search:", e);
      } finally {
        if (!cancelled) {
          setBusy(false);
          setProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per mount with the persisted activeJobId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tp = (session.target_profile ?? {}) as Record<string, unknown>;
  const targetRoles = (tp.target_roles as string[]) ?? [];
  const targetLocations = (tp.target_locations as string[]) ?? [];
  const remoteOnly = !!tp.remote_only;
  const compTarget = (tp.comp_target as number | null) ?? null;
  const visa = (tp.visa_status as string) ?? "";

  /**
   * Loads the candidate's master resume, falling back to most-recent if the
   * session hasn't pinned one. Returns markdown the prompt can drop in.
   */
  async function loadResumeMd(): Promise<string> {
    if (session.master_resume_id) {
      const { data } = await (supabase as any)
        .from("resumes")
        .select("*")
        .eq("id", session.master_resume_id)
        .maybeSingle();
      if (data) return resumeRowToMarkdown(data);
    }
    const { data: latest } = await (supabase as any)
      .from("resumes")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = (latest ?? [])[0];
    return row ? resumeRowToMarkdown(row) : "";
  }

  function buildPrompt(resumeMd: string, history: ClarificationTurn[]): string {
    const targetBlock = [
      targetRoles.length ? `- Target roles: ${targetRoles.join(", ")}` : "",
      targetLocations.length ? `- Target locations: ${targetLocations.join(", ")}` : "",
      `- Remote only: ${remoteOnly ? "yes" : "no"}`,
      compTarget ? `- Target total comp: $${compTarget.toLocaleString()}` : "",
      visa ? `- Work authorization: ${visa}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const historyBlock =
      history.length === 0
        ? ""
        : "\n────── PRIOR CLARIFICATIONS ──────\n" +
          history
            .map((t, i) => {
              const qa = t.questions
                .map((q, idx) => `Q${idx + 1}: ${q}\nA${idx + 1}: ${t.answers[idx] || "(no answer)"}`)
                .join("\n");
              return `Turn ${i + 1}:\n${qa}`;
            })
            .join("\n\n") +
          "\n────────────────────────────────\n";

    return [
      "You are an autonomous job-search orchestrator. The user is running you with --dangerously-skip-permissions, which means you have FULL access to Bash, WebFetch, WebSearch, and Task. Use them. Do NOT respond with 'I cannot fetch live job postings', you can.",
      "",
      "Your ENTIRE FINAL response must be a single JSON object inside a ```json fenced block. No prose, no preamble, no explanation outside the fence.",
      "",
      "── HOW TO ACTUALLY FIND JOBS ──",
      "Try these in order. Do NOT stop at the first one that fails, fall through.",
      "",
      "1. **Apify (PRIMARY, use FIRST if available)**. Check whether $APIFY_TOKEN is set in your environment via `bash: echo $APIFY_TOKEN | head -c 8`. If it is, you have a full job-scraping pipeline at your fingertips. Use these actors:",
      "   • LinkedIn jobs:  POST https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/run-sync-get-dataset-items?token=$APIFY_TOKEN",
      "       body: {\"queries\":[\"data scientist remote\"], \"location\":\"United States\", \"limit\":50, \"posted_at\":\"week\"}",
      "   • Indeed:          POST https://api.apify.com/v2/acts/bebity~indeed-scraper/run-sync-get-dataset-items?token=$APIFY_TOKEN",
      "       body: {\"position\":\"data scientist\", \"country\":\"us\", \"location\":\"Remote\", \"maxItems\":50}",
      "   • Glassdoor:       POST https://api.apify.com/v2/acts/thomasdivert~glassdoor-jobs/run-sync-get-dataset-items?token=$APIFY_TOKEN",
      "       body: {\"keyword\":\"data scientist\", \"location\":\"United States\", \"maxItems\":30}",
      "   Each query returns rich JSON with title, company, location, salary, description, application URL. The actor's own search handles relevance, much better than WebSearch.",
      "",
      "2. **WebSearch** for each target role if Apify isn't available (e.g. 'data scientist remote 2026', 'senior ML engineer remote'). Filter to recent results (last 7-30 days).",
      "",
      "3. **WebFetch** on the URLs from #2. Extract title, company, location, salary, JD text, application link.",
      "",
      "4. **Bash + curl against ATS APIs** (no auth needed for public boards) as a third fallback:",
      "   • Greenhouse:  curl -s 'https://boards-api.greenhouse.io/v1/boards/{company-slug}/jobs?content=true'",
      "   • Lever:       curl -s 'https://api.lever.co/v0/postings/{company-slug}?mode=json'",
      "   • Ashby:       curl -s 'https://api.ashbyhq.com/posting-api/job-board/{company-slug}'",
      "   Try a list of well-known companies that hire for the user's target roles (Stripe, Datadog, Anthropic, OpenAI, Cohere, Hugging Face, Scale AI, Anduril, Plaid, Notion, etc.), pick 8-15 relevant to the user's roles.",
      "",
      "5. **Parallelize with Task**, spawn one Haiku sub-agent per source. They each do their own curl/WebFetch and return a small JSON list. You aggregate.",
      "",
      "── DELEGATE PARALLEL WORK TO HAIKU ──",
      "You're Sonnet 4.6 (expensive). For each parallelizable subtask, call Task with subagent_type='general-purpose'. The sub-agent inherits cheap default models. Examples:",
      "  • One sub-agent per ATS+company combo to fetch and parse",
      "  • One sub-agent per posting to compute fit_score against the candidate",
      "  • One sub-agent to deduplicate the aggregate list",
      "Aggregate at the end. Don't sequentially curl 15 companies yourself, fan out.",
      "",
      "── ANTI-FABRICATION ──",
      "NEVER invent companies, URLs, titles, or postings. Every entry in your final JSON must be backed by a real fetch you (or a sub-agent) did in this session. Drop any posting whose URL you couldn't reach.",
      "",
      "── ONLY ASK FOR CLARIFICATION IF YOU GENUINELY CAN'T PROCEED ──",
      "Only return needs_clarification if (a) target_roles is missing/ambiguous AND (b) you cannot guess from the resume. Do NOT ask about salary specifics or industries, score those silently using the data you have.",
      "",
      "────── CANDIDATE RESUME ──────",
      resumeMd || "(no resume on file, use the targets only)",
      "",
      "────── TARGETS ──────",
      targetBlock || "(no targets specified)",
      historyBlock,
      "────── OUTPUT FORMAT (choose ONE of these two shapes) ──────",
      "",
      "Shape A, only if you truly cannot proceed (max 2 short questions):",
      "```json",
      `{"needs_clarification": true, "questions": ["...", "..."]}`,
      "```",
      "",
      "Shape B, the expected case:",
      "```json",
      `{"jobs":[{"title":"...","company":"...","location":"...","apply_url":"https://...","summary":"...","fit_score":1,"fit_reason":"..."}]}`,
      "```",
      "",
      "Rules:",
      "- fit_score: 1=stretch, 2=good fit, 3=strong fit. Be honest.",
      "- Return 10–25 jobs in shape B. If you can only verify fewer, return what you have but at least 5.",
      "- ONE JSON OBJECT, ONE ```json FENCE. Nothing else.",
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  /**
   * Common processing for an AIJob row that finished. Used by both runSearch
   * (when we explicitly start a search) and the auto-reattach effect on
   * mount (when we picked up an in-flight search the user started before).
   */
  async function handleSearchResult(job: AIJob, history: ClarificationTurn[]) {
    const result = job.result ?? "";
    const resultJson = job.result_json;

    let parsed: Record<string, unknown> | null =
      resultJson && typeof resultJson === "object" ? (resultJson as Record<string, unknown>) : null;

    if (!parsed && result) {
      const fence = result.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
      if (fence) {
        try { parsed = JSON.parse(fence[1].trim()); } catch { /* Try the broader object match below. */ }
      }
    }
    if (!parsed && result) {
      const objMatch = result.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]); } catch { /* A user-safe parse error is handled below. */ }
      }
    }

    if (!parsed) {
      const preview = result.slice(0, 280).trim();
      toast({
        title: "AI didn't return valid JSON",
        description: preview
          ? `Claude said: "${preview}${result.length > 280 ? "…" : ""}". Click Search again or rephrase your targets in Settings.`
          : "Empty response. Click Search again.",
        variant: "destructive",
      });
      // Job consumed, clear activeJobId
      setActiveJobId(null);
      setActiveJobHistory([]);
      return;
    }

    if (parsed.needs_clarification && Array.isArray(parsed.questions)) {
      const qs = (parsed.questions as unknown[]).map(String).slice(0, 5);
      setClarification({ questions: qs, answers: qs.map(() => "") });
      setActiveJobId(null);
      setActiveJobHistory([]);
      toast({
        title: "AI needs a bit more info",
        description: `${qs.length} quick question${qs.length === 1 ? "" : "s"} below.`,
      });
      return;
    }

    if (Array.isArray(parsed.jobs)) {
      const jobs = (parsed.jobs as Record<string, unknown>[])
        .map((j) => ({
          title: String(j.title ?? "").trim(),
          company: String(j.company ?? "").trim(),
          location: j.location ? String(j.location) : undefined,
          apply_url: j.apply_url ? String(j.apply_url) : undefined,
          summary: j.summary ? String(j.summary) : undefined,
          fit_score: typeof j.fit_score === "number" ? j.fit_score : undefined,
          fit_reason: j.fit_reason ? String(j.fit_reason) : undefined,
        }))
        .filter((j) => j.title && j.company);

      setFoundJobs(jobs);
      setClarification(null);
      setActiveJobId(null);
      setActiveJobHistory([]);
      toast({
        title: jobs.length === 0 ? "No matches found" : `Found ${jobs.length} jobs`,
        description:
          jobs.length === 0
            ? "Try widening your target roles in Settings, or ask for jobs more directly."
            : "Click Tailor to job on any result to save it and create a tailored copy.",
      });
      return;
    }

    setActiveJobId(null);
    setActiveJobHistory([]);
    toast({
      title: "Unexpected AI response",
      description: "The AI didn't return jobs or clarification questions. Try again.",
      variant: "destructive",
    });
    // Suppress unused-history warning, kept in signature for future use.
    void history;
  }

  async function runSearch(history: ClarificationTurn[]) {
    setBusy(true);
    setProgress("queued");
    setFoundJobs([]);
    setClarification(null);

    try {
      const resumeMd = await loadResumeMd();
      if (!resumeMd) {
        toast({
          title: "Create a resume first",
          description:
            "The AI needs a resume to base the search on. Open Resume Builder, save one, and try again.",
          variant: "destructive",
        });
        return;
      }

      const prompt = buildPrompt(resumeMd, history);

      // Enqueue the job and persist its id immediately so a tab-switch
      // before the worker finishes still lets us re-attach on next mount.
      const enq = await enqueueJob({
        kind: "other",
        sessionId,
        prompt,
        model: "sonnet-4-6",
        input: { feature: "find_jobs", history },
      });
      setActiveJobId(enq.jobId);
      setActiveJobHistory(history);

      const finished = await waitForJob(enq.jobId, {
        timeoutMs: 6 * 60 * 1000,
        onProgress: (s) => setProgress(s),
        signal: abortRef.current?.signal,
      });
      await handleSearchResult(finished, history);
    } catch (e) {
      // The user switched away mid-search (waitForJob was aborted on
      // unmount), not a real failure, so stay silent rather than toast.
      if (isJobCancelled(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Search failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function submitAnswers() {
    if (!clarification) return;
    if (clarification.answers.some((a) => !a.trim())) {
      toast({ title: "Please answer all the questions before continuing" });
      return;
    }
    const turn: ClarificationTurn = {
      questions: clarification.questions,
      answers: clarification.answers.map((a) => a.trim()),
    };
    const newHistory = [...conversation, turn];
    setConversation(newHistory);
    setClarification(null);
    await runSearch(newHistory);
  }

  async function saveToBoard(job: FoundJob) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }

    // `savedTitles` is only an in-memory/sessionStorage hint (cleared on
    // reset(), a new search, or a cleared tab), so it can't be trusted alone
    // to prevent duplicate board cards. Check the DB directly before inserting.
    const { data: existing } = await (supabase as any)
      .from("mc_tracked_jobs")
      .select("id")
      .eq("session_id", sessionId)
      .eq("company", job.company)
      .eq("job_title", job.title)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      setSavedTitles((s) => new Set(s).add(`${job.company}::${job.title}`));
      toast({ title: "Already on board", description: `${job.company} · ${job.title}` });
      return;
    }

    const { error } = await (supabase as any).from("mc_tracked_jobs").insert({
      user_id: userData.user.id,
      session_id: sessionId,
      scanned_job_id: null,
      job_title: job.title,
      company: job.company,
      location: job.location ?? null,
      apply_url: job.apply_url ?? null,
      jd_md: job.summary ?? null,
      status: "saved",
    });
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    setSavedTitles((s) => new Set(s).add(`${job.company}::${job.title}`));
    toast({ title: "Saved to board", description: `${job.company} · ${job.title}` });
  }

  /**
   * One-click "Tailor with AI" straight from a Discover result.
   * Saves the card to the Board (so the tailored resume can be linked to it)
   * and then runs the same tailor pipeline BoardTab uses, but pulling the
   * master resume directly from session settings.
   */
  async function tailorFromDiscover(job: FoundJob) {
    const key = `${job.company}::${job.title}`;
    if (!job.summary || !job.summary.trim()) {
      toast({
        title: "AI didn't return a job description",
        description: "Open the application link, copy the JD, and use Add manually instead.",
        variant: "destructive",
      });
      return;
    }

    const masterMd = await loadResumeMd();
    if (!masterMd) {
      toast({
        title: "Create a resume first",
        description: "The AI tailor needs a base resume. Open Resume Builder, save one, then try again.",
        variant: "destructive",
      });
      return;
    }

    setTailoringKey(key);
    setTailoringStatus("queued");

    try {
      // 1. Save the discovered job to mc_tracked_jobs so we can link the tailored resume.
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        toast({ title: "Not signed in", variant: "destructive" });
        return;
      }
      let trackedJobId: string | null = null;
      if (savedTitles.has(key)) {
        // Already saved, find the existing row.
        const { data: existing } = await (supabase as any)
          .from("mc_tracked_jobs")
          .select("id")
          .eq("session_id", sessionId)
          .eq("company", job.company)
          .eq("job_title", job.title)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        trackedJobId = existing?.id ?? null;
      }
      if (!trackedJobId) {
        const { data: tracked, error: trackErr } = await (supabase as any)
          .from("mc_tracked_jobs")
          .insert({
            user_id: userData.user.id,
            session_id: sessionId,
            scanned_job_id: null,
            job_title: job.title,
            company: job.company,
            location: job.location ?? null,
            apply_url: job.apply_url ?? null,
            jd_md: job.summary,
            status: "saved",
          })
          .select("id")
          .single();
        if (trackErr || !tracked) {
          throw new Error(trackErr?.message || "Couldn't save card before tailoring");
        }
        trackedJobId = tracked.id;
        setSavedTitles((s) => new Set(s).add(key));
      }

      // 2. Build the tailor prompt, same anti-fabrication rules as BoardTab.
      const prompt = [
        "You are an expert resume tailor. Rewrite the candidate's resume below to maximize fit for the target job, ATS-aligned.",
        "STRICT RULES:",
        "- Do NOT invent any companies, employers, dates, metrics, certifications, or skills the candidate doesn't have.",
        "- Keep all original employment dates and titles unchanged.",
        "- Pull keywords from the JD into the resume's bullet points only where the candidate's experience genuinely supports them.",
        "- Output ONLY the tailored resume in markdown. No commentary before or after.",
        "",
        "──────── TARGET JOB ────────",
        `Company: ${job.company}`,
        `Title: ${job.title}`,
        job.location ? `Location: ${job.location}` : "",
        "",
        "Job description:",
        job.summary,
        "",
        "──────── CANDIDATE'S MASTER RESUME ────────",
        masterMd,
        "",
        "Tailored resume in markdown:",
      ]
        .filter(Boolean)
        .join("\n");

      const { result } = await runOnLocalWorker({
        kind: "tailor",
        sessionId,
        prompt,
        model: "sonnet-4-6",
        input: { tracked_job_id: trackedJobId, company: job.company, job_title: job.title },
        timeoutMs: 6 * 60 * 1000,
        onProgress: (s) => setTailoringStatus(s),
        signal: abortRef.current?.signal,
      });

      // 3. Save tailored resume + link it to the tracked job.
      const { data: tailored, error: insertErr } = await (supabase as any)
        .from("mc_tailored_resumes")
        .insert({
          user_id: userData.user.id,
          session_id: sessionId,
          source_job_id: null,
          name: `${job.company}, ${job.title}`,
          cv_md: result,
        })
        .select("id")
        .single();
      if (insertErr || !tailored) {
        throw new Error(insertErr?.message || "Couldn't save tailored resume");
      }

      const { error: linkErr } = await (supabase as any)
        .from("mc_tracked_jobs")
        .update({ tailored_resume_id: tailored.id })
        .eq("id", trackedJobId);
      if (linkErr) {

        console.error("Couldn't link tailored resume to card:", linkErr.message);
      }

      toast({
        title: "Tailored resume ready",
        description: `${job.company} · ${job.title}, see the Resumes tab.`,
      });
    } catch (e) {
      // The user switched away mid-tailor (runOnLocalWorker was aborted on
      // unmount), not a real failure, so stay silent rather than toast.
      if (isJobCancelled(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Tailor failed", description: msg, variant: "destructive" });
    } finally {
      setTailoringKey(null);
      setTailoringStatus(null);
    }
  }

  function reset() {
    setFoundJobs([]);
    setClarification(null);
    setConversation([]);
    setSavedTitles(new Set());
    setActiveJobId(null);
    setActiveJobHistory([]);
    clearPersisted(sessionId);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // Chat-style state header (shows the conversation so far)
  const headerSection = (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex flex-wrap items-center gap-1">
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
      <div className="flex items-center gap-2">
        {(foundJobs.length > 0 || conversation.length > 0) && (
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Start over
          </Button>
        )}
        <Button size="sm" onClick={() => runSearch(conversation)} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              {progress === "queued" ? "Queued on your Mac…" : progress === "running" ? "AI is searching…" : "Working…"}
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              {foundJobs.length > 0 || conversation.length > 0 ? "Search again" : "Find matching jobs"}
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // Conversation history (collapsed by default, just shows count)
  const historySection =
    conversation.length === 0 ? null : (
      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2 border">
        <span className="flex items-center gap-1">
          <MessageCircle className="w-3 h-3" />
          AI asked {conversation.reduce((n, t) => n + t.questions.length, 0)} clarifying question
          {conversation.reduce((n, t) => n + t.questions.length, 0) === 1 ? "" : "s"} so far ·{" "}
          {conversation.length} turn{conversation.length === 1 ? "" : "s"}.
        </span>
      </div>
    );

  // Clarification card
  const clarificationCard = !clarification ? null : (
    <Card className="p-4 border-primary/40 bg-primary/5">
      <div className="flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="font-medium text-sm">AI needs a bit more info</h4>
            <p className="text-xs text-muted-foreground">
              Answer below and ResumePreps will continue searching with your context.
            </p>
          </div>
          {clarification.questions.map((q, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-[12px] font-medium leading-snug">
                <span className="opacity-60 mr-1">Q{idx + 1}.</span>
                {q}
              </div>
              <Textarea
                value={clarification.answers[idx]}
                onChange={(e) => {
                  const next = [...clarification.answers];
                  next[idx] = e.target.value;
                  setClarification({ ...clarification, answers: next });
                }}
                rows={2}
                placeholder="Type your answer…"
                className="text-[12px]"
                disabled={busy}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={submitAnswers} disabled={busy}>
              <ChevronRight className="w-3.5 h-3.5 mr-1" /> Continue searching
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setClarification(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );

  // Empty state (no search yet, no clarification, no results)
  const emptyState =
    foundJobs.length === 0 && !clarification && !busy ? (
      <Card className="p-8 text-center border-dashed">
        <Sparkles className="w-6 h-6 mx-auto text-primary mb-2 opacity-70" />
        <p className="text-sm font-medium mb-1">Let the AI find jobs for you</p>
        <p className="text-xs text-muted-foreground mb-5 max-w-md mx-auto">
          The AI reads your master resume and your targets, then searches the web for openings that
          fit. Takes about 30–90 seconds the first time. If anything's unclear it'll ask you a quick
          question or two first.
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button onClick={() => runSearch([])} disabled={busy}>
              <Sparkles className="w-4 h-4 mr-1" /> Find matching jobs
          </Button>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add manually
          </Button>
        </div>
      </Card>
    ) : null;

  // Results list
  const resultsList =
    foundJobs.length === 0 ? null : (
      <div className="space-y-2">
        {foundJobs.map((job, idx) => {
          const key = `${job.company}::${job.title}`;
          const isSaved = savedTitles.has(key);
          return (
            <Card key={`${key}::${idx}`} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h4 className="font-medium text-[14px] leading-snug">{job.title}</h4>
                    {typeof job.fit_score === "number" && <FitBadge score={job.fit_score} />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {job.company}
                    </span>
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {job.location}
                      </span>
                    )}
                  </div>
                  {job.summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{job.summary}</p>
                  )}
                  {job.fit_reason && (
                    <p className="text-[11px] text-muted-foreground mt-2 italic">
                      Why fit: {job.fit_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 min-w-[8rem]">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => tailorFromDiscover(job)}
                    disabled={tailoringKey === key}
                    className="h-7 text-[11px]"
                  >
                    {tailoringKey === key ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        {tailoringStatus === "queued" && "Queued…"}
                        {tailoringStatus === "running" && "Tailoring…"}
                        {tailoringStatus === "done" && "Saving…"}
                        {!tailoringStatus && "Working…"}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1" /> Tailor to job
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant={isSaved ? "outline" : "ghost"}
                    onClick={() => saveToBoard(job)}
                    disabled={isSaved || tailoringKey === key}
                    className="h-7 text-[11px]"
                  >
                    {isSaved ? <BookmarkCheck className="w-3 h-3 mr-1" /> : <Bookmark className="w-3 h-3 mr-1" />}
                    {isSaved ? "Saved" : "Save only"}
                  </Button>
                  {job.apply_url && (
                    <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                      <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3 h-3 mr-1" /> Open
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );

  return (
    <div className="space-y-4">
      {headerSection}
      {historySection}
      {clarificationCard}
      {emptyState}
      {resultsList}

      <AddJobManuallyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sessionId={sessionId}
        onCreated={() => setAddOpen(false)}
      />
    </div>
  );
}

function FitBadge({ score }: { score: number }) {
  const map: Record<number, { label: string; cls: string }> = {
    3: { label: "Strong fit", cls: "bg-green-100 text-green-800 border-green-300" },
    2: { label: "Good fit", cls: "bg-blue-100 text-blue-800 border-blue-300" },
    1: { label: "Stretch", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  };
  const m = map[score] ?? { label: `Fit ${score}`, cls: "bg-rp-paper text-gray-800 border-rp-rule-2" };
  return <Badge className={`text-[10px] border ${m.cls}`}>{m.label}</Badge>;
}

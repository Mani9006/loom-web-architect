import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clipboard,
  Maximize2,
  Minimize2,
  Loader2,
  MousePointerClick,
  RefreshCcw,
  SearchCode,
  Sparkles,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { JobResult } from "./JobSearchPanel";

type ResumeDoc = {
  id: string;
  file_name: string;
};

type ApplyResult = "applied" | "duplicate" | "failed";
type JobApplyStatus = "idle" | "applying" | "applied" | "duplicate" | "failed";

type ApplyStatusEntry = {
  status: JobApplyStatus;
  message?: string;
  updatedAt?: string;
};

type CandidateProfile = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  yearsExperience: string;
  currentTitle: string;
  expectedSalary: string;
  workAuthorization: string;
  noticePeriod: string;
};

type QueueTask = {
  id: string;
  task_type: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  created_at: string;
  updated_at?: string;
  error_message?: string | null;
  payload?: Record<string, unknown> | null;
};

type CloudBrowserPage = {
  id: string;
  url?: string;
  title?: string;
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
};

type CloudBrowserSession = {
  provider: "browserbase";
  sessionId: string;
  status?: string;
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
  wsUrl?: string;
  pages: CloudBrowserPage[];
  createdAt: string;
};

type PendingProfileAction = "apply_selected" | "bulk_apply" | "queue_task" | null;

const EMPTY_PROFILE: CandidateProfile = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedinUrl: "",
  portfolioUrl: "",
  yearsExperience: "",
  currentTitle: "",
  expectedSalary: "",
  workAuthorization: "",
  noticePeriod: "",
};

const REQUIRED_PROFILE_FIELDS: Array<{
  key: keyof CandidateProfile;
  label: string;
  placeholder: string;
  type?: "text" | "email";
}> = [
  { key: "fullName", label: "Full Name", placeholder: "Jane Doe" },
  { key: "email", label: "Email", placeholder: "jane@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+1 555 555 5555" },
  { key: "location", label: "Location", placeholder: "San Francisco, CA" },
  { key: "currentTitle", label: "Current Title", placeholder: "Senior Software Engineer" },
  { key: "yearsExperience", label: "Years of Experience", placeholder: "5" },
];

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toKey(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 220);
}

function domainFromUrl(url?: string): string {
  if (!url) return "manual";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "manual";
  }
}

const IFRAME_BLOCKED_HOST_HINTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "myworkdayjobs.com",
  "workday.com",
  "greenhouse.io",
  "jobs.lever.co",
  "lever.co",
  "teksystems.com",
  "caterpillar.com",
  "roberthalf.com",
  "randstad",
  "edtech.com",
  "dice.com",
  "ziprecruiter.com",
  "monster.com",
  "careerbuilder.com",
  "smartrecruiters.com",
  "icims.com",
  "taleo.net",
  "successfactors.com",
  "brassring.com",
  "ultipro.com",
  "paylocity.com",
  "bamboohr.com",
  "jobvite.com",
  "ashbyhq.com",
  "wellfound.com",
  "angel.co",
  "builtin.com",
  "simplyhired.com",
  "google.com/about/careers",
  "amazon.jobs",
  "apple.com/careers",
  "microsoft.com/en-us/",
  "meta.com/careers",
  "netflix.jobs",
];

function shouldPreferCloudBrowser(url: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return IFRAME_BLOCKED_HOST_HINTS.some((hint) => host.includes(hint));
  } catch {
    return false;
  }
}

function externalJobId(job: JobResult): string {
  const raw = `${job.url || ""}|${job.company}|${job.title}`.toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]+/g, "_").slice(0, 120);
  return cleaned || crypto.randomUUID();
}

function normalizeHttpUrl(raw?: string): string {
  if (!raw) return "";
  const cleaned = raw
    .replace(/&amp;/gi, "&")
    .trim()
    .replace(/^<+|>+$/g, "")
    .replace(/^\(+|\)+$/g, "")
    .replace(/[),.;]+$/g, "");
  if (!/^https?:\/\//i.test(cleaned)) return "";
  try {
    return new URL(cleaned).toString();
  } catch {
    return "";
  }
}

function looksLikelyBrokenUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  if (!normalized.startsWith("http")) return true;
  if (/fake|placeholder|example\.com|undefined|null/.test(normalized)) return true;
  if (normalized.includes("linkedin.com/jobs/view/") && !/linkedin\.com\/jobs\/view\/\d+/.test(normalized)) return true;
  if (normalized.includes("indeed.com/viewjob") && !/[?&]jk=/.test(normalized)) return true;
  return false;
}

function buildLinkedInFallback(job: JobResult): string {
  const query = `${job.title} ${job.company}`.trim();
  const location = (job.location || "United States").trim();
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;
}

function buildReaderUrl(rawUrl: string): string {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) return "";
  const withoutProtocol = normalized.replace(/^https?:\/\//i, "");
  return `https://r.jina.ai/http://${withoutProtocol}`;
}

function extractJsonObject(input: string): Record<string, unknown> {
  const match = input.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return asObject(parsed);
  } catch {
    return {};
  }
}

function pickString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseCandidateProfile(value: unknown): CandidateProfile {
  const obj = asObject(value);
  return {
    fullName: pickString(obj, "fullName"),
    email: pickString(obj, "email"),
    phone: pickString(obj, "phone"),
    location: pickString(obj, "location"),
    linkedinUrl: pickString(obj, "linkedinUrl"),
    portfolioUrl: pickString(obj, "portfolioUrl"),
    yearsExperience: pickString(obj, "yearsExperience"),
    currentTitle: pickString(obj, "currentTitle"),
    expectedSalary: pickString(obj, "expectedSalary"),
    workAuthorization: pickString(obj, "workAuthorization"),
    noticePeriod: pickString(obj, "noticePeriod"),
  };
}

function parseAnswerMemory(value: unknown): Record<string, string> {
  const obj = asObject(value);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseApplyStatusMap(value: unknown): Record<string, ApplyStatusEntry> {
  const obj = asObject(value);
  const out: Record<string, ApplyStatusEntry> = {};

  for (const [k, v] of Object.entries(obj)) {
    const entry = asObject(v);
    const status = String(entry.status || "idle") as JobApplyStatus;
    if (["idle", "applying", "applied", "duplicate", "failed"].includes(status)) {
      out[k] = {
        status,
        message: typeof entry.message === "string" ? entry.message : undefined,
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
      };
    }
  }

  return out;
}

function badgeVariantForStatus(status: JobApplyStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "applied") return "default";
  if (status === "duplicate") return "secondary";
  if (status === "failed") return "destructive";
  return "outline";
}

function statusLabel(status: JobApplyStatus): string {
  if (status === "idle") return "Not applied";
  if (status === "applying") return "Applying...";
  if (status === "applied") return "Applied";
  if (status === "duplicate") return "Already applied";
  return "Failed";
}

interface ApplyPassWorkspaceProps {
  jobs: JobResult[];
  resumeText: string;
  preferredResumeId?: string | null;
}

export default function ApplyPassWorkspace({ jobs, resumeText, preferredResumeId }: ApplyPassWorkspaceProps) {
  const visibleJobs = useMemo(() => jobs.slice(0, 10), [jobs]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(visibleJobs[0]?.id || null);

  const [resumeDocs, setResumeDocs] = useState<ResumeDoc[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [jobPreferences, setJobPreferences] = useState<Record<string, unknown>>({});
  const [loadingPrefs, setLoadingPrefs] = useState(false);

  const [answerMemory, setAnswerMemory] = useState<Record<string, string>>({});
  const [applyStatusMap, setApplyStatusMap] = useState<Record<string, ApplyStatusEntry>>({});
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile>(EMPTY_PROFILE);
  const [briefByJobId, setBriefByJobId] = useState<Record<string, string>>({});

  const [savingAnswer, setSavingAnswer] = useState(false);
  const [generatingAnswer, setGeneratingAnswer] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [agentQueueTasks, setAgentQueueTasks] = useState<QueueTask[]>([]);
  const [loadingQueueTasks, setLoadingQueueTasks] = useState(false);
  const [queueingAgentTask, setQueueingAgentTask] = useState(false);
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);

  const [questionInput, setQuestionInput] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [profilePromptOpen, setProfilePromptOpen] = useState(false);
  const [missingProfileFields, setMissingProfileFields] = useState<Array<keyof CandidateProfile>>([]);
  const [pendingProfileAction, setPendingProfileAction] = useState<PendingProfileAction>(null);
  const [browserPaneState, setBrowserPaneState] = useState<"idle" | "loading" | "loaded" | "timeout">("idle");
  const [browserMode, setBrowserMode] = useState<"primary" | "fallback" | "reader" | "manual" | "cloud">("primary");
  const [manualBrowserUrl, setManualBrowserUrl] = useState("");
  const [browserAddress, setBrowserAddress] = useState("");
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const [browserExpanded, setBrowserExpanded] = useState(true);
  const [cloudBrowserSession, setCloudBrowserSession] = useState<CloudBrowserSession | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  const profileHydratedRef = useRef(false);
  const lastSavedProfileRef = useRef(JSON.stringify(EMPTY_PROFILE));
  const autoCloudForUrlRef = useRef<string>("");
  const handledInvalidJwtRef = useRef(false);
  const lastCloudTargetUrlRef = useRef<string>("");

  useEffect(() => {
    setSelectedJobId((prev) => {
      if (prev && visibleJobs.some((job) => job.id === prev)) return prev;
      return visibleJobs[0]?.id || null;
    });
  }, [visibleJobs]);

  const selectedJob = useMemo(
    () => visibleJobs.find((job) => job.id === selectedJobId) || null,
    [visibleJobs, selectedJobId],
  );

  const selectedBrief = useMemo(() => {
    if (!selectedJob) return "";
    return briefByJobId[selectedJob.id] || "";
  }, [briefByJobId, selectedJob]);

  const selectedJobBrowser = useMemo(() => {
    if (!selectedJob) {
      return {
        url: "",
        fallbackUrl: "",
        usingFallback: false,
        note: "",
      };
    }

    const primary = normalizeHttpUrl(selectedJob.url);
    const fallback = normalizeHttpUrl(selectedJob.fallbackUrl || buildLinkedInFallback(selectedJob));
    const shouldFallback = !primary || looksLikelyBrokenUrl(primary);
    const resolved = shouldFallback ? fallback || primary : primary;

    return {
      url: resolved || "",
      fallbackUrl: fallback || "",
      usingFallback: shouldFallback && Boolean(fallback && fallback !== primary),
      note: shouldFallback
        ? "Using a safer search URL because the direct job link appears missing or expired."
        : "",
    };
  }, [selectedJob]);

  const primaryBrowserUrl = selectedJobBrowser.url || "";
  const fallbackBrowserUrl = selectedJobBrowser.fallbackUrl || selectedJobBrowser.url || "";
  const readerBrowserUrl = useMemo(() => buildReaderUrl(primaryBrowserUrl), [primaryBrowserUrl]);
  const cloudBrowserUrl =
    cloudBrowserSession?.debuggerFullscreenUrl ||
    cloudBrowserSession?.pages?.[0]?.debuggerFullscreenUrl ||
    cloudBrowserSession?.debuggerUrl ||
    "";

  const primaryUrlIsBlocked = useMemo(
    () => shouldPreferCloudBrowser(primaryBrowserUrl),
    [primaryBrowserUrl],
  );

  const activeBrowserUrl = useMemo(() => {
    if (browserMode === "cloud") return cloudBrowserUrl;
    if (browserMode === "manual") return manualBrowserUrl;
    if (browserMode === "reader") return readerBrowserUrl;
    if (browserMode === "fallback") return fallbackBrowserUrl;
    return primaryBrowserUrl;
  }, [browserMode, cloudBrowserUrl, manualBrowserUrl, readerBrowserUrl, fallbackBrowserUrl, primaryBrowserUrl]);

  const requiredMissingFields = useMemo(() => {
    return REQUIRED_PROFILE_FIELDS
      .map((field) => field.key)
      .filter((key) => !String(candidateProfile[key] || "").trim());
  }, [candidateProfile]);

  const statusCounts = useMemo(() => {
    let applied = 0;
    let duplicate = 0;
    let failed = 0;

    for (const job of visibleJobs) {
      const status = applyStatusMap[job.id]?.status || "idle";
      if (status === "applied") applied += 1;
      else if (status === "duplicate") duplicate += 1;
      else if (status === "failed") failed += 1;
    }

    return { applied, duplicate, failed };
  }, [applyStatusMap, visibleJobs]);

  useEffect(() => {
    const key = toKey(questionInput);
    if (key && answerMemory[key]) {
      setAnswerDraft(answerMemory[key]);
    }
  }, [questionInput, answerMemory]);

  useEffect(() => {
    if (!activeBrowserUrl) {
      setBrowserPaneState("idle");
      return;
    }

    setBrowserPaneState("loading");
    // Reduced from 12s to 6s — most legit sites load within 3-4s;
    // sites that block iframes show "refused to connect" immediately but
    // the onLoad event still fires, so we need a tighter fallback window.
    const timeoutId = window.setTimeout(() => {
      setBrowserPaneState((prev) => (prev === "loading" ? "timeout" : prev));
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [activeBrowserUrl, browserRefreshKey]);

  useEffect(() => {
    if (browserMode !== "cloud") {
      setBrowserMode("primary");
      setManualBrowserUrl("");
    }
  }, [selectedJobId, browserMode]);

  // Auto-switch to cloud mode when a cloud session already exists and the
  // primary URL is blocklisted. We no longer auto-*create* cloud sessions
  // for blocklisted URLs — the UI shows action buttons instead.
  useEffect(() => {
    if (browserMode !== "primary") return;
    if (!primaryBrowserUrl) return;
    if (!shouldPreferCloudBrowser(primaryBrowserUrl)) return;
    if (!cloudBrowserSession?.sessionId) return;
    setBrowserMode("cloud");
  }, [browserMode, primaryBrowserUrl, cloudBrowserSession?.sessionId]);

  // When a non-blocked iframe times out and a cloud session exists, auto-switch.
  useEffect(() => {
    if (browserPaneState !== "timeout") return;
    if (browserMode !== "primary") return;
    if (cloudBrowserSession?.sessionId) {
      setBrowserMode("cloud");
    }
  }, [browserPaneState, browserMode, cloudBrowserSession?.sessionId]);

  useEffect(() => {
    setBrowserAddress(activeBrowserUrl);
  }, [activeBrowserUrl]);

  useEffect(() => {
    void loadWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (preferredResumeId && resumeDocs.some((doc) => doc.id === preferredResumeId)) {
      setSelectedResumeId(preferredResumeId);
    }
  }, [preferredResumeId, resumeDocs]);

  useEffect(() => {
    if (!profileHydratedRef.current) return;

    const serialized = JSON.stringify(candidateProfile);
    if (serialized === lastSavedProfileRef.current) return;

    const timeoutId = window.setTimeout(async () => {
      try {
        await persistApplypassState({ profile: candidateProfile });
        lastSavedProfileRef.current = serialized;
      } catch {
        // Non-blocking autosave.
      }
    }, 900);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateProfile]);

  async function loadWorkspaceData() {
    setLoadingDocs(true);
    setLoadingPrefs(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [docsRes, profileRes] = await Promise.all([
        supabase
          .from("user_documents")
          .select("id,file_name,created_at")
          .eq("user_id", user.id)
          .eq("category", "resume")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("profiles")
          .select("email,full_name,job_preferences")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (docsRes.error) {
        toast.error(`Failed to load resume documents: ${docsRes.error.message}`);
      } else {
        const docs = (docsRes.data || []).map((doc) => ({ id: doc.id, file_name: doc.file_name }));
        setResumeDocs(docs);
        if (preferredResumeId && docs.some((doc) => doc.id === preferredResumeId)) {
          setSelectedResumeId(preferredResumeId);
        } else if (docs.length > 0) {
          setSelectedResumeId(docs[0].id);
        }
      }

      if (profileRes.error) {
        toast.error(`Failed to load ApplyPass profile: ${profileRes.error.message}`);
      } else {
        const profileData = asObject(profileRes.data);
        const basePrefs = asObject(profileData.job_preferences);
        const applypass = asObject(basePrefs.applypass);

        setJobPreferences(basePrefs);
        setAnswerMemory(parseAnswerMemory(applypass.answers));
        setApplyStatusMap(parseApplyStatusMap(applypass.applyStatus));
        setBriefByJobId(parseAnswerMemory(applypass.jobBriefs));

        const storedProfile = parseCandidateProfile(applypass.profile);
        const nextProfile: CandidateProfile = {
          ...EMPTY_PROFILE,
          fullName:
            storedProfile.fullName ||
            (typeof profileData.full_name === "string" ? profileData.full_name : "") ||
            "",
          email:
            storedProfile.email ||
            (typeof profileData.email === "string" ? profileData.email : "") ||
            "",
          phone: storedProfile.phone,
          location: storedProfile.location,
          currentTitle: storedProfile.currentTitle,
          linkedinUrl: storedProfile.linkedinUrl,
          portfolioUrl: storedProfile.portfolioUrl,
          yearsExperience: storedProfile.yearsExperience,
          expectedSalary: storedProfile.expectedSalary,
          workAuthorization: storedProfile.workAuthorization,
          noticePeriod: storedProfile.noticePeriod,
        };
        setCandidateProfile(nextProfile);
        lastSavedProfileRef.current = JSON.stringify(nextProfile);
      }

      profileHydratedRef.current = true;

      await refreshQueueTasks();
    } finally {
      setLoadingDocs(false);
      setLoadingPrefs(false);
    }
  }

  async function getFunctionAccessToken(): Promise<string> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const verified = await supabase.auth.getUser();
      if (!verified.error && verified.data.user) {
        return session.access_token;
      }
    }

    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token) {
      throw new Error("Your session has expired. Please sign out and sign in again.");
    }

    const verified = await supabase.auth.getUser();
    if (verified.error || !verified.data.user) {
      throw new Error("Your session has expired. Please sign out and sign in again.");
    }
    return refreshed.data.session.access_token;
  }

  async function functionFetchWithJwtRetry(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<Response> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error("Supabase URL env var is missing.");
    }

    const doFetch = async (accessToken: string) =>
      await fetch(`${supabaseUrl}/functions/v1/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

    let accessToken = await getFunctionAccessToken();
    let response = await doFetch(accessToken);
    let lastBody = response.status === 401 ? await response.clone().text() : "";

    if (response.status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session?.access_token) {
        accessToken = refreshed.data.session.access_token;
        response = await doFetch(accessToken);
        lastBody = response.status === 401 ? await response.clone().text() : "";
      }
    }

    if (response.status === 401) {
      const verified = await supabase.auth.getUser();
      if (!verified.error && verified.data.user) {
        const {
          data: { session: latestSession },
        } = await supabase.auth.getSession();
        if (latestSession?.access_token) {
          accessToken = latestSession.access_token;
          response = await doFetch(accessToken);
          lastBody = response.status === 401 ? await response.clone().text() : "";
        }
      }
    }

    if (response.status === 401 && /invalid jwt/i.test(lastBody)) {
      const {
        data: { session: latestSession },
      } = await supabase.auth.getSession();

      const verified = await supabase.auth.getUser();
      if (!latestSession?.access_token || verified.error || !verified.data.user) {
        if (!handledInvalidJwtRef.current) {
          handledInvalidJwtRef.current = true;
          await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          window.location.assign("/auth?reason=session_expired");
        }
        throw new Error("Session expired. Please sign in again.");
      }
    }

    return response;
  }

  async function streamAiResponse(prompt: string): Promise<string> {
    const response = await functionFetchWithJwtRetry("ai-orchestrator", {
      mode: "general",
      agentHint: "general",
      messages: [{ role: "user", content: prompt }],
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI request failed (${response.status}): ${body}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          full += parsed.choices?.[0]?.delta?.content || "";
        } catch {
          // Ignore malformed stream chunks.
        }
      }
    }

    return full.trim();
  }

  async function callApplypassQueue(payload: Record<string, unknown>) {
    const response = await functionFetchWithJwtRetry("applypass-agent-queue", payload);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Queue API failed (${response.status}): ${body}`);
    }

    return (await response.json()) as { ok: boolean; tasks?: QueueTask[]; task?: QueueTask };
  }

  async function callApplypassBrowserSession(payload: Record<string, unknown>) {
    const response = await functionFetchWithJwtRetry("applypass-browser-session", payload);

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        (typeof data.error === "string" && data.error) ||
        (typeof data.message === "string" && data.message) ||
        (typeof data.code === "string" && data.code) ||
        `Cloud browser API failed (${response.status})`;
      throw new Error(String(message));
    }
    return data;
  }

  function parseCloudSession(value: unknown): CloudBrowserSession | null {
    const obj = asObject(value);
    const sessionId = String(obj.sessionId || "").trim();
    if (!sessionId) return null;

    const pagesRaw = Array.isArray(obj.pages) ? obj.pages : [];
    const pages: CloudBrowserPage[] = pagesRaw.map((page) => {
      const p = asObject(page);
      return {
        id: String(p.id || crypto.randomUUID()),
        url: typeof p.url === "string" ? p.url : undefined,
        title: typeof p.title === "string" ? p.title : undefined,
        debuggerUrl: typeof p.debuggerUrl === "string" ? p.debuggerUrl : undefined,
        debuggerFullscreenUrl: typeof p.debuggerFullscreenUrl === "string" ? p.debuggerFullscreenUrl : undefined,
      };
    });

    return {
      provider: "browserbase",
      sessionId,
      status: typeof obj.status === "string" ? obj.status : undefined,
      debuggerUrl: typeof obj.debuggerUrl === "string" ? obj.debuggerUrl : undefined,
      debuggerFullscreenUrl:
        typeof obj.debuggerFullscreenUrl === "string" ? obj.debuggerFullscreenUrl : undefined,
      wsUrl: typeof obj.wsUrl === "string" ? obj.wsUrl : undefined,
      pages,
      createdAt:
        typeof obj.createdAt === "string" && obj.createdAt
          ? obj.createdAt
          : new Date().toISOString(),
    };
  }

  async function refreshCloudBrowserSession() {
    if (!cloudBrowserSession?.sessionId) return;
    setCloudBusy(true);
    try {
      const payload = await callApplypassBrowserSession({
        action: "inspect",
        sessionId: cloudBrowserSession.sessionId,
      });
      const parsed = parseCloudSession(payload.session || payload);
      if (parsed) {
        setCloudBrowserSession(parsed);
        if (browserMode !== "cloud") setBrowserMode("cloud");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh cloud browser session.");
    } finally {
      setCloudBusy(false);
    }
  }

  function resolveTargetUrl(initialUrlOverride?: string): string {
    return (
      normalizeTypedUrl(initialUrlOverride || browserAddress) ||
      selectedJobBrowser.url ||
      selectedJobBrowser.fallbackUrl ||
      "https://www.google.com"
    );
  }

  async function openUrlInCloudSession(
    targetUrl: string,
    options?: { silent?: boolean; force?: boolean },
  ): Promise<boolean> {
    if (!cloudBrowserSession?.sessionId) return false;
    if (!options?.force && targetUrl && lastCloudTargetUrlRef.current === targetUrl) return true;

    setCloudBusy(true);
    try {
      const payload = await callApplypassBrowserSession({
        action: "open-url",
        sessionId: cloudBrowserSession.sessionId,
        url: targetUrl,
      });
      const parsed = parseCloudSession(payload.session || payload);
      if (!parsed) throw new Error("Cloud browser did not return a valid session after navigation.");
      setCloudBrowserSession(parsed);
      lastCloudTargetUrlRef.current = targetUrl;
      setBrowserMode("cloud");
      if (!options?.silent) {
        toast.success("Cloud browser updated to selected job.");
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open URL in cloud browser.");
      return false;
    } finally {
      setCloudBusy(false);
    }
  }

  async function startCloudBrowserSession(initialUrlOverride?: string) {
    const targetUrl = resolveTargetUrl(initialUrlOverride);
    if (cloudBrowserSession?.sessionId) {
      await openUrlInCloudSession(targetUrl, { silent: true, force: true });
      return;
    }

    setCloudBusy(true);
    try {
      const payload = await callApplypassBrowserSession({
        action: "create",
        initialUrl: targetUrl,
        metadata: {
          source: "applypass_workspace",
          selectedJobTitle: selectedJob?.title || null,
          selectedJobCompany: selectedJob?.company || null,
        },
      });
      const parsed = parseCloudSession(payload.session || payload);
      if (!parsed) throw new Error("Cloud browser session was created but no live URL was returned.");
      setCloudBrowserSession(parsed);
      lastCloudTargetUrlRef.current = targetUrl;
      setBrowserMode("cloud");
      toast.success("Cloud browser session started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start cloud browser session.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function stopCloudBrowserSession() {
    if (!cloudBrowserSession?.sessionId) {
      setCloudBrowserSession(null);
      return;
    }
    setCloudBusy(true);
    try {
      await callApplypassBrowserSession({
        action: "close",
        sessionId: cloudBrowserSession.sessionId,
      });
      setCloudBrowserSession(null);
      lastCloudTargetUrlRef.current = "";
      if (browserMode === "cloud") setBrowserMode("primary");
      toast.success("Cloud browser session closed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close cloud browser session.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function persistApplypassState(patch: Record<string, unknown>) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Sign in required.");

    const currentPrefs = asObject(jobPreferences);
    const currentApplypass = asObject(currentPrefs.applypass);

    const nextPrefs: Record<string, unknown> = {
      ...currentPrefs,
      applypass: {
        ...currentApplypass,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    };

    const payload: Database["public"]["Tables"]["profiles"]["Insert"] = {
      user_id: user.id,
      email: user.email ?? null,
      job_preferences: nextPrefs as Database["public"]["Tables"]["profiles"]["Insert"]["job_preferences"],
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw error;

    setJobPreferences(nextPrefs);
  }

  function requireProfileCompletion(action: Exclude<PendingProfileAction, null>): boolean {
    const missing = REQUIRED_PROFILE_FIELDS
      .map((field) => field.key)
      .filter((key) => !String(candidateProfile[key] || "").trim());

    if (missing.length === 0) return false;

    setMissingProfileFields(missing);
    setPendingProfileAction(action);
    setProfilePromptOpen(true);
    toast.message("Complete missing profile fields once. We will save and reuse them automatically.");
    return true;
  }

  async function saveProfile(silent = false): Promise<boolean> {
    setSavingProfile(true);
    try {
      await persistApplypassState({ profile: candidateProfile });
      lastSavedProfileRef.current = JSON.stringify(candidateProfile);
      if (!silent) toast.success("Candidate profile saved.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile.");
      return false;
    } finally {
      setSavingProfile(false);
    }
  }

  async function refreshQueueTasks() {
    setLoadingQueueTasks(true);
    try {
      const response = await callApplypassQueue({ action: "list" });
      setAgentQueueTasks(response.tasks || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load queue tasks.");
    } finally {
      setLoadingQueueTasks(false);
    }
  }

  async function enqueueAgentTask(skipProfileGate = false) {
    if (!skipProfileGate && requireProfileCompletion("queue_task")) {
      return;
    }

    if (!selectedResumeId) {
      toast.error("Select a saved resume document first.");
      return;
    }

    if (visibleJobs.length === 0) {
      toast.error("No jobs available to queue.");
      return;
    }

    setQueueingAgentTask(true);
    try {
      const taskPayloadJobs = visibleJobs.slice(0, 10).map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        description: job.description,
      }));

      const response = await callApplypassQueue({
        action: "enqueue",
        taskType: "bulk_apply",
        jobs: taskPayloadJobs,
        resumeId: selectedResumeId,
        candidateProfile,
        answerMemory,
      });

      const taskId = response.task?.id || "unknown";
      toast.success(`Agent task queued: ${taskId}`);
      await refreshQueueTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue task.");
    } finally {
      setQueueingAgentTask(false);
    }
  }

  async function cancelTask(taskId: string) {
    setCancelingTaskId(taskId);
    try {
      await callApplypassQueue({ action: "cancel", taskId });
      toast.success("Queued task canceled.");
      await refreshQueueTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel task.");
    } finally {
      setCancelingTaskId(null);
    }
  }

  async function handleSaveAnswer() {
    const key = toKey(questionInput);
    if (!key || !answerDraft.trim()) {
      toast.error("Enter a question and answer first.");
      return;
    }

    setSavingAnswer(true);
    try {
      const next = { ...answerMemory, [key]: answerDraft.trim() };
      await persistApplypassState({ answers: next });
      setAnswerMemory(next);
      toast.success("Answer saved for future applications.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save answer.");
    } finally {
      setSavingAnswer(false);
    }
  }

  async function handleAiSuggestAnswer() {
    if (!questionInput.trim()) {
      toast.error("Enter the application question first.");
      return;
    }

    setGeneratingAnswer(true);
    try {
      const prompt = [
        "You are helping a candidate fill a job application form.",
        "Write a concise, direct answer to the question.",
        "If information is missing, make a reasonable assumption and keep it truthful.",
        "Keep it under 120 words unless the question explicitly asks for more.",
        "",
        `Question: ${questionInput.trim()}`,
        `Job Title: ${selectedJob?.title || "N/A"}`,
        `Company: ${selectedJob?.company || "N/A"}`,
        selectedJob?.description ? `Job Context: ${selectedJob.description}` : "",
        `Candidate Profile: ${JSON.stringify(candidateProfile)}`,
        `Candidate Resume Context: ${resumeText.slice(0, 3000) || "Not provided."}`,
      ].filter(Boolean).join("\n");

      const answer = await streamAiResponse(prompt);
      if (!answer) throw new Error("No answer generated.");
      setAnswerDraft(answer);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate AI answer.");
    } finally {
      setGeneratingAnswer(false);
    }
  }

  async function handleGenerateProfileFromResume() {
    if (!resumeText.trim()) {
      toast.error("Upload or paste resume first.");
      return;
    }

    setGeneratingProfile(true);
    try {
      const prompt = [
        "Extract candidate profile data from this resume.",
        "Return strict JSON only.",
        "Use keys: fullName, email, phone, location, currentTitle, yearsExperience, linkedinUrl, portfolioUrl, expectedSalary, workAuthorization, noticePeriod",
        "If unknown, return empty string for that field.",
        "",
        `Resume: ${resumeText.slice(0, 5000)}`,
      ].join("\n");

      const response = await streamAiResponse(prompt);
      const parsed = extractJsonObject(response);
      const nextProfile: CandidateProfile = {
        ...candidateProfile,
        fullName: pickString(parsed, "fullName") || candidateProfile.fullName,
        email: pickString(parsed, "email") || candidateProfile.email,
        phone: pickString(parsed, "phone") || candidateProfile.phone,
        location: pickString(parsed, "location") || candidateProfile.location,
        currentTitle: pickString(parsed, "currentTitle") || candidateProfile.currentTitle,
        yearsExperience: pickString(parsed, "yearsExperience") || candidateProfile.yearsExperience,
        linkedinUrl: pickString(parsed, "linkedinUrl") || candidateProfile.linkedinUrl,
        portfolioUrl: pickString(parsed, "portfolioUrl") || candidateProfile.portfolioUrl,
        expectedSalary: pickString(parsed, "expectedSalary") || candidateProfile.expectedSalary,
        workAuthorization: pickString(parsed, "workAuthorization") || candidateProfile.workAuthorization,
        noticePeriod: pickString(parsed, "noticePeriod") || candidateProfile.noticePeriod,
      };

      setCandidateProfile(nextProfile);
      toast.success("Profile draft generated from resume.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate profile.");
    } finally {
      setGeneratingProfile(false);
    }
  }

  async function handleSaveProfile() {
    await saveProfile();
  }

  async function handleSaveProfileAndContinue() {
    const ok = await saveProfile(true);
    if (!ok) return;

    const action = pendingProfileAction;
    setPendingProfileAction(null);
    setProfilePromptOpen(false);
    setMissingProfileFields([]);
    toast.success("Profile saved. Continuing...");

    if (action === "apply_selected") {
      await handleApplySelected(true);
    } else if (action === "bulk_apply") {
      await handleBulkAutoApply(true);
    } else if (action === "queue_task") {
      await enqueueAgentTask(true);
    }
  }

  function normalizeTypedUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return normalizeHttpUrl(trimmed) || trimmed;
    const candidate = `https://${trimmed}`;
    return normalizeHttpUrl(candidate) || candidate;
  }

  function handleOpenTypedUrl() {
    const next = normalizeTypedUrl(browserAddress);
    if (!next) {
      toast.error("Enter a valid URL.");
      return;
    }
    if (browserMode === "cloud") {
      void (async () => {
        if (cloudBrowserSession?.sessionId) {
          await openUrlInCloudSession(next, { force: true });
          return;
        }
        await startCloudBrowserSession(next);
      })();
      return;
    }
    setBrowserMode("manual");
    setManualBrowserUrl(next);
    setBrowserRefreshKey((prev) => prev + 1);
  }

  function handleResetBrowserTarget() {
    setBrowserMode("primary");
    setManualBrowserUrl("");
    setBrowserRefreshKey((prev) => prev + 1);
  }

  useEffect(() => {
    if (browserMode !== "cloud") return;
    if (!cloudBrowserSession?.sessionId) return;
    if (cloudBusy) return;

    const target = selectedJobBrowser.url || selectedJobBrowser.fallbackUrl || "";
    if (!target) return;
    if (lastCloudTargetUrlRef.current === target) return;

    void openUrlInCloudSession(target, { silent: true });
  }, [
    browserMode,
    cloudBrowserSession?.sessionId,
    cloudBusy,
    selectedJobBrowser.url,
    selectedJobBrowser.fallbackUrl,
    selectedJobId,
  ]);

  async function applyToJob(job: JobResult): Promise<{ result: ApplyResult; message: string }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { result: "failed", message: "Please sign in to apply." };
    }

    if (!selectedResumeId) {
      return { result: "failed", message: "Select a saved resume document first." };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return { result: "failed", message: "Supabase URL is missing." };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/apply-to-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        job_id: externalJobId(job),
        job_title: job.title,
        company: job.company,
        job_board: domainFromUrl(job.url),
        application_url: job.url || null,
        resume_id: selectedResumeId,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.status === 409) {
      return { result: "duplicate", message: payload.message || "Already applied to this job." };
    }
    if (!response.ok) {
      return { result: "failed", message: payload.message || "Failed to submit application." };
    }
    return { result: "applied", message: payload.message || "Application tracked." };
  }

  async function updateJobStatus(job: JobResult, status: JobApplyStatus, message?: string) {
    const nextEntry: ApplyStatusEntry = {
      status,
      message,
      updatedAt: new Date().toISOString(),
    };

    let nextMap: Record<string, ApplyStatusEntry> = {};
    setApplyStatusMap((prev) => {
      nextMap = { ...prev, [job.id]: nextEntry };
      return nextMap;
    });

    try {
      await persistApplypassState({ applyStatus: nextMap });
    } catch {
      // Status persistence is non-blocking.
    }
  }

  async function handleApplySelected(skipProfileGate = false) {
    if (!selectedJob) return;
    if (!skipProfileGate && requireProfileCompletion("apply_selected")) {
      return;
    }

    setApplyingId(selectedJob.id);
    await updateJobStatus(selectedJob, "applying", "Applying...");

    try {
      const { result, message } = await applyToJob(selectedJob);
      if (result === "applied") {
        await updateJobStatus(selectedJob, "applied", message);
        toast.success(message);
      } else if (result === "duplicate") {
        await updateJobStatus(selectedJob, "duplicate", message);
        toast.message(message);
      } else {
        await updateJobStatus(selectedJob, "failed", message);
        toast.error(message);
      }
    } finally {
      setApplyingId(null);
    }
  }

  async function generateBatchFitAnswers(batch: JobResult[]): Promise<Record<string, string>> {
    const prompt = [
      "Generate one concise fit statement for each job below based on the candidate data.",
      "Output strict JSON only with keys as given memory_key and values as answer strings.",
      "Each answer should be 70-120 words and role-specific.",
      "",
      `Candidate Profile: ${JSON.stringify(candidateProfile)}`,
      `Candidate Resume Context: ${resumeText.slice(0, 3500) || "Not provided."}`,
      "Jobs:",
      ...batch.map((job) => {
        const key = toKey(`why are you a fit for ${job.title} at ${job.company}`);
        return `- memory_key="${key}" | title="${job.title}" | company="${job.company}" | location="${job.location || "N/A"}"`;
      }),
    ].join("\n");

    const text = await streamAiResponse(prompt);
    const raw = extractJsonObject(text);
    const out: Record<string, string> = {};

    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }

    return out;
  }

  async function handleBulkAutoApply(skipProfileGate = false) {
    if (!skipProfileGate && requireProfileCompletion("bulk_apply")) {
      return;
    }

    if (!selectedResumeId) {
      toast.error("Select a saved resume document first.");
      return;
    }
    if (visibleJobs.length === 0) {
      toast.error("No jobs available.");
      return;
    }

    setBulkApplying(true);
    try {
      const batch = visibleJobs.slice(0, 10);

      let generatedAnswers: Record<string, string> = {};
      try {
        generatedAnswers = await generateBatchFitAnswers(batch);
      } catch {
        generatedAnswers = {};
      }

      if (Object.keys(generatedAnswers).length > 0) {
        const mergedAnswers = { ...answerMemory, ...generatedAnswers };
        await persistApplypassState({ answers: mergedAnswers });
        setAnswerMemory(mergedAnswers);
      }

      let applied = 0;
      let duplicates = 0;
      let failed = 0;

      for (const job of batch) {
        await updateJobStatus(job, "applying", "Applying...");
        const { result, message } = await applyToJob(job);

        if (result === "applied") {
          applied += 1;
          await updateJobStatus(job, "applied", message);
        } else if (result === "duplicate") {
          duplicates += 1;
          await updateJobStatus(job, "duplicate", message);
        } else {
          failed += 1;
          await updateJobStatus(job, "failed", message);
        }
      }

      toast.success(`Auto-apply complete. Applied: ${applied}, Existing: ${duplicates}, Failed: ${failed}`);
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleGenerateCareerBrief() {
    if (!selectedJob) {
      toast.error("Select a job first.");
      return;
    }

    setGeneratingBrief(true);
    try {
      const prompt = [
        "Create a concise career-fit brief for this candidate and target role.",
        "Return markdown with sections:",
        "1) Fit Summary",
        "2) Top Strengths (3 bullets)",
        "3) Gaps to Address (3 bullets)",
        "4) 7-Day Action Plan (numbered)",
        "5) Suggested custom answer for: 'Why are you a fit for this role?'",
        "",
        `Job: ${selectedJob.title} at ${selectedJob.company}`,
        `Job Location: ${selectedJob.location || "N/A"}`,
        selectedJob.description ? `Job Description Snippet: ${selectedJob.description}` : "",
        `Candidate Profile: ${JSON.stringify(candidateProfile)}`,
        `Resume Context: ${resumeText.slice(0, 5000) || "Not provided"}`,
      ].filter(Boolean).join("\n");

      const brief = await streamAiResponse(prompt);
      if (!brief) throw new Error("No brief generated.");

      const next = { ...briefByJobId, [selectedJob.id]: brief };
      setBriefByJobId(next);
      await persistApplypassState({ jobBriefs: next });

      toast.success("Career-fit brief generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate brief.");
    } finally {
      setGeneratingBrief(false);
    }
  }

  const savedAnswers = useMemo(
    () =>
      Object.entries(answerMemory)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 40),
    [answerMemory],
  );

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SearchCode className="w-5 h-5" />
          ApplyPass Workspace
          <Badge variant="secondary">Beta</Badge>
        </CardTitle>
        <CardDescription>
          Search, shortlist, and apply faster with AI memory, profile autofill, and job-fit guidance.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Jobs in Queue</p>
              <p className="text-2xl font-semibold">{visibleJobs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Applied</p>
              <p className="text-2xl font-semibold">{statusCounts.applied}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Already Applied</p>
              <p className="text-2xl font-semibold">{statusCounts.duplicate}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-semibold">{statusCounts.failed}</p>
            </CardContent>
          </Card>
        </div>

        <Card className={`${browserExpanded ? "h-[86vh]" : "h-[70vh]"} min-h-[720px] overflow-hidden`}>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Apply Browser Workspace</CardTitle>
                <CardDescription>
                  Resizable two-pane workspace. Left: jobs. Right: in-app browser with fallback modes.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBrowserExpanded((prev) => !prev)}
              >
                {browserExpanded ? <Minimize2 className="w-4 h-4 mr-1" /> : <Maximize2 className="w-4 h-4 mr-1" />}
                {browserExpanded ? "Compact" : "Expand"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-72px)]">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={24} minSize={18}>
                <div className="h-full p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label>Resume for Apply</Label>
                    <Select
                      value={selectedResumeId || undefined}
                      onValueChange={setSelectedResumeId}
                      disabled={loadingDocs}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingDocs ? "Loading..." : "Select saved resume"} />
                      </SelectTrigger>
                      <SelectContent>
                        {resumeDocs.map((doc) => (
                          <SelectItem key={doc.id} value={doc.id}>
                            {doc.file_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {resumeDocs.length === 0 && !loadingDocs && (
                      <p className="text-xs text-muted-foreground">
                        No saved resume found. Upload resume with persistence enabled.
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Top Matches ({visibleJobs.length})
                  </div>

                  <ScrollArea className="h-[calc(100%-92px)] pr-2">
                    <div className="space-y-2">
                      {visibleJobs.map((job) => {
                        const state = applyStatusMap[job.id]?.status || "idle";
                        return (
                          <button
                            key={job.id}
                            onClick={() => setSelectedJobId(job.id)}
                            className={`w-full rounded-lg border p-3 text-left transition ${
                              selectedJobId === job.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <p className="font-medium text-sm line-clamp-2">{job.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{job.company}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{job.location || "Location not listed"}</p>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {typeof job.matchScore === "number" && (
                                <Badge variant="secondary">{job.matchScore}% match</Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">{domainFromUrl(job.url)}</Badge>
                              <Badge variant={badgeVariantForStatus(state)} className="text-[10px]">{statusLabel(state)}</Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={76} minSize={50}>
                <div className="h-full flex flex-col">
                  <div className="border-b p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{selectedJob?.title || "Select a job"}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{selectedJob?.company || "No company selected"}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBrowserRefreshKey((prev) => prev + 1)}
                          disabled={!activeBrowserUrl}
                        >
                          <RefreshCcw className="w-4 h-4 mr-1" />
                          Reload
                        </Button>
                        {!cloudBrowserSession?.sessionId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void startCloudBrowserSession()}
                            disabled={cloudBusy}
                          >
                            {cloudBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <SearchCode className="w-4 h-4 mr-1" />}
                            Start Cloud Browser
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void refreshCloudBrowserSession()}
                              disabled={cloudBusy}
                            >
                              {cloudBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-1" />}
                              Refresh Cloud
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void stopCloudBrowserSession()}
                              disabled={cloudBusy}
                            >
                              Stop Cloud
                            </Button>
                          </>
                        )}
                        {activeBrowserUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={activeBrowserUrl} target="_blank" rel="noreferrer">
                              <ArrowUpRight className="w-4 h-4 mr-1" />
                              Open
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleGenerateCareerBrief()}
                          disabled={!selectedJob || generatingBrief}
                        >
                          {generatingBrief ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                          Fit Brief
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void handleApplySelected()}
                          disabled={!selectedJob || applyingId === selectedJob?.id || bulkApplying}
                        >
                          {applyingId === selectedJob?.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MousePointerClick className="w-4 h-4 mr-1" />}
                          Apply Selected
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[170px,1fr,auto] gap-2">
                      <Select
                        value={browserMode}
                        onValueChange={(value) => {
                          const next = value as "primary" | "fallback" | "reader" | "manual" | "cloud";
                          setBrowserMode(next);
                          if (next !== "manual") {
                            setManualBrowserUrl("");
                          }
                          if (next === "cloud" && !cloudBrowserSession?.sessionId) {
                            void startCloudBrowserSession();
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">Primary URL</SelectItem>
                          <SelectItem value="fallback">Fallback Search</SelectItem>
                          <SelectItem value="reader">Reader Mode</SelectItem>
                          <SelectItem value="manual">Manual URL</SelectItem>
                          <SelectItem value="cloud">Cloud Browser</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={browserAddress}
                        onChange={(event) => setBrowserAddress(event.target.value)}
                        placeholder="Paste URL and click Go"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={handleOpenTypedUrl}>
                          Go
                        </Button>
                        {browserMode === "manual" && (
                          <Button size="sm" variant="outline" onClick={handleResetBrowserTarget}>
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>

                    {selectedJobBrowser.note && browserMode === "primary" && (
                      <p className="text-xs text-amber-500">{selectedJobBrowser.note}</p>
                    )}
                    {cloudBrowserSession?.sessionId && (
                      <p className="text-xs text-emerald-500">
                        Cloud session active: {cloudBrowserSession.sessionId.slice(0, 8)}...
                        {" "}
                        If direct embeds fail, switch mode to Cloud Browser.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Some boards block iframe embeds by policy. Cloud Browser mode streams a remote browser and is the most reliable in-app fallback.
                    </p>
                  </div>

                  <div className="flex-1 p-3 min-h-0">
                    {activeBrowserUrl ? (
                      primaryUrlIsBlocked && browserMode === "primary" ? (
                        /* Blocklisted domain — skip iframe entirely, show actions */
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              {domainFromUrl(primaryBrowserUrl)} blocks in-app embedding.
                            </p>
                            <p className="text-xs text-muted-foreground max-w-md">
                              Most job boards prevent their pages from loading inside other sites.
                              Open the listing directly or switch to a different browser mode below.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 justify-center">
                            <Button size="sm" variant="default" asChild>
                              <a href={primaryBrowserUrl} target="_blank" rel="noreferrer">
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                                Open in New Tab
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (cloudBrowserSession?.sessionId) {
                                  setBrowserMode("cloud");
                                } else {
                                  void startCloudBrowserSession();
                                }
                              }}
                              disabled={cloudBusy}
                            >
                              {cloudBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <SearchCode className="w-4 h-4 mr-1" />}
                              Use Cloud Browser
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setBrowserMode("fallback")}>
                              LinkedIn Search
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setBrowserMode("reader")}>
                              Reader Mode
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Normal iframe rendering for non-blocked or non-primary modes */
                        <div className="h-full space-y-2">
                          <iframe
                            key={`${activeBrowserUrl}-${browserRefreshKey}`}
                            title={`Job application preview ${selectedJob?.title || "job"}`}
                            src={activeBrowserUrl}
                            className="w-full h-[calc(100%-40px)] min-h-[520px] rounded-md border bg-background"
                            referrerPolicy="no-referrer-when-downgrade"
                            onLoad={() => setBrowserPaneState("loaded")}
                            onError={() => setBrowserPaneState("timeout")}
                          />
                          {browserPaneState === "loading" && (
                            <p className="text-xs text-muted-foreground">
                              Loading in-app browser...
                            </p>
                          )}
                          {browserPaneState === "timeout" && (
                            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center gap-2">
                              <span>This site may block in-app embedding. Use one of these alternatives:</span>
                              <Button size="sm" variant="default" asChild>
                                <a href={activeBrowserUrl} target="_blank" rel="noreferrer">
                                  <ArrowUpRight className="w-3 h-3 mr-1" />
                                  Open in New Tab
                                </a>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (cloudBrowserSession?.sessionId) {
                                    setBrowserMode("cloud");
                                  } else {
                                    void startCloudBrowserSession();
                                  }
                                }}
                              >
                                Use Cloud Browser
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setBrowserMode("fallback")}>
                                LinkedIn Search
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        {browserMode === "cloud" ? (
                          <div className="text-center space-y-2">
                            <p>No cloud session is active yet.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void startCloudBrowserSession()}
                              disabled={cloudBusy}
                            >
                              {cloudBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <SearchCode className="w-4 h-4 mr-1" />}
                              Start Cloud Browser
                            </Button>
                          </div>
                        ) : (
                          "Select a job to load the browser."
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </CardContent>
        </Card>

        <Card className="h-[240px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Career Copilot Brief</CardTitle>
            <CardDescription>
              AI fit and action plan for this role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[150px] pr-2">
              {selectedBrief ? (
                <pre className="text-xs whitespace-pre-wrap leading-relaxed">{selectedBrief}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">Generate Fit Brief to get tailored strengths, gaps, and next steps.</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserRound className="w-4 h-4" />
                Candidate Autofill Profile
              </CardTitle>
              <CardDescription>
                Stored once and reused by AI when applications ask recurring details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredMissingFields.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  Missing required fields:
                  {" "}
                  {requiredMissingFields
                    .map((key) => REQUIRED_PROFILE_FIELDS.find((f) => f.key === key)?.label || key)
                    .join(", ")}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input placeholder="Full name" value={candidateProfile.fullName} onChange={(e) => setCandidateProfile((p) => ({ ...p, fullName: e.target.value }))} />
                <Input placeholder="Email" value={candidateProfile.email} onChange={(e) => setCandidateProfile((p) => ({ ...p, email: e.target.value }))} />
                <Input placeholder="Phone" value={candidateProfile.phone} onChange={(e) => setCandidateProfile((p) => ({ ...p, phone: e.target.value }))} />
                <Input placeholder="Location" value={candidateProfile.location} onChange={(e) => setCandidateProfile((p) => ({ ...p, location: e.target.value }))} />
                <Input placeholder="Current title" value={candidateProfile.currentTitle} onChange={(e) => setCandidateProfile((p) => ({ ...p, currentTitle: e.target.value }))} />
                <Input placeholder="Years experience" value={candidateProfile.yearsExperience} onChange={(e) => setCandidateProfile((p) => ({ ...p, yearsExperience: e.target.value }))} />
                <Input placeholder="LinkedIn URL" value={candidateProfile.linkedinUrl} onChange={(e) => setCandidateProfile((p) => ({ ...p, linkedinUrl: e.target.value }))} />
                <Input placeholder="Portfolio URL" value={candidateProfile.portfolioUrl} onChange={(e) => setCandidateProfile((p) => ({ ...p, portfolioUrl: e.target.value }))} />
                <Input placeholder="Expected salary" value={candidateProfile.expectedSalary} onChange={(e) => setCandidateProfile((p) => ({ ...p, expectedSalary: e.target.value }))} />
                <Input placeholder="Work authorization" value={candidateProfile.workAuthorization} onChange={(e) => setCandidateProfile((p) => ({ ...p, workAuthorization: e.target.value }))} />
                <Input placeholder="Notice period" value={candidateProfile.noticePeriod} onChange={(e) => setCandidateProfile((p) => ({ ...p, noticePeriod: e.target.value }))} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleGenerateProfileFromResume()} disabled={generatingProfile || loadingPrefs}>
                  {generatingProfile ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Generate From Resume
                </Button>
                <Button onClick={() => void handleSaveProfile()} disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Save Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI Answer Memory
              </CardTitle>
              <CardDescription>
                Save answers once. Reuse automatically for recurring application questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Application Question</Label>
                <Input
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="e.g. Why do you want to work at this company?"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Answer</Label>
                <Textarea
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  placeholder="Answer will be stored and reused in future applications."
                  className="min-h-[120px]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleAiSuggestAnswer()} disabled={generatingAnswer || loadingPrefs}>
                  {generatingAnswer ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  AI Suggest
                </Button>
                <Button onClick={() => void handleSaveAnswer()} disabled={savingAnswer || !questionInput.trim() || !answerDraft.trim()}>
                  {savingAnswer ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Clipboard className="w-4 h-4 mr-1" />}
                  Save Answer
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleBulkAutoApply()}
                  disabled={bulkApplying || visibleJobs.length === 0}
                >
                  {bulkApplying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  AI Auto-Apply Top 10
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void enqueueAgentTask()}
                  disabled={queueingAgentTask || visibleJobs.length === 0}
                >
                  {queueingAgentTask ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Bot className="w-4 h-4 mr-1" />}
                  Queue Agent Run
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-apply tracks applications and pre-generates tailored fit answers. Final external form submission may require user confirmation depending on job board restrictions.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saved Answers ({savedAnswers.length})</CardTitle>
            <CardDescription>Reusable response library for recurring questions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[220px] pr-2">
              <div className="space-y-2">
                {savedAnswers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No saved answers yet.</p>
                ) : (
                  savedAnswers.map(([question, answer]) => (
                    <button
                      key={question}
                      className="w-full text-left rounded-md border p-3 hover:bg-muted/40 transition"
                      onClick={() => {
                        setQuestionInput(question);
                        setAnswerDraft(answer);
                      }}
                    >
                      <p className="text-xs font-semibold text-muted-foreground line-clamp-2">{question}</p>
                      <p className="text-sm mt-1 line-clamp-3">{answer}</p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Autonomous Agent Queue</CardTitle>
                <CardDescription>Async tasks for your external automation workers.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void refreshQueueTasks()} disabled={loadingQueueTasks}>
                {loadingQueueTasks ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[220px] pr-2">
              <div className="space-y-2">
                {agentQueueTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No queued tasks yet.</p>
                ) : (
                  agentQueueTasks.map((task) => {
                    const jobsInTask = Array.isArray(task.payload?.jobs) ? task.payload?.jobs.length : 0;
                    const isCancelable = task.status === "pending" || task.status === "running";
                    return (
                      <div key={task.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{task.id}</p>
                            <p className="text-xs text-muted-foreground">
                              {task.task_type} · {jobsInTask} jobs · {new Date(task.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={task.status === "failed" ? "destructive" : task.status === "completed" ? "default" : "secondary"}>
                              {task.status}
                            </Badge>
                            {isCancelable && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void cancelTask(task.id)}
                                disabled={cancelingTaskId === task.id}
                              >
                                {cancelingTaskId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancel"}
                              </Button>
                            )}
                          </div>
                        </div>
                        {task.error_message && (
                          <p className="text-xs text-destructive mt-1 line-clamp-2">{task.error_message}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Dialog
          open={profilePromptOpen}
          onOpenChange={(open) => {
            setProfilePromptOpen(open);
            if (!open) {
              setPendingProfileAction(null);
              setMissingProfileFields([]);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Complete Profile Once</DialogTitle>
              <DialogDescription>
                Add these required fields so ApplyPass can auto-fill forms and avoid asking you again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {missingProfileFields.map((fieldKey) => {
                const config = REQUIRED_PROFILE_FIELDS.find((field) => field.key === fieldKey);
                if (!config) return null;
                return (
                  <div key={fieldKey} className="space-y-1">
                    <Label>{config.label}</Label>
                    <Input
                      type={config.type || "text"}
                      placeholder={config.placeholder}
                      value={candidateProfile[fieldKey]}
                      onChange={(event) =>
                        setCandidateProfile((prev) => ({
                          ...prev,
                          [fieldKey]: event.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setProfilePromptOpen(false)}>
                Not now
              </Button>
              <Button onClick={() => void handleSaveProfileAndContinue()} disabled={savingProfile}>
                {savingProfile ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Save and Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

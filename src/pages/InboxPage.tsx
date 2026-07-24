/* eslint-disable @typescript-eslint/no-explicit-any -- inbox verification fields are deployed ahead of generated client types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, Clipboard, Inbox, MailOpen, RefreshCw, Search, ShieldCheck } from "lucide-react";

import GmailConnectCard from "@/components/my-collection/GmailConnectCard";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { emailClassificationLabels as labels, formatLinkedJobLabel, type TrackedJobLinkRow } from "@/lib/email-links";
import { toUserFacingError } from "@/lib/user-facing-error";

interface InboxMessage {
  id: string;
  session_id: string | null;
  tracked_job_id: string | null;
  from_email: string;
  subject: string | null;
  body_preview: string | null;
  classification: string | null;
  classification_summary: string | null;
  next_action: string | null;
  verification_code: string | null;
  verification_code_expires_at: string | null;
  is_read: boolean;
  received_at: string;
}

const filters = ["all", "verification", "confirmation", "interview_invite", "take_home", "offer", "reject"] as const;

export default function InboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [trackedJobs, setTrackedJobs] = useState<Record<string, TrackedJobLinkRow>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [supportsReadState, setSupportsReadState] = useState(true);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [query, setQuery] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [gmailConnected, setGmailConnected] = useState(false);
  const pollingRef = useRef(false);
  const automaticWorkspaceAttempt = useRef(false);
  const connectionResult = searchParams.get("inbox");

  useEffect(() => {
    if (!connectionResult) return;
    const resultMessages: Record<string, { title: string; description: string; variant?: "destructive" }> = {
      connected: {
        title: "Gmail connected",
        description: "Your application inbox is ready. We’ll only surface job-related messages here.",
      },
      cancelled: {
        title: "Gmail connection cancelled",
        description: "No access was granted. You can connect Gmail whenever you’re ready.",
      },
      connect_failed: {
        title: "Gmail connection didn’t finish",
        description: "Google could not complete the connection. Please try Connect Gmail again.",
        variant: "destructive",
      },
      unavailable: {
        title: "Gmail connection unavailable",
        description: "The inbox connection is not ready yet. Please try again shortly.",
        variant: "destructive",
      },
      invalid_link: {
        title: "Gmail connection expired",
        description: "For your security, this connection link is no longer valid. Start again from this page.",
        variant: "destructive",
      },
    };
    const message = resultMessages[connectionResult];
    if (message) toast(message);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("inbox");
      return next;
    }, { replace: true });
  }, [connectionResult, setSearchParams, toast]);

  const load = useCallback(async () => {
    if (!user) return;
    const [enhancedMessagesResult, sessionResult] = await Promise.all([
      (supabase as any).from("mc_inbound_emails")
        .select("id,session_id,tracked_job_id,from_email,subject,body_preview,classification,classification_summary,next_action,verification_code,verification_code_expires_at,is_read,received_at")
        .eq("user_id", user.id).order("received_at", { ascending: false }).limit(250),
      supabase.from("mc_sessions").select("id").eq("user_id", user.id).eq("status", "active")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    let messageRows = enhancedMessagesResult.data as InboxMessage[] | null;
    if (enhancedMessagesResult.error) {
      // During a staged rollout, older environments may not have code/read
      // metadata yet. Keep the inbox useful with the stable message fields.
      const fallback = await (supabase as any).from("mc_inbound_emails")
        .select("id,session_id,tracked_job_id,from_email,subject,body_preview,classification,classification_summary,next_action,received_at")
        .eq("user_id", user.id).order("received_at", { ascending: false }).limit(250);
      if (fallback.error) throw fallback.error;
      setSupportsReadState(false);
      messageRows = (fallback.data || []).map((row: Record<string, unknown>) => ({
        ...row, verification_code: null, verification_code_expires_at: null, is_read: true,
      })) as InboxMessage[];
    } else setSupportsReadState(true);
    setMessages(messageRows || []);
    setLoadedAt(Date.now());
    // Resolve "linked to" labels for rows that reference a tracked job.
    const trackedJobIds = [...new Set((messageRows || []).map((row) => row.tracked_job_id).filter((id): id is string => Boolean(id)))];
    if (trackedJobIds.length) {
      const { data: jobRows } = await supabase.from("mc_tracked_jobs")
        .select("id,session_id,scanned_job_id,apply_url,job_title,company")
        .eq("user_id", user.id).in("id", trackedJobIds);
      setTrackedJobs(Object.fromEntries(((jobRows || []) as TrackedJobLinkRow[]).map((job) => [job.id, job])));
    } else setTrackedJobs({});
    let activeSessionId = sessionResult.data?.id || null;
    if (!activeSessionId && !sessionResult.error && !automaticWorkspaceAttempt.current) {
      automaticWorkspaceAttempt.current = true;
      setCreating(true);
      const { data: created } = await supabase.from("mc_sessions")
        .insert({ user_id: user.id, name: "Application Agent" })
        .select("id")
        .single();
      activeSessionId = created?.id || null;
      setCreating(false);
    }
    setSessionId(activeSessionId);
  }, [user]);

  useEffect(() => {
    void load().catch((error) => {
      const safe = toUserFacingError(error, { operation: "inbox_load", defaultMessage: "Application messages could not be loaded." });
      toast({ title: "Couldn't load inbox", description: safe.message, variant: "destructive" });
    }).finally(() => setLoading(false));
  }, [load, toast]);

  // Keep the visible inbox current while the user is on this page. The
  // server-side worker also polls immediately when a portal requests a code;
  // this interval is only for the human-facing message list.
  useEffect(() => {
    if (!gmailConnected || !sessionId) return;
    const timer = window.setInterval(async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const { error } = await (supabase as any).functions.invoke("mc-gmail-poll", {});
        if (!error) await load();
      } finally {
        pollingRef.current = false;
      }
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [gmailConnected, load, sessionId]);

  const unread = useMemo(() => messages.filter((message) => !message.is_read).length, [messages]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return messages.filter((message) => {
      const matchesFilter = filter === "all"
        || (filter === "verification" && Boolean(message.verification_code))
        || message.classification === filter;
      const haystack = `${message.subject || ""} ${message.from_email} ${message.classification_summary || ""} ${message.body_preview || ""}`.toLowerCase();
      return matchesFilter && (!term || haystack.includes(term));
    });
  }, [filter, messages, query]);

  async function createWorkspace() {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase.from("mc_sessions").insert({ user_id: user.id, name: "Application inbox" }).select("id").single();
    setCreating(false);
    if (error) {
      toast({ title: "Workspace wasn't created", description: "Try again in a moment.", variant: "destructive" });
      return;
    }
    setSessionId(data.id);
  }

  async function refresh() {
    setRefreshing(true);
    const { error } = await (supabase as any).functions.invoke("mc-gmail-poll", {});
    if (!error) await load();
    setRefreshing(false);
    toast(error
      ? { title: "Inbox check failed", description: "Your connected inbox could not be checked right now.", variant: "destructive" }
      : { title: "Application inbox is up to date" });
  }

  async function markRead(id: string, isRead: boolean) {
    setMessages((current) => current.map((item) => item.id === id ? { ...item, is_read: isRead } : item));
    const { error } = await (supabase as any).from("mc_inbound_emails").update({ is_read: isRead }).eq("id", id);
    if (error) {
      await load();
      toast({ title: "Read state wasn't saved", description: "The message was restored to its previous state.", variant: "destructive" });
    }
  }

  async function markAllRead() {
    if (!user || !unread || !supportsReadState) return;
    const { error } = await (supabase as any).from("mc_inbound_emails").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (error) {
      toast({ title: "Couldn't mark all as read", description: "Try again in a moment.", variant: "destructive" });
      return;
    }
    setMessages((current) => current.map((item) => ({ ...item, is_read: true })));
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader title="Application inbox." status={`${unread} unread`} description="Confirmations, verification codes, interviews, assessments, offers, and status changes—separated from personal email." />

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {sessionId ? <GmailConnectCard
          sessionId={sessionId}
          onConnectionChange={setGmailConnected}
          onPollComplete={load}
        /> : (
          <Card className="p-5">
            <p className="text-sm font-semibold">Connect your application email</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your private application workspace is prepared automatically. Gmail uses the same Google account as sign-in and still requires one-time read-only consent.</p>
            <Button className="mt-4" size="sm" onClick={createWorkspace} disabled={creating}>{creating ? "Preparing…" : "Retry setup"}</Button>
          </Card>
        )}
        <Card className="p-5">
          <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><div>
            <p className="text-sm font-semibold">Private by design</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Read-only access, encrypted credentials, job-related matching, and short-lived verification codes. ResumePreps cannot send or delete mail.</p>
          </div></div>
        </Card>
      </div>

      <section className="mt-6 border border-rp-rule bg-rp-canvas">
        <div className="flex flex-col gap-4 border-b border-rp-rule p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs transition-colors ${filter === value ? "bg-rp-ink text-rp-canvas" : "bg-rp-paper text-rp-ink-2 hover:text-rp-ink"}`}>{labels[value]}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" className="h-9 w-56 pl-9" /></div>
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unread || !supportsReadState}><CheckCheck className="mr-1.5 h-3.5 w-3.5" />Read all</Button>
            <Button size="sm" onClick={refresh} disabled={refreshing || !sessionId}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Check inbox</Button>
          </div>
        </div>

        {loading ? <div className="space-y-3 p-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-28" />)}</div> : visible.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><Inbox className="h-9 w-9 text-rp-ink-3" /><p className="mt-3 text-sm font-semibold">No matching application messages</p><p className="mt-1 max-w-md text-xs text-rp-ink-2">Connect Gmail and check your inbox. Only messages related to applications are shown here.</p></div>
        ) : <div className="divide-y divide-rp-rule">{visible.map((message) => {
          const codeActive = Boolean(message.verification_code && (!message.verification_code_expires_at || new Date(message.verification_code_expires_at).getTime() > loadedAt));
          const linkedLabel = message.tracked_job_id ? formatLinkedJobLabel(trackedJobs[message.tracked_job_id]) : null;
          const openMessage = () => navigate(`/inbox/${message.id}`);
          return <article key={message.id} role="link" tabIndex={0} aria-label={`Open message: ${message.subject || "Application update"}`} onClick={openMessage} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openMessage(); } }} className={`grid cursor-pointer gap-3 p-4 transition-colors hover:bg-muted/40 sm:grid-cols-[28px_minmax(0,1fr)_auto] ${message.is_read ? "" : "bg-primary/[0.035]"}`}>
            <button disabled={!supportsReadState} className="mt-0.5 h-7 w-7 rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40" onClick={(event) => { event.stopPropagation(); markRead(message.id, !message.is_read); }} aria-label={message.is_read ? "Mark unread" : "Mark read"}>{message.is_read ? <MailOpen className="mx-auto h-4 w-4" /> : <Check className="mx-auto h-4 w-4" />}</button>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{message.subject || "Application update"}</p>{message.classification && <Badge variant="secondary">{labels[message.classification] || "Update"}</Badge>}</div><p className="mt-0.5 truncate text-xs text-muted-foreground">{message.from_email}</p>{linkedLabel && <p className="mt-0.5 truncate text-xs font-medium text-rp-ink-2">Linked to: {linkedLabel}</p>}{message.classification_summary && <p className="mt-2 text-sm">{message.classification_summary}</p>}{message.body_preview && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{message.body_preview}</p>}{message.next_action && <p className="mt-2 text-xs font-medium text-primary">Next: {message.next_action}</p>}{codeActive && <div className="mt-3 inline-flex items-center gap-3 border border-primary/20 bg-primary/5 px-3 py-2" onClick={(event) => event.stopPropagation()}><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Verification code</p><p className="font-mono text-lg font-semibold tracking-[0.2em]">{message.verification_code}</p></div><Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(message.verification_code!); toast({ title: "Verification code copied" }); } catch { toast({ title: "Couldn't copy the code", description: "Select and copy it manually.", variant: "destructive" }); } }}><Clipboard className="mr-1.5 h-3.5 w-3.5" />Copy</Button></div>}</div>
            <div className="flex flex-col items-end gap-2"><time className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(message.received_at), { addSuffix: true })}</time></div>
          </article>;
        })}</div>}
      </section>
    </div>
  );
}

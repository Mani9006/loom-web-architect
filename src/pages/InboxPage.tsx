/* eslint-disable @typescript-eslint/no-explicit-any -- inbox verification fields are deployed ahead of generated client types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, ChevronDown, Clipboard, Inbox, MailOpen, RefreshCw, Reply, Search, Settings2, ShieldCheck } from "lucide-react";

import { CopyAddressButton, GetAddressCard, MailboxSettingsSheet } from "@/components/inbox/MailboxSettings";
import { ReplyComposer } from "@/components/inbox/ReplyComposer";
import GmailConnectCard from "@/components/my-collection/GmailConnectCard";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useHostedMailbox } from "@/hooks/use-hosted-mailbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { INBOX_FILTERS, type InboxFilter, matchesInboxFilter } from "@/lib/inbox-filters";
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
  // Hosted application mailbox fields (absent before that migration ships).
  source?: string | null;
  to_email?: string | null;
  body_full?: string | null;
}

const labels: Record<string, string> = {
  verification: "Code",
  confirmation: "Applied",
  interview_invite: "Interview",
  take_home: "Assessment",
  offer: "Offer",
  reject: "Not selected",
  other_recruiter: "Recruiter update",
  irrelevant: "Other",
};

// Application-related classifications, mirroring the classifier in
// supabase/functions/mc-gmail-poll/index.ts. Anything outside this set
// ("irrelevant", null, or an unrecognized value) is hidden by default.
const APPLICATION_CLASSIFICATIONS = [
  "confirmation",
  "interview_invite",
  "take_home",
  "reject",
  "offer",
  "other_recruiter",
  "verification",
] as const;

export default function InboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [supportsReadState, setSupportsReadState] = useState(true);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [applicationOnly, setApplicationOnly] = useState(true);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [jobLabels, setJobLabels] = useState<Record<string, { job_title: string | null; company: string | null }>>({});
  const [loadedAt, setLoadedAt] = useState(0);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [mailboxSheetOpen, setMailboxSheetOpen] = useState(false);
  const hostedMailbox = useHostedMailbox();
  const mailbox = hostedMailbox.mailbox;
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
    const selectFields = "id,session_id,tracked_job_id,from_email,subject,body_preview,classification,classification_summary,next_action,verification_code,verification_code_expires_at,is_read,received_at";
    const messageQuery = (fields: string) => {
      let query = (supabase as any).from("mc_inbound_emails")
        .select(fields)
        .eq("user_id", user.id);
      // Display-layer filter only: polling/storage still ingest every email
      // (the OTP flow depends on it); the inbox simply stops rendering
      // non-application mail unless the user turns the toggle off.
      if (applicationOnly) query = query.in("classification", [...APPLICATION_CLASSIFICATIONS]);
      return query.order("received_at", { ascending: false }).limit(250);
    };
    // Hosted-mailbox columns first; environments without that migration fall
    // back to the stable column set below.
    const hostedMessagesQuery = messageQuery(`${selectFields},source,to_email,body_full`)
      .then(async (result: { error: unknown }) => result.error ? messageQuery(selectFields) : result);
    const [enhancedMessagesResult, sessionResult, hiddenResult] = await Promise.all([
      hostedMessagesQuery,
      supabase.from("mc_sessions").select("id").eq("user_id", user.id).eq("status", "active")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      applicationOnly
        ? (supabase as any).from("mc_inbound_emails").select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .or(`classification.is.null,classification.not.in.(${APPLICATION_CLASSIFICATIONS.join(",")})`)
        : Promise.resolve(null),
    ]);
    setHiddenCount(applicationOnly ? (hiddenResult?.count ?? 0) : 0);
    let messageRows = enhancedMessagesResult.data as InboxMessage[] | null;
    if (enhancedMessagesResult.error) {
      // During a staged rollout, older environments may not have code/read
      // metadata yet. Keep the inbox useful with the stable message fields.
      let fallbackQuery = (supabase as any).from("mc_inbound_emails")
        .select("id,session_id,tracked_job_id,from_email,subject,body_preview,classification,classification_summary,next_action,received_at")
        .eq("user_id", user.id);
      if (applicationOnly) fallbackQuery = fallbackQuery.in("classification", [...APPLICATION_CLASSIFICATIONS]);
      const fallback = await fallbackQuery.order("received_at", { ascending: false }).limit(250);
      if (fallback.error) throw fallback.error;
      setSupportsReadState(false);
      messageRows = (fallback.data || []).map((row: Record<string, unknown>) => ({
        ...row, verification_code: null, verification_code_expires_at: null, is_read: true,
      })) as InboxMessage[];
    } else setSupportsReadState(true);
    setMessages(messageRows || []);
    setLoadedAt(Date.now());
    // Resolve tracked-job labels so linked mail can be prioritized with the
    // job title/company shown instead of a bare "Open application" button.
    const trackedIds = Array.from(new Set((messageRows || [])
      .map((row) => row.tracked_job_id)
      .filter((id): id is string => Boolean(id))));
    if (trackedIds.length > 0) {
      const { data: jobRows } = await supabase.from("mc_tracked_jobs").select("id,job_title,company").in("id", trackedIds);
      setJobLabels(Object.fromEntries((jobRows || []).map((job) => [job.id, { job_title: job.job_title, company: job.company }])));
    } else setJobLabels({});
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
  }, [user, applicationOnly]);

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

  // Hosted mail arrives by webhook, so without Gmail polling just re-read the
  // stored messages while the page is open.
  useEffect(() => {
    if (!mailbox || gmailConnected) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 60_000);
    return () => window.clearInterval(timer);
  }, [gmailConnected, load, mailbox]);

  const unread = useMemo(() => messages.filter((message) => !message.is_read).length, [messages]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = messages.filter((message) => {
      const matchesFilter = matchesInboxFilter(message, filter, loadedAt);
      const haystack = `${message.subject || ""} ${message.from_email} ${message.classification_summary || ""} ${message.body_preview || ""}`.toLowerCase();
      return matchesFilter && (!term || haystack.includes(term));
    });
    // Mail linked to a tracked job surfaces first; the rest follows, newest
    // first inside each group.
    return filtered.sort((a, b) => {
      const linkedA = a.tracked_job_id ? 0 : 1;
      const linkedB = b.tracked_job_id ? 0 : 1;
      if (linkedA !== linkedB) return linkedA - linkedB;
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    });
  }, [filter, loadedAt, messages, query]);

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

  function toggleOpen(message: InboxMessage) {
    const opening = openId !== message.id;
    setOpenId(opening ? message.id : null);
    if (!opening && replyId === message.id) setReplyId(null);
    if (opening && !message.is_read && supportsReadState) void markRead(message.id, true);
  }

  function startReply(message: InboxMessage) {
    setOpenId(message.id);
    setReplyId(message.id);
  }

  const showMailboxRow = hostedMailbox.available && (hostedMailbox.loading || Boolean(mailbox));

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader title="Application inbox." status={`${unread} unread`} description="Confirmations, verification codes, interviews, assessments, offers, and status changes,separated from personal email." />

      {showMailboxRow && (
        <div className="-mt-2 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
          {mailbox ? (
            <>
              <p className="text-sm text-rp-ink-2">
                Your application address <span className="break-all font-medium text-rp-ink">{mailbox.address}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <CopyAddressButton address={mailbox.address} />
                <Button variant="ghost" size="sm" onClick={() => setMailboxSheetOpen(true)} aria-haspopup="dialog">
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />Address settings
                </Button>
              </div>
            </>
          ) : <Skeleton className="h-5 w-72" />}
        </div>
      )}
      {mailbox && <MailboxSettingsSheet controller={hostedMailbox} open={mailboxSheetOpen} onOpenChange={setMailboxSheetOpen} />}

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
        {/* Same slot either way, so the swap after loading never moves the list. */}
        <div className="min-h-[132px]">
          {hostedMailbox.loading ? <Skeleton className="h-full min-h-[132px]" /> : hostedMailbox.available && !mailbox ? (
            <GetAddressCard controller={hostedMailbox} />
          ) : (
            <Card className="h-full p-5">
              <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden /><div>
                <p className="text-sm font-semibold">Private by design</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Read-only Gmail access, encrypted credentials, job-related matching, and short-lived verification codes. ResumePreps can't send or delete mail in your Gmail.</p>
              </div></div>
            </Card>
          )}
        </div>
      </div>

      <section className="mt-6 border border-rp-rule bg-rp-canvas">
        <div className="flex flex-col gap-4 border-b border-rp-rule p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter messages">
              {INBOX_FILTERS.map(({ value, label }) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${filter === value ? "bg-rp-ink text-rp-canvas" : "bg-rp-paper text-rp-ink-2 hover:text-rp-ink"}`}>{label}</button>)}
            </div>
            <div className="flex items-center gap-2">
              <Switch id="application-only" checked={applicationOnly} onCheckedChange={setApplicationOnly} />
              <label htmlFor="application-only" className="cursor-pointer text-xs text-rp-ink-2">Application mail only</label>
              {applicationOnly && hiddenCount > 0 && <span className="text-xs text-muted-foreground">({hiddenCount} unrelated hidden)</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" aria-label="Search messages" className="h-9 w-56 pl-9" /></div>
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unread || !supportsReadState}><CheckCheck className="mr-1.5 h-3.5 w-3.5" />Read all</Button>
            <Button size="sm" onClick={refresh} disabled={refreshing || !sessionId}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />Check inbox</Button>
          </div>
        </div>

        {loading ? <div className="space-y-3 p-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-28" />)}</div> : visible.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><Inbox className="h-9 w-9 text-rp-ink-3" /><p className="mt-3 text-sm font-semibold">{filter === "needs_you" && messages.length > 0 ? "Nothing needs you right now" : applicationOnly ? "No application messages yet" : "No matching messages"}</p><p className="mt-1 max-w-md text-xs text-rp-ink-2">{filter === "needs_you" && messages.length > 0 ? "Interview invites, assessments, offers, and verification codes show up here when they arrive." : applicationOnly ? "Only emails about your applications appear here, OTPs, confirmations, interview invites, assessments, decisions." : "Nothing matches the current filters. Try a different search or filter."}</p></div>
        ) : <div className="divide-y divide-rp-rule">{visible.map((message) => {
          const codeActive = Boolean(message.verification_code && (!message.verification_code_expires_at || new Date(message.verification_code_expires_at).getTime() > loadedAt));
          const hosted = message.source === "hosted";
          const isOpen = openId === message.id;
          const bodyId = `message-body-${message.id}`;
          return <article key={message.id} className={`grid gap-3 p-4 sm:grid-cols-[28px_minmax(0,1fr)_auto] ${message.is_read ? "" : "bg-primary/[0.035]"}`}>
            <button disabled={!supportsReadState} className="mt-0.5 h-7 w-7 rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40" onClick={() => markRead(message.id, !message.is_read)} aria-label={message.is_read ? "Mark unread" : "Mark read"}>{message.is_read ? <MailOpen className="mx-auto h-4 w-4" /> : <Check className="mx-auto h-4 w-4" />}</button>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{message.subject || "Application update"}</p>{message.classification && <Badge variant="secondary">{labels[message.classification] || "Update"}</Badge>}{message.tracked_job_id && <Badge variant="outline">{(() => { const job = jobLabels[message.tracked_job_id]; const label = job ? [job.job_title, job.company].filter(Boolean).join(" · ") : ""; return label || "Tracked application"; })()}</Badge>}</div><p className="mt-0.5 truncate text-xs text-muted-foreground">{message.from_email}{hosted && message.to_email ? <span> to {message.to_email}</span> : null}</p>{message.classification_summary && <p className="mt-2 text-sm">{message.classification_summary}</p>}{!isOpen && message.body_preview && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{message.body_preview}</p>}{message.next_action && <p className="mt-2 text-xs font-medium text-primary">Next: {message.next_action}</p>}{codeActive && <div className="mt-3 inline-flex items-center gap-3 border border-primary/20 bg-primary/5 px-3 py-2"><div><p className="text-[11px] text-muted-foreground">Verification code</p><p className="font-mono text-lg font-semibold tracking-[0.2em]">{message.verification_code}</p></div><Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(message.verification_code!); toast({ title: "Verification code copied" }); } catch { toast({ title: "Couldn't copy the code", description: "Select and copy it manually.", variant: "destructive" }); } }}><Clipboard className="mr-1.5 h-3.5 w-3.5" />Copy</Button></div>}
              {hosted && (
                <>
                  {isOpen && <div id={bodyId} className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-rp-rule pl-3 text-sm leading-relaxed text-rp-ink">{message.body_full || message.body_preview || "This message has no text."}</div>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => toggleOpen(message)} aria-expanded={isOpen} aria-controls={isOpen ? bodyId : undefined}>
                      <ChevronDown className={`mr-1.5 h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`} aria-hidden />{isOpen ? "Hide message" : "Read message"}
                    </Button>
                    {mailbox && replyId !== message.id && <Button variant="ghost" size="sm" onClick={() => startReply(message)}><Reply className="mr-1.5 h-3.5 w-3.5" aria-hidden />Reply</Button>}
                  </div>
                  {mailbox && replyId === message.id && (
                    <ReplyComposer
                      recipient={message.from_email}
                      fromAddress={mailbox.address}
                      onSend={(body, clientRequestId) => hostedMailbox.sendReply({ replyToEmailId: message.id, body, clientRequestId })}
                      onClose={() => setReplyId(null)}
                    />
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-2"><time className="text-[11px] text-muted-foreground" dateTime={message.received_at}>{formatDistanceToNow(new Date(message.received_at), { addSuffix: true })}</time>{message.tracked_job_id && <Button variant="ghost" size="sm" onClick={() => navigate("/job-tracker")}>Open application</Button>}</div>
          </article>;
        })}</div>}
      </section>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- inbox columns are newer than the generated database client types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toUserFacingError } from "@/lib/user-facing-error";
import { Check, CheckCheck, Clipboard, Inbox, MailOpen, RefreshCw, ShieldCheck } from "lucide-react";
import GmailConnectCard from "./GmailConnectCard";

interface InboxMessage {
  id: string;
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

const labels: Record<string, string> = {
  confirmation: "Confirmation",
  interview_invite: "Interview",
  take_home: "Assessment",
  reject: "Not selected",
  offer: "Offer",
  other_recruiter: "Recruiter update",
  irrelevant: "Other",
};

export default function ApplicationInboxTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("mc_inbound_emails")
      .select("id,from_email,subject,body_preview,classification,classification_summary,next_action,verification_code,verification_code_expires_at,is_read,received_at")
      .eq("session_id", sessionId)
      .order("received_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    setMessages((data as InboxMessage[]) ?? []);
  }, [sessionId]);

  useEffect(() => {
    load()
      .catch((error) => {
        const safeError = toUserFacingError(error, {
          operation: "load_application_inbox",
          defaultMessage: "Application messages could not be loaded.",
        });
        toast({ title: "Couldn't load inbox", description: safeError.message, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [load, toast]);

  const unread = useMemo(() => messages.filter((message) => !message.is_read).length, [messages]);

  async function refresh() {
    setRefreshing(true);
    try {
      const { error } = await (supabase as any).functions.invoke("mc-gmail-poll", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      await load();
      toast({ title: "Inbox is up to date" });
    } catch (error) {
      const safeError = toUserFacingError(error, {
        operation: "refresh_application_inbox",
        defaultMessage: "Your inbox could not be checked right now.",
      });
      toast({ title: "Inbox check failed", description: safeError.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  async function markRead(id: string, isRead: boolean) {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, is_read: isRead } : message));
    const { error } = await (supabase as any).from("mc_inbound_emails").update({ is_read: isRead }).eq("id", id);
    if (error) await load().catch(() => undefined);
  }

  async function markAllRead() {
    if (!unread) return;
    const { error } = await (supabase as any)
      .from("mc_inbound_emails")
      .update({ is_read: true })
      .eq("session_id", sessionId)
      .eq("is_read", false);
    if (!error) setMessages((current) => current.map((message) => ({ ...message, is_read: true })));
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    toast({ title: "Verification code copied" });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <GmailConnectCard sessionId={sessionId} onPollComplete={load} />
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Private by design</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Read-only connection, encrypted credentials, application-only matching, and short-lived codes.
                ResumePreps never displays or stores your mailbox password.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Application messages</h2>
            {unread > 0 && <Badge>{unread} unread</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Only messages linked to jobs in this workspace appear here.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unread}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
          </Button>
          <Button size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Check inbox
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 w-full" />)}</div>
      ) : messages.length === 0 ? (
        <Card className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <Inbox className="h-9 w-9 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No application messages yet</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Connect your inbox above, add or apply to jobs in this workspace, then check again. Unrelated personal email is not added here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => {
            const codeActive = Boolean(message.verification_code && message.verification_code_expires_at &&
              new Date(message.verification_code_expires_at).getTime() > Date.now());
            return (
              <Card key={message.id} className={`p-4 transition-colors ${message.is_read ? "" : "border-primary/35 bg-primary/[0.025]"}`}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="mt-0.5 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => markRead(message.id, !message.is_read)}
                    aria-label={message.is_read ? "Mark unread" : "Mark read"}
                  >
                    {message.is_read ? <MailOpen className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{message.subject || "Application update"}</p>
                      {message.classification && <Badge variant="secondary">{labels[message.classification] || "Update"}</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{message.from_email}</p>
                    {message.classification_summary && <p className="mt-3 text-sm">{message.classification_summary}</p>}
                    {message.body_preview && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{message.body_preview}</p>}
                    {message.next_action && <p className="mt-2 text-xs font-medium text-primary">Next: {message.next_action}</p>}
                    {codeActive && (
                      <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Verification code</p>
                          <p className="font-mono text-lg font-semibold tracking-[0.2em]">{message.verification_code}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => copyCode(message.verification_code!)}>
                          <Clipboard className="mr-1.5 h-3.5 w-3.5" /> Copy
                        </Button>
                      </div>
                    )}
                  </div>
                  <time className="shrink-0 text-[10px] text-muted-foreground" dateTime={message.received_at}>
                    {new Date(message.received_at).toLocaleString()}
                  </time>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- inbox verification fields are deployed ahead of generated client types */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, FileText, Inbox, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  emailClassificationLabels,
  formatLinkedJobLabel,
  resolveEmailApplicationLink,
  type EmailLinkTarget,
  type TrackedJobLinkRow,
} from "@/lib/email-links";
import { toUserFacingError } from "@/lib/user-facing-error";

interface InboxEmailDetail {
  id: string;
  session_id: string | null;
  tracked_job_id: string | null;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  body_preview: string | null;
  body_full: string | null;
  classification: string | null;
  classification_summary: string | null;
  next_action: string | null;
  verification_code: string | null;
  is_read: boolean;
  received_at: string;
}

const DETAIL_FIELDS = "id,session_id,tracked_job_id,from_email,to_email,subject,body_preview,body_full,classification,classification_summary,next_action,verification_code,is_read,received_at";
const DETAIL_FIELDS_FALLBACK = "id,session_id,tracked_job_id,from_email,to_email,subject,body_preview,body_full,classification,classification_summary,next_action,received_at";

interface LinkState {
  resolving: boolean;
  target: EmailLinkTarget | null;
  trackedJob: TrackedJobLinkRow | null;
}

export default function InboxEmailDetailPage() {
  const { emailId } = useParams<{ emailId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState<InboxEmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>({ resolving: false, target: null, trackedJob: null });

  const load = useCallback(async (): Promise<{ detail: InboxEmailDetail; readSupported: boolean } | null> => {
    if (!user || !emailId) return null;
    // Same staged-rollout fallback as the inbox list: older environments may
    // not have verification/read columns yet.
    let result = await (supabase as any).from("mc_inbound_emails")
      .select(DETAIL_FIELDS).eq("id", emailId).eq("user_id", user.id).maybeSingle();
    let readSupported = true;
    if (result.error) {
      const fallback = await (supabase as any).from("mc_inbound_emails")
        .select(DETAIL_FIELDS_FALLBACK).eq("id", emailId).eq("user_id", user.id).maybeSingle();
      if (fallback.error) throw fallback.error;
      readSupported = false;
      result = { ...fallback, data: fallback.data ? { ...fallback.data, verification_code: null, is_read: true } : null };
    }
    return result.data ? { detail: result.data as InboxEmailDetail, readSupported } : null;
  }, [user, emailId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await load();
        if (cancelled) return;
        if (!loaded) {
          setNotFound(true);
          return;
        }
        const { detail, readSupported } = loaded;
        setEmail(detail);

        // Mark as read on open — silent; toast only when the update fails.
        if (!detail.is_read && readSupported) {
          setEmail((current) => (current?.id === detail.id ? { ...current, is_read: true } : current));
          const { error } = await (supabase as any).from("mc_inbound_emails").update({ is_read: true }).eq("id", detail.id);
          if (error && !cancelled) {
            setEmail((current) => (current?.id === detail.id ? { ...current, is_read: false } : current));
            toast({ title: "Read state wasn't saved", description: "The message was restored to its previous state.", variant: "destructive" });
          }
        }

        // Resolve the application deep link (best-effort: the message itself
        // still renders when resolution fails).
        if (detail.tracked_job_id && user) {
          setLinkState({ resolving: true, target: null, trackedJob: null });
          try {
            const resolved = await resolveEmailApplicationLink(detail.tracked_job_id, user.id);
            if (!cancelled) setLinkState({ resolving: false, target: resolved.target, trackedJob: resolved.trackedJob });
          } catch {
            if (!cancelled) setLinkState({ resolving: false, target: null, trackedJob: null });
          }
        }
      } catch (error) {
        if (!cancelled) {
          const safe = toUserFacingError(error, { operation: "inbox_email_load", defaultMessage: "This message could not be loaded." });
          toast({ title: "Couldn't load message", description: safe.message, variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, user, toast]);

  const linkedLabel = formatLinkedJobLabel(linkState.trackedJob);
  const body = email ? (email.body_full || email.body_preview || "") : "";

  function openTarget(target: EmailLinkTarget) {
    if (target.kind === "external") {
      window.open(target.href, "_blank", "noopener,noreferrer");
    } else {
      navigate(target.href);
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader title="Message." status="Application inbox" description="The full message as received — shown as plain text for safety." />

      <div className="mt-7">
        <Button variant="ghost" size="sm" onClick={() => navigate("/inbox")}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back to inbox
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      ) : notFound || !email ? (
        <Card className="mt-4 flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <Inbox className="h-9 w-9 text-rp-ink-3" />
          <p className="mt-3 text-sm font-semibold">Message not found</p>
          <p className="mt-1 max-w-md text-xs text-rp-ink-2">It may have been removed, or the link is incomplete.</p>
          <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/inbox">Open inbox</Link></Button>
        </Card>
      ) : (
        <Card className="mt-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rp-rule pb-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold leading-snug">{email.subject || "Application update"}</h1>
                {email.classification && <Badge variant="secondary">{emailClassificationLabels[email.classification] || "Update"}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">From: {email.from_email}</p>
              {email.to_email && <p className="text-xs text-muted-foreground">To: {email.to_email}</p>}
              <time className="mt-1 block text-xs text-muted-foreground">{format(new Date(email.received_at), "PPpp")}</time>
              {linkedLabel && <p className="mt-2 text-xs font-medium text-rp-ink-2">Linked to: {linkedLabel}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              {linkState.resolving ? (
                <Button size="sm" disabled><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Finding application…</Button>
              ) : linkState.target ? (
                <Button size="sm" onClick={() => openTarget(linkState.target!)}>
                  {linkState.target.kind === "external" ? <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                  View application
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No linked application yet</p>
              )}
            </div>
          </div>

          {email.classification_summary && <p className="mt-4 text-sm">{email.classification_summary}</p>}
          {email.next_action && <p className="mt-2 text-xs font-medium text-primary">Next: {email.next_action}</p>}
          {email.verification_code && (
            <p className="mt-3 text-xs text-muted-foreground">Verification code: <span className="font-mono tracking-[0.2em]">••••••</span> (hidden for your security)</p>
          )}

          {/* Plain-text rendering only: React escapes the string, so no HTML
              from the email can ever be injected. whitespace-pre-wrap keeps
              the original line breaks. */}
          <div className="mt-5 whitespace-pre-wrap break-words rounded-sm border border-rp-rule bg-rp-paper p-4 font-mono text-sm leading-relaxed">
            {body.trim() ? body : "This message has no text content."}
          </div>
        </Card>
      )}
    </div>
  );
}

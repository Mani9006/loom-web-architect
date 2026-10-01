import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { toUserFacingError } from "@/lib/user-facing-error";

interface Connection {
  id: string;
  gmail_email: string;
  enabled: boolean;
  last_polled_at: string | null;
  token_expires_at: string | null;
}

interface GmailConnectCardProps {
  sessionId: string;
  onConnectionChange?: (connected: boolean) => void;
  onPollComplete?: () => void | Promise<void>;
}

export default function GmailConnectCard({ sessionId, onConnectionChange, onPollComplete }: GmailConnectCardProps) {
  const { toast } = useToast();
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    // Select only columns present in every deployed shape of
    // mc_gmail_connections (PROD has no status/last_error_* columns, DEV's
    // health shape does). Selecting a missing column makes PostgREST return
    // 400; combined with the error handling below, that used to render a
    // healthy connection as "Not connected".
    const { data, error } = await supabase
      .from("mc_gmail_connections")
      .select("id,gmail_email,enabled,last_polled_at,token_expires_at")
      .eq("session_id", sessionId)
      .eq("enabled", true)
      .maybeSingle();
    if (error) {
      // A read failure (network blip, auth-token refresh race, transient
      // PostgREST error) is NOT proof of disconnection. Keep the last known
      // connection state, keep auto-polling alive, and offer a retry ,
      // never fall through to the "Connect Gmail" branch on an error.
      console.error("gmail connection load", error);
      setLoadError(true);
      setLoading(false);
      return;
    }
    setConn(data as Connection | null);
    onConnectionChange?.(Boolean(data?.enabled));
    setLoading(false);
  }, [onConnectionChange, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mc-gmail-connect", {
        body: { session_id: sessionId, return_to: `${window.location.origin}/inbox` },
      });
      if (error) throw error;
      if (!data?.auth_url) throw new Error("Inbox connection could not be started");
      window.location.assign(data.auth_url);
    } catch (e) {
      const safeError = toUserFacingError(e, {
        operation: "connect_application_inbox",
        defaultMessage: "Inbox connection could not be started.",
      });
      toast({ title: "Couldn't connect inbox", description: safeError.message, variant: "destructive" });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!conn) return;
    if (!confirm("Disconnect Gmail from this session? Auto-status updates from email will stop.")) return;
    setBusy(true);
    const { error } = await supabase.from("mc_gmail_connections").delete().eq("id", conn.id);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't disconnect inbox", description: "Try again in a moment.", variant: "destructive" });
      return;
    }
    setConn(null);
    onConnectionChange?.(false);
  }

  async function pollNow() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mc-gmail-poll", {});
      if (error) throw error;
      const processed = Number(data?.processed || 0);
      const updates = Number(data?.status_updates || 0);
      const failureCodes = Array.isArray(data?.failure_codes) ? data.failure_codes.map(String) : [];
      if (failureCodes.includes("INBOX_RECONNECT_REQUIRED")) {
        await load();
        toast({
          title: "Reconnect Gmail",
          description: "Your previous read-only Gmail permission can no longer be used. Connect it again to continue application verification.",
          variant: "destructive",
        });
        return;
      }
      if (Number(data?.failed || 0) > 0) {
        throw new Error("Inbox check did not complete");
      }
      toast({
        title: "Inbox checked",
        description: processed
          ? `${processed} relevant message${processed === 1 ? "" : "s"} found${updates ? ` · ${updates} status update${updates === 1 ? "" : "s"}` : ""}.`
          : "No new application messages were found.",
      });
      await load();
      await onPollComplete?.();
    } catch (e) {
      const safeError = toUserFacingError(e, {
        operation: "poll_application_inbox",
        defaultMessage: "Your inbox could not be checked right now.",
      });
      toast({ title: "Inbox check failed", description: safeError.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  if (loadError && !conn) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="font-medium text-sm">Application inbox</h4>
            <p className="mt-1 text-xs text-muted-foreground">The connection status could not be loaded.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm">Connected application inbox</h4>
            {conn ? (
              <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" /> Not connected
              </Badge>
            )}
          </div>
          {conn ? (
            <>
              <p className="text-xs text-muted-foreground">
                Connected as <strong>{conn.gmail_email}</strong>. ResumePreps checks only for messages that
                match jobs in this workspace, extracts short-lived verification codes, and keeps application
                statuses current. Access is read-only; ResumePreps cannot send or delete email.
              </p>
              {conn.last_polled_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last checked {new Date(conn.last_polled_at).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={pollNow} disabled={busy}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy ? "animate-spin" : ""}`} /> Check now
                </Button>
                <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy} className="text-destructive">
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Use the same Google account you use for ResumePreps. Google will ask once for a separate,
                read-only Gmail permission to capture application confirmations, short-lived codes,
                interview requests, assessments, offers, and status changes in one place.
              </p>
              <Button size="sm" onClick={connect} disabled={busy} className="mt-3">
                Connect Gmail with Google
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

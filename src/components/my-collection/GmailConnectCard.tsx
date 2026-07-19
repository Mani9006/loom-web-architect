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
  token_expires_at: string;
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

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("mc_gmail_connections")
      .select("id,gmail_email,enabled,last_polled_at,token_expires_at")
      .eq("session_id", sessionId)
      .maybeSingle();
    setConn(data as Connection | null);
    onConnectionChange?.(Boolean(data));
    setLoading(false);
  }, [onConnectionChange, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mc-gmail-connect", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
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
    await supabase.from("mc_gmail_connections").delete().eq("id", conn.id);
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

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm">Connected application inbox</h4>
            {conn ? (
              <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
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
                <p className="text-[10px] text-muted-foreground mt-1">
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
                Link Gmail with read-only permission to capture application confirmations, short-lived codes,
                interview requests, assessments, offers, and status changes in one place.
              </p>
              <Button size="sm" onClick={connect} disabled={busy} className="mt-3">
                Connect inbox
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

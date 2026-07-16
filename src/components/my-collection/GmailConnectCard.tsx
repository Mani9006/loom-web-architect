import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface Connection {
  id: string;
  gmail_email: string;
  enabled: boolean;
  last_polled_at: string | null;
  token_expires_at: string;
}

export default function GmailConnectCard({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await (supabase as any)
      .from("mc_gmail_connections")
      .select("id,gmail_email,enabled,last_polled_at,token_expires_at")
      .eq("session_id", sessionId)
      .maybeSingle();
    setConn(data as Connection | null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  async function connect() {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("mc-gmail-connect", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
    } catch (e) {
      toast({
        title: "Couldn't start Gmail flow",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!conn) return;
    if (!confirm("Disconnect Gmail from this session? Auto-status updates from email will stop.")) return;
    setBusy(true);
    const { error } = await (supabase as any).from("mc_gmail_connections").delete().eq("id", conn.id);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't disconnect", description: error.message, variant: "destructive" });
      return;
    }
    setConn(null);
  }

  async function pollNow() {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("mc-gmail-poll", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      toast({ title: "Inbox checked", description: "Checked your connected inbox for updates." });
      await load();
    } catch (e) {
      toast({
        title: "Poll failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
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
            <h4 className="font-medium text-sm">Gmail integration</h4>
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
                Connected as <strong>{conn.gmail_email}</strong>. The agent reads incoming emails about your
                applications and auto-moves cards on the board (Interview / Take-home / Reject / Offer).
                Read-only access — never sends mail.
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
                Connect Gmail (read-only) so the agent can move job cards automatically when recruiters reply.
                Auto-progresses to Interview / Take-home / Offer / Rejected based on the AI's classification of
                each email's content.
              </p>
              <Button size="sm" onClick={connect} disabled={busy} className="mt-3">
                Connect Gmail
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

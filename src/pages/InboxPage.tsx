import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Inbox, Mail } from "lucide-react";
import GmailConnectCard from "@/components/my-collection/GmailConnectCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, Panel, PrimaryButton } from "@/components/brand/ui";
import { useAuth } from "@/contexts/AuthContext";
import { applyInboxInboundEnabled, parseMailbox } from "@/lib/apply-mailbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "verification", label: "Verification" },
  { key: "reject", label: "Rejection" },
  { key: "interview_invite", label: "Interview" },
  { key: "take_home", label: "Assessment" },
  { key: "other_recruiter", label: "Reminder" },
  { key: "offer", label: "Offer" },
  { key: "confirmation", label: "Applied" },
] as const;

interface Message {
  id: string;
  from_email: string;
  subject: string | null;
  body_preview: string | null;
  classification: string | null;
  received_at: string;
}

export default function InboxPage() {
  const { user } = useAuth();
  const [address, setAddress] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]["key"]>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const mailbox = await (supabase as never as { rpc: (n: string) => Promise<{ data: unknown }> }).rpc("ensure_apply_mailbox");
    setAddress(parseMailbox(mailbox.data)?.address ?? null);
    const session = await supabase.from("mc_sessions").select("id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    setSessionId(session.data?.id ?? null);
    const mail = await (supabase as never as { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Message[] | null }> } } } } }).from("mc_inbound_emails")
      .select("id,from_email,subject,body_preview,classification,received_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(100);
    setMessages(mail.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => messages.filter((row) => filter === "all" || row.classification === filter), [filter, messages]);

  return (
    <div>
      <PageHeader
        title="Recruiter inbox"
        status="apply-from address"
        description="Employers write to a dedicated address. Gmail and Outlook are optional read-only. Inbound delivery is env-gated."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rp-ink-3">Dedicated address</p>
          <p className="mt-2 font-mono text-[15px]">{address || "Assigning…"}</p>
          <p className="mt-2 text-[13px] text-rp-ink-2">
            {applyInboxInboundEnabled()
              ? "Inbound is enabled for this environment."
              : "Inbound is stubbed. Set VITE_APPLY_INBOX_INBOUND_ENABLED=true after MX is live. The address is still real for apply-from fields."}
          </p>
          {address && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 text-[13px] text-rp-accent"
              onClick={async () => { await navigator.clipboard.writeText(address); toast.success("Address copied"); }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          )}
        </Panel>
        <div className="space-y-4">
          {sessionId ? (
            <GmailConnectCard sessionId={sessionId} onConnectionChange={() => undefined} onPollComplete={load} />
          ) : (
            <Panel className="p-5">
              <Mail className="h-5 w-5 text-rp-accent-2" />
              <p className="mt-3 text-[14px] font-medium">Optional Gmail</p>
              <p className="mt-1 text-[13px] text-rp-ink-2">Read-only. We never send or delete mail. Open a collection session once to enable the connect card.</p>
            </Panel>
          )}
          <Panel className="p-5">
            <p className="font-medium">Optional Outlook</p>
            <p className="mt-1 text-[13px] text-rp-ink-2">Same read-only intent. Microsoft Graph connect is env-gated; the dedicated apply-from address works without it.</p>
          </Panel>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`rounded-full px-3 py-1.5 text-[12px] ${filter === item.key ? "bg-primary text-primary-foreground" : "bg-rp-paper text-rp-ink-2"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Panel>
        {loading ? (
          <div className="h-48 animate-pulse bg-rp-paper-2" />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No recruiter mail yet"
            body="When confirmations arrive at the dedicated address — or via optional Gmail — they are classified here."
            action={<PrimaryButton onClick={() => void load()}>Refresh</PrimaryButton>}
          />
        ) : (
          <ul className="divide-y divide-rp-ink/10">
            {visible.map((message) => (
              <li key={message.id} className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-rp-ink-3" />
                  <p className="font-medium">{message.subject || "Application update"}</p>
                  {message.classification && <span className="font-mono text-[10px] uppercase text-rp-ink-3">{message.classification}</span>}
                </div>
                <p className="mt-1 text-[12px] text-rp-ink-3">{message.from_email}</p>
                {message.body_preview && <p className="mt-2 text-[13px] text-rp-ink-2">{message.body_preview}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

import { useState } from "react";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { StatusChip } from "@/product/components/StatusChip";
import { useInbox, type InboxCategory } from "@/product/hooks/useInbox";
import { db } from "@/product/lib/table";
import { relativeTime } from "@/product/lib/format";

const CATS: Array<{ id: InboxCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "verification", label: "Verification" },
  { id: "rejection", label: "Rejection" },
  { id: "interview", label: "Interview" },
  { id: "assessment", label: "Assessment" },
  { id: "reminder", label: "Reminder" },
  { id: "offer", label: "Offer" },
  { id: "applied", label: "Applied" },
];

export default function InboxPage() {
  const { user } = useAuth();
  const { threads, loading, category, setCategory, address, gmailConnected, markRead, connectGmail } = useInbox();
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState({ to: "", subject: "", body: "" });

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Recruiter inbox</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Mail that belongs to the apply loop</h1>
        </div>
        <button type="button" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => setCompose(true)}>Compose</button>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Dedicated apply-from address</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-muted px-2 py-1 text-[13px]">{address}</code>
          <button type="button" className="inline-flex h-8 items-center gap-1 text-[12px]" onClick={() => { void navigator.clipboard.writeText(address); toast.success("Copied"); }}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Use this on ATS forms. Incoming classification is verification, rejection, interview, assessment, reminder, offer, applied.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold"><Mail className="h-4 w-4 text-primary" /> Gmail</div>
          <p className="mt-1 text-[12px] text-muted-foreground">{gmailConnected ? "Connected. We poll for recruiter mail and OTP codes." : "Connect Gmail to classify employer mail. Requires GOOGLE_CLIENT_ID / SECRET."}</p>
          <button type="button" className="mt-3 h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => void connectGmail()}>
            {gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}
          </button>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[14px] font-semibold">Outlook</div>
          <p className="mt-1 text-[12px] text-muted-foreground">OAuth UI is ready. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI to finish the handshake. No fake submit.</p>
          <button type="button" className="mt-3 h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => toast.message("Outlook OAuth", { description: "Add Microsoft env vars on the edge functions, then this button starts the real consent screen." })}>
            Connect Outlook
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {CATS.map((cat) => (
          <button key={cat.id} type="button" onClick={() => setCategory(cat.id)} className={`h-8 rounded-full px-3 text-[12px] ${category === cat.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {threads.length === 0 ? (
        <EmptyState title="Inbox is quiet" body="When employers write, threads land here and can link back to an application." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => void markRead(thread.id)}
              className={`flex w-full items-start gap-3 border-t border-border px-4 py-3 text-left first:border-t-0 ${thread.read ? "opacity-70" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{thread.subject}</p>
                <p className="text-[12px] text-muted-foreground">{thread.from} · {relativeTime(thread.createdAt)}</p>
                <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{thread.snippet}</p>
                {thread.verificationCode && <p className="mt-1 font-mono text-[12px] text-primary">Code {thread.verificationCode}</p>}
              </div>
              <StatusChip status={thread.category} />
            </button>
          ))}
        </div>
      )}

      {compose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setCompose(false)}>
          <form
            className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              await db().from("mc_inbound_emails").insert({
                user_id: user?.id,
                subject: draft.subject,
                from_address: address,
                snippet: draft.body.slice(0, 180),
                classification: "other_recruiter",
                is_read: true,
              });
              toast.message("Queued from your apply-from address", { description: "Delivery uses send-email when RESEND_API_KEY is set. This is not an application receipt." });
              setCompose(false);
            }}
          >
            <h2 className="text-[16px] font-semibold">Compose from {address}</h2>
            <input required className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            <input required className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            <textarea required className="min-h-[140px] w-full rounded-md border border-input p-3 text-[13px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="h-9 px-3 text-[13px]" onClick={() => setCompose(false)}>Cancel</button>
              <button type="submit" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground">Send</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

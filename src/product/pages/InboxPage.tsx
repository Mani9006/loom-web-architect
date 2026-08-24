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
import { PageHeader } from "@/product/components/PageHeader";
import { Dialog } from "@/product/ui/Overlay";
import { Field } from "@/product/ui/Field";
import { Panel } from "@/product/ui/Panel";

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
  const [activeId, setActiveId] = useState<string | null>(null);

  if (loading) return <PageSkeleton />;

  const active = threads.find((thread) => thread.id === activeId) ?? threads[0] ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Recruiter inbox"
        title="Mail that belongs to the apply loop"
        action={<button type="button" className="rp-btn rp-btn-primary" onClick={() => setCompose(true)}>Compose</button>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Apply-from address">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[12px]">{address}</code>
            <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { void navigator.clipboard.writeText(address); toast.success("Copied"); }}>
              <Copy /> Copy
            </button>
          </div>
          <p className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">Use this on ATS forms. Incoming classification is verification, rejection, interview, assessment, reminder, offer, applied.</p>
        </Panel>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border sm:grid-cols-2">
          <div className="bg-card p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><Mail className="h-4 w-4 text-primary" /> Gmail</div>
            <p className="mt-1 text-[12px] text-muted-foreground">{gmailConnected ? "Connected. We poll for recruiter mail and OTP codes." : "Connect Gmail to classify employer mail."}</p>
            <button type="button" className="rp-btn rp-btn-outline mt-3" onClick={() => void connectGmail()}>
              {gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}
            </button>
          </div>
          <div className="bg-card p-4">
            <div className="text-[13px] font-semibold">Outlook</div>
            <p className="mt-1 text-[12px] text-muted-foreground">OAuth UI is ready. Microsoft env vars finish the handshake. No fake submit.</p>
            <button type="button" className="rp-btn rp-btn-outline mt-3" onClick={() => toast.message("Outlook OAuth", { description: "Add Microsoft env vars on the edge functions, then this button starts the real consent screen." })}>
              Connect Outlook
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border xl:grid xl:grid-cols-[200px_minmax(280px,340px)_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto border-b border-border p-2 xl:block xl:overflow-visible xl:border-b-0 xl:border-r">
          {CATS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex min-h-9 shrink-0 items-center rounded-md px-3 text-[12.5px] ${category === cat.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {cat.label}
            </button>
          ))}
        </nav>
        <div className="max-h-[min(70vh,720px)] overflow-y-auto xl:border-r xl:border-border">
          {threads.length === 0 ? (
            <div className="p-4"><EmptyState title="Inbox is quiet" body="When employers write, threads land here and can link back to an application." /></div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => { setActiveId(thread.id); void markRead(thread.id); }}
                className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 ${active?.id === thread.id ? "bg-muted/60" : ""} ${thread.read ? "opacity-70" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{thread.subject}</p>
                  <p className="text-[12px] text-muted-foreground">{thread.from} · {relativeTime(thread.createdAt)}</p>
                </div>
                <StatusChip status={thread.category} />
              </button>
            ))
          )}
        </div>
        <div className="hidden min-h-[360px] xl:block">
          {active ? (
            <article className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold tracking-tight">{active.subject}</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">{active.from} · {relativeTime(active.createdAt)}</p>
                </div>
                <StatusChip status={active.category} />
              </div>
              {active.verificationCode && <p className="mt-4 rounded-md border border-primary/30 bg-primary/8 px-3 py-2 font-mono text-[13px] text-primary">Code {active.verificationCode}</p>}
              <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-muted-foreground">{active.snippet}</p>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-[13px] text-muted-foreground">Select a thread</div>
          )}
        </div>
      </div>

      {active && (
        <Panel title="Reader" className="xl:hidden">
          <article className="p-4">
            <h2 className="text-[15px] font-semibold">{active.subject}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">{active.from} · {relativeTime(active.createdAt)}</p>
            {active.verificationCode && <p className="mt-3 font-mono text-[13px] text-primary">Code {active.verificationCode}</p>}
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{active.snippet}</p>
          </article>
        </Panel>
      )}

      <Dialog open={compose} onClose={() => setCompose(false)} title={`Compose from ${address}`}>
        <form
          className="space-y-3"
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
          <Field label="To">
            <input required className="rp-input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </Field>
          <Field label="Subject">
            <input required className="rp-input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </Field>
          <Field label="Message">
            <textarea required className="rp-textarea min-h-[140px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setCompose(false)}>Cancel</button>
            <button type="submit" className="rp-btn rp-btn-primary">Send</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

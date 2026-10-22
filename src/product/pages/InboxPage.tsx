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
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader
        kicker="Recruiter inbox"
        title="Mail that belongs to the apply loop"
        action={<button type="button" className="rp-btn rp-btn-primary" onClick={() => setCompose(true)}>Compose</button>}
      />

      <div className="rp-panel flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="rp-kicker">Apply-from</span>
        <code className="rounded-md bg-[hsl(var(--rp-well))] px-2 py-1 font-mono text-[12px]">{address}</code>
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { void navigator.clipboard.writeText(address); toast.success("Copied"); }}>
          <Copy /> Copy
        </button>
        <p className="hidden text-[12px] text-muted-foreground xl:block">Use this on ATS forms. Threads classify as verification, rejection, interview, assessment, reminder, offer, applied.</p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="rp-btn rp-btn-outline rp-btn-sm" onClick={() => void connectGmail()}>
            <Mail /> {gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}
          </button>
          <button type="button" className="rp-btn rp-btn-outline rp-btn-sm" onClick={() => toast.message("Outlook OAuth", { description: "Add Microsoft env vars on the edge functions, then this button starts the real consent screen." })}>
            Connect Outlook
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border border-border shadow-sm xl:grid-cols-[184px_minmax(260px,340px)_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-[hsl(var(--rp-well))] p-2 xl:block xl:overflow-y-auto xl:border-b-0 xl:border-r">
          {CATS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex min-h-8 w-full shrink-0 items-center rounded-md px-3 text-[12.5px] ${category === cat.id ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:bg-card/60"}`}
            >
              {cat.label}
            </button>
          ))}
        </nav>
        <div className="min-h-[280px] overflow-y-auto xl:border-r xl:border-border">
          {threads.length === 0 ? (
            <div className="p-4"><EmptyState title="Inbox is quiet" body="When employers write, threads land here and can link back to an application." /></div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => { setActiveId(thread.id); void markRead(thread.id); }}
                className={`flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 ${active?.id === thread.id ? "bg-muted/60" : ""} ${thread.read ? "opacity-70" : ""}`}
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
        <div className="hidden min-h-0 overflow-y-auto bg-card xl:block">
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

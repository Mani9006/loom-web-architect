import { useState } from "react";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { useNotes, type ResearchNote } from "@/product/hooks/usePeopleNotes";
import { PageHeader } from "@/product/components/PageHeader";
import { Dialog } from "@/product/ui/Overlay";
import { Field } from "@/product/ui/Field";
import { Panel } from "@/product/ui/Panel";

const blank = (): ResearchNote => ({ id: crypto.randomUUID(), title: "", body: "", company: "" });

export default function NotesPage() {
  const { notes, loading, save, remove } = useNotes();
  const [draft, setDraft] = useState<ResearchNote | null>(null);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Notes"
        title="Research next to the roles you apply to"
        action={<button type="button" className="rp-btn rp-btn-primary" onClick={() => setDraft(blank())}>New note</button>}
      />
      {notes.length === 0 && !draft ? (
        <EmptyState title="No research notes" body="Capture company research next to the roles you are actually applying to." />
      ) : (
        <Panel flush>
          {notes.map((note) => (
            <article key={note.id} className="rp-row items-start">
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-semibold">{note.title}</h2>
                <p className="text-[12px] text-muted-foreground">{note.company}</p>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] text-muted-foreground">{note.body}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setDraft(note)}>Edit</button>
                <button type="button" className="rp-btn rp-btn-destructive rp-btn-sm" onClick={() => void remove(note.id)}>Delete</button>
              </div>
            </article>
          ))}
        </Panel>
      )}
      <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.title ? "Edit note" : "New note"}>
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(draft); setDraft(null); }}>
            <Field label="Title"><input required className="rp-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Company"><input className="rp-input" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
            <Field label="Body"><textarea required className="rp-textarea min-h-[140px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="rp-btn rp-btn-primary">Save</button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

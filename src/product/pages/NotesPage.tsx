import { useState } from "react";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { useNotes, type ResearchNote } from "@/product/hooks/usePeopleNotes";
import { PageHeader } from "@/product/components/PageHeader";

const blank = (): ResearchNote => ({ id: crypto.randomUUID(), title: "", body: "", company: "" });

export default function NotesPage() {
  const { notes, loading, save, remove } = useNotes();
  const [draft, setDraft] = useState<ResearchNote | null>(null);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Notes"
        title="Research next to the roles you apply to"
        action={<button type="button" className="h-9 bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => setDraft(blank())}>New note</button>}
      />
      {notes.length === 0 && !draft ? (
        <EmptyState title="No research notes" body="Capture company research next to the roles you are actually applying to." />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <article key={note.id} className="border-b border-border py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{note.title}</h2>
                  <p className="text-[12px] text-muted-foreground">{note.company}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="text-[12px] text-primary" onClick={() => setDraft(note)}>Edit</button>
                  <button type="button" className="text-[12px] text-rose-600" onClick={() => void remove(note.id)}>Delete</button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-muted-foreground">{note.body}</p>
            </article>
          ))}
        </div>
      )}
      {draft && (
        <form className="space-y-2 rounded-xl border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); void save(draft); setDraft(null); }}>
          <input required className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
          <textarea required className="min-h-[140px] w-full rounded-md border border-input p-3 text-[13px]" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground">Save</button>
            <button type="button" className="h-9 px-3 text-[13px]" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

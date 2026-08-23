import { useState } from "react";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { usePeople, type Person } from "@/product/hooks/usePeopleNotes";

const blank = (): Person => ({
  id: crypto.randomUUID(),
  name: "",
  company: "",
  title: "",
  linkedinUrl: "",
  email: "",
  notes: "",
});

export default function PeoplePage() {
  const { people, loading, save, remove } = usePeople();
  const [draft, setDraft] = useState<Person | null>(null);

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">People</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Networking lite</h1>
        </div>
        <button type="button" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => setDraft(blank())}>Add person</button>
      </header>
      {people.length === 0 && !draft ? (
        <EmptyState title="No people yet" body="Track hiring managers and peers from companies already in your pipeline." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {people.map((person) => (
            <article key={person.id} className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-[15px] font-semibold">{person.name}</h2>
              <p className="text-[12px] text-muted-foreground">{person.title} · {person.company}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="text-[12px] text-primary" onClick={() => setDraft(person)}>Edit</button>
                <button type="button" className="text-[12px] text-rose-600" onClick={() => void remove(person.id)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {draft && (
        <form
          className="space-y-2 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => { e.preventDefault(); void save(draft); setDraft(null); }}
        >
          {(["name", "title", "company", "email", "linkedinUrl"] as const).map((key) => (
            <input key={key} required={key === "name"} className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder={key} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
          ))}
          <textarea className="min-h-[80px] w-full rounded-md border border-input p-3 text-[13px]" placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground">Save</button>
            <button type="button" className="h-9 px-3 text-[13px]" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

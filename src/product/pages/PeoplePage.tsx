import { useState } from "react";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { usePeople, type Person } from "@/product/hooks/usePeopleNotes";
import { PageHeader } from "@/product/components/PageHeader";
import { Dialog } from "@/product/ui/Overlay";
import { Field } from "@/product/ui/Field";
import { DataTable } from "@/product/ui/DataTable";
import { Panel } from "@/product/ui/Panel";

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
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader
        kicker="People"
        title="Hiring managers and peers"
        action={<button type="button" className="rp-btn rp-btn-primary" onClick={() => setDraft(blank())}>Add person</button>}
      />
      {people.length === 0 && !draft ? (
        <EmptyState title="No people yet" body="Track hiring managers and peers from companies already in your pipeline." />
      ) : (
        <Panel flush className="min-h-0 flex-1">
          <DataTable
            columns={[
              { key: "name", header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
              { key: "title", header: "Title", cell: (row) => row.title },
              { key: "company", header: "Company", cell: (row) => row.company },
              { key: "email", header: "Email", cell: (row) => <span className="text-muted-foreground">{row.email || "—"}</span>, hideOnMobile: true },
              {
                key: "actions",
                header: "",
                cell: (row) => (
                  <div className="flex justify-end gap-2">
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={(e) => { e.stopPropagation(); setDraft(row); }}>Edit</button>
                    <button type="button" className="rp-btn rp-btn-destructive rp-btn-sm" onClick={(e) => { e.stopPropagation(); void remove(row.id); }}>Remove</button>
                  </div>
                ),
              },
            ]}
            rows={people}
            rowKey={(row) => row.id}
            onRowClick={(row) => setDraft(row)}
          />
        </Panel>
      )}
      <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.name ? "Edit person" : "Add person"}>
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(draft); setDraft(null); }}>
            <Field label="Name"><input required className="rp-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Title"><input className="rp-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Company"><input className="rp-input" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
            <Field label="Email"><input className="rp-input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="LinkedIn"><input className="rp-input" value={draft.linkedinUrl} onChange={(e) => setDraft({ ...draft, linkedinUrl: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="rp-textarea" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
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

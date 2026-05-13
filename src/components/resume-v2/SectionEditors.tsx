/**
 * Section editors for the v2 resume builder.
 *
 * Each editor is a controlled form that reads from + writes to the Zustand
 * store. No prop drilling — components subscribe to the slice they care about.
 */
import { useShallow } from "zustand/react/shallow";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useResumeStore } from "@/lib/resume-store";
import { SKILL_CATEGORY_LABELS } from "@/types/resume";
import type {
  ExperienceEntry,
  EducationEntry,
  CertificationEntry,
  ProjectEntry,
} from "@/types/resume";

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

// ─── Header ────────────────────────────────────────────────────────────────

export function HeaderEditor() {
  const { header, updateHeader } = useResumeStore(
    useShallow((s) => ({ header: s.resume.header, updateHeader: s.updateHeader })),
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Full name">
        <Input value={header.name} onChange={(e) => updateHeader({ name: e.target.value })} />
      </Field>
      <Field label="Headline / title">
        <Input value={header.title} onChange={(e) => updateHeader({ title: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input type="email" value={header.email} onChange={(e) => updateHeader({ email: e.target.value })} />
      </Field>
      <Field label="Phone">
        <Input value={header.phone} onChange={(e) => updateHeader({ phone: e.target.value })} />
      </Field>
      <Field label="Location">
        <Input value={header.location} onChange={(e) => updateHeader({ location: e.target.value })} />
      </Field>
      <Field label="LinkedIn (URL)">
        <Input value={header.linkedin} onChange={(e) => updateHeader({ linkedin: e.target.value })} />
      </Field>
    </div>
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────

export function SummaryEditor() {
  const { summary, updateSummary } = useResumeStore(
    useShallow((s) => ({ summary: s.resume.summary, updateSummary: s.updateSummary })),
  );
  return (
    <Field label="Professional summary" hint="2–3 sentences. Lead with role + years + key impact.">
      <Textarea
        rows={5}
        value={summary}
        onChange={(e) => updateSummary(e.target.value)}
        placeholder="Senior AI engineer with 8 years building production NLP pipelines. Shipped..."
      />
    </Field>
  );
}

// ─── Experience ────────────────────────────────────────────────────────────

export function ExperienceEditor() {
  const { items, upsert, remove } = useResumeStore(
    useShallow((s) => ({
      items: s.resume.experience,
      upsert: s.upsertExperience,
      remove: s.removeExperience,
    })),
  );

  const add = () =>
    upsert({
      id: newId(),
      role: "",
      company_or_client: "",
      start_date: "",
      end_date: "",
      location: "",
      bullets: [""],
    });

  return (
    <div className="space-y-4">
      {items.map((e) => (
        <ExperienceCard key={e.id} entry={e} onChange={upsert} onRemove={() => remove(e.id)} />
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4 mr-1" /> Add experience
      </Button>
    </div>
  );
}

function ExperienceCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: ExperienceEntry;
  onChange: (e: ExperienceEntry) => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<ExperienceEntry>) => onChange({ ...entry, ...patch });
  const updBullet = (i: number, v: string) => {
    const bullets = entry.bullets.slice();
    bullets[i] = v;
    upd({ bullets });
  };
  const addBullet = () => upd({ bullets: [...entry.bullets, ""] });
  const rmBullet = (i: number) => upd({ bullets: entry.bullets.filter((_, j) => j !== i) });

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <GripVertical className="size-4 text-muted-foreground mt-2 shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Field label="Role">
            <Input value={entry.role} onChange={(e) => upd({ role: e.target.value })} />
          </Field>
          <Field label="Company">
            <Input value={entry.company_or_client} onChange={(e) => upd({ company_or_client: e.target.value })} />
          </Field>
          <Field label="Start">
            <Input value={entry.start_date} onChange={(e) => upd({ start_date: e.target.value })} placeholder="Jan 2023" />
          </Field>
          <Field label="End">
            <Input value={entry.end_date} onChange={(e) => upd({ end_date: e.target.value })} placeholder="Present" />
          </Field>
          <Field label="Location" className="col-span-2">
            <Input value={entry.location} onChange={(e) => upd({ location: e.target.value })} />
          </Field>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Bullets (one impact per line)</Label>
        {entry.bullets.map((b, i) => (
          <div key={i} className="flex gap-2">
            <Textarea
              rows={2}
              value={b}
              onChange={(e) => updBullet(i, e.target.value)}
              placeholder="Reduced inference cost 42% by quantizing the BERT classifier and migrating to Triton..."
              className="text-sm"
            />
            <Button variant="ghost" size="icon" onClick={() => rmBullet(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addBullet}>
          <Plus className="size-3.5 mr-1" /> Add bullet
        </Button>
      </div>
    </div>
  );
}

// ─── Education ─────────────────────────────────────────────────────────────

export function EducationEditor() {
  const { items, upsert, remove } = useResumeStore(
    useShallow((s) => ({ items: s.resume.education, upsert: s.upsertEducation, remove: s.removeEducation })),
  );
  const add = () =>
    upsert({ id: newId(), degree: "", field: "", institution: "", gpa: "", graduation_date: "", location: "" });

  return (
    <div className="space-y-4">
      {items.map((e) => (
        <EducationCard key={e.id} entry={e} onChange={upsert} onRemove={() => remove(e.id)} />
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4 mr-1" /> Add education
      </Button>
    </div>
  );
}

function EducationCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: EducationEntry;
  onChange: (e: EducationEntry) => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<EducationEntry>) => onChange({ ...entry, ...patch });
  return (
    <div className="border rounded-md p-3 grid grid-cols-2 gap-3">
      <Field label="Institution" className="col-span-2">
        <Input value={entry.institution} onChange={(e) => upd({ institution: e.target.value })} />
      </Field>
      <Field label="Degree">
        <Input value={entry.degree} onChange={(e) => upd({ degree: e.target.value })} placeholder="B.S." />
      </Field>
      <Field label="Field">
        <Input value={entry.field} onChange={(e) => upd({ field: e.target.value })} placeholder="Computer Science" />
      </Field>
      <Field label="Graduation">
        <Input value={entry.graduation_date} onChange={(e) => upd({ graduation_date: e.target.value })} />
      </Field>
      <Field label="GPA (optional)">
        <Input value={entry.gpa} onChange={(e) => upd({ gpa: e.target.value })} />
      </Field>
      <Field label="Location" className="col-span-2">
        <Input value={entry.location} onChange={(e) => upd({ location: e.target.value })} />
      </Field>
      <div className="col-span-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-3.5 mr-1" /> Remove
        </Button>
      </div>
    </div>
  );
}

// ─── Skills ────────────────────────────────────────────────────────────────

export function SkillsEditor() {
  const { skills, setSkills } = useResumeStore(
    useShallow((s) => ({ skills: s.resume.skills, setSkills: s.setSkills })),
  );

  const updCategory = (cat: string, value: string) => {
    const list = value.split(",").map((v) => v.trim()).filter(Boolean);
    setSkills({ ...skills, [cat]: list });
  };
  const removeCategory = (cat: string) => {
    const next = { ...skills };
    delete next[cat];
    setSkills(next);
  };
  const addCategory = () => {
    const cat = prompt("New skill category key (e.g. 'machine_learning'):")?.trim();
    if (!cat) return;
    if (skills[cat]) return;
    setSkills({ ...skills, [cat]: [] });
  };

  const cats = Object.keys(skills);

  return (
    <div className="space-y-3">
      {cats.length === 0 && (
        <p className="text-sm text-muted-foreground">No skill categories yet. Add one to get started.</p>
      )}
      {cats.map((cat) => (
        <div key={cat} className="border rounded-md p-3">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-sm font-semibold">{SKILL_CATEGORY_LABELS[cat] ?? cat}</Label>
            <Button variant="ghost" size="icon" onClick={() => removeCategory(cat)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <Input
            value={skills[cat].join(", ")}
            onChange={(e) => updCategory(cat, e.target.value)}
            placeholder="Python, PyTorch, JAX, ..."
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addCategory}>
        <Plus className="size-4 mr-1" /> Add category
      </Button>
    </div>
  );
}

// ─── Projects ──────────────────────────────────────────────────────────────

export function ProjectsEditor() {
  const { items, upsert, remove } = useResumeStore(
    useShallow((s) => ({ items: s.resume.projects, upsert: s.upsertProject, remove: s.removeProject })),
  );
  const add = () => upsert({ id: newId(), title: "", organization: "", date: "", bullets: [""] });

  return (
    <div className="space-y-4">
      {items.map((p) => (
        <ProjectCard key={p.id} entry={p} onChange={upsert} onRemove={() => remove(p.id)} />
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4 mr-1" /> Add project
      </Button>
    </div>
  );
}

function ProjectCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: ProjectEntry;
  onChange: (e: ProjectEntry) => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<ProjectEntry>) => onChange({ ...entry, ...patch });
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title">
          <Input value={entry.title} onChange={(e) => upd({ title: e.target.value })} />
        </Field>
        <Field label="Organization">
          <Input value={entry.organization} onChange={(e) => upd({ organization: e.target.value })} />
        </Field>
        <Field label="Date">
          <Input value={entry.date} onChange={(e) => upd({ date: e.target.value })} />
        </Field>
        <Field label="URL (optional)">
          <Input value={entry.url ?? ""} onChange={(e) => upd({ url: e.target.value })} />
        </Field>
      </div>
      <Field label="Bullets (one per line)">
        <Textarea
          rows={3}
          value={entry.bullets.join("\n")}
          onChange={(e) => upd({ bullets: e.target.value.split("\n").filter(Boolean) })}
        />
      </Field>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-3.5 mr-1" /> Remove
        </Button>
      </div>
    </div>
  );
}

// ─── Certifications ────────────────────────────────────────────────────────

export function CertificationsEditor() {
  const { items, upsert, remove } = useResumeStore(
    useShallow((s) => ({
      items: s.resume.certifications,
      upsert: s.upsertCertification,
      remove: s.removeCertification,
    })),
  );
  const add = () => upsert({ id: newId(), name: "", issuer: "", date: "" });

  return (
    <div className="space-y-3">
      {items.map((c) => (
        <CertCard key={c.id} entry={c} onChange={upsert} onRemove={() => remove(c.id)} />
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4 mr-1" /> Add certification
      </Button>
    </div>
  );
}

function CertCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: CertificationEntry;
  onChange: (e: CertificationEntry) => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<CertificationEntry>) => onChange({ ...entry, ...patch });
  return (
    <div className="border rounded-md p-3 grid grid-cols-3 gap-3">
      <Field label="Name" className="col-span-2">
        <Input value={entry.name} onChange={(e) => upd({ name: e.target.value })} />
      </Field>
      <Field label="Date">
        <Input value={entry.date} onChange={(e) => upd({ date: e.target.value })} />
      </Field>
      <Field label="Issuer" className="col-span-2">
        <Input value={entry.issuer} onChange={(e) => upd({ issuer: e.target.value })} />
      </Field>
      <Field label="URL (optional)">
        <Input value={entry.url ?? ""} onChange={(e) => upd({ url: e.target.value })} />
      </Field>
      <div className="col-span-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-3.5 mr-1" /> Remove
        </Button>
      </div>
    </div>
  );
}

// ─── shared field wrapper ──────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

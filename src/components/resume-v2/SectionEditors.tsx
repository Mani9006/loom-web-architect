/**
 * Section editors for the v2 resume builder.
 *
 * Each editor is a controlled form that reads from + writes to the Zustand
 * store. No prop drilling, components subscribe to the slice they care about.
 */
import { cloneElement, isValidElement, useId, useState, type ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BulletLinesTextarea } from "@/components/shared/BulletLinesTextarea";
import { useResumeStore } from "@/lib/resume-store";
import { CANONICAL_SKILL_CATEGORIES, applySkillCategoryText } from "@/lib/resume-skills";
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
      environment: "",
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
  // Existing DB rows may have malformed entries (e.g. bullets: null,
  // or string fields as null). Coerce defensively before any operation.
  const safe = (v: unknown) => (typeof v === "string" ? v : "");
  const bulletsSafe = Array.isArray(entry.bullets)
    ? entry.bullets.map((b) => safe(b))
    : [];
  const e = {
    ...entry,
    role: safe(entry.role),
    company_or_client: safe(entry.company_or_client),
    start_date: safe(entry.start_date),
    end_date: safe(entry.end_date),
    location: safe(entry.location),
    environment: safe(entry.environment),
    bullets: bulletsSafe,
  };
  const upd = (patch: Partial<ExperienceEntry>) => onChange({ ...e, ...patch });
  const updBullet = (i: number, v: string) => {
    const bullets = e.bullets.slice();
    bullets[i] = v;
    upd({ bullets });
  };
  const addBullet = () => upd({ bullets: [...e.bullets, ""] });
  const rmBullet = (i: number) => upd({ bullets: e.bullets.filter((_, j) => j !== i) });

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <GripVertical className="size-4 text-muted-foreground mt-2 shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Field label="Role">
            <Input value={e.role} onChange={(ev) => upd({ role: ev.target.value })} />
          </Field>
          <Field label="Company">
            <Input value={e.company_or_client} onChange={(ev) => upd({ company_or_client: ev.target.value })} />
          </Field>
          <Field label="Start">
            <Input value={e.start_date} onChange={(ev) => upd({ start_date: ev.target.value })} placeholder="Jan 2023" />
          </Field>
          <Field label="End">
            <Input value={e.end_date} onChange={(ev) => upd({ end_date: ev.target.value })} placeholder="Present" />
          </Field>
          <Field label="Location" className="col-span-2">
            <Input value={e.location} onChange={(ev) => upd({ location: ev.target.value })} />
          </Field>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove experience${e.role || e.company_or_client ? `: ${e.role || e.company_or_client}` : ""}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Bullets (one impact per line)</Label>
        {e.bullets.map((b, i) => (
          <div key={i} className="flex gap-2">
            <Textarea
              aria-label={`Bullet ${i + 1}${e.role ? ` for ${e.role}` : ""}`}
              rows={2}
              value={b}
              onChange={(e) => updBullet(i, e.target.value)}
              placeholder="Reduced inference cost 42% by quantizing the BERT classifier and migrating to Triton..."
              className="text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove bullet ${i + 1}${e.role ? ` from ${e.role}` : ""}`}
              onClick={() => rmBullet(i)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addBullet}>
          <Plus className="size-3.5 mr-1" /> Add bullet
        </Button>
      </div>
      <Field
        label="Environment / technologies"
        hint="Preserved with this role; do not merge it into unrelated skill categories."
      >
        <Textarea
          rows={2}
          value={e.environment ?? ""}
          onChange={(event) => upd({ environment: event.target.value })}
          placeholder="Python, SQL, AWS, Kubernetes, ..."
        />
      </Field>
    </div>
  );
}

// ─── Education ─────────────────────────────────────────────────────────────

export function EducationEditor() {
  const { items, upsert, remove } = useResumeStore(
    useShallow((s) => ({ items: s.resume.education, upsert: s.upsertEducation, remove: s.removeEducation })),
  );
  const add = () =>
    upsert({
      id: newId(), degree: "", field: "", institution: "", gpa: "",
      start_date: "", end_date: "", graduation_date: "", location: "",
    });

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
      <Field label="Start date">
        <Input value={entry.start_date ?? ""} onChange={(e) => upd({ start_date: e.target.value })} placeholder="Jan 2022" />
      </Field>
      <Field label="End / graduation">
        <Input
          value={entry.end_date ?? entry.graduation_date}
          onChange={(e) => upd({ end_date: e.target.value, graduation_date: e.target.value })}
          placeholder="Jul 2023"
        />
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
  const [newCategory, setNewCategory] = useState("");
  // Raw text per category while the user is typing. It is split + normalized
  // only on blur/Enter so commas and spaces are not stripped mid-keystroke.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const clearDraft = (cat: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
  const commitCategory = (cat: string) => {
    const value = drafts[cat];
    if (value === undefined) return;
    setSkills(applySkillCategoryText(skills, cat, value));
    clearDraft(cat);
  };
  const removeCategory = (cat: string) => {
    const next = { ...skills };
    delete next[cat];
    setSkills(next);
    clearDraft(cat);
  };
  const addCategory = () => {
    const cat = newCategory;
    if (!cat) return;
    if (skills[cat]) return;
    setSkills({ ...skills, [cat]: [] });
    setNewCategory("");
  };

  const cats = CANONICAL_SKILL_CATEGORIES.map(({ key }) => key).filter((key) => Array.isArray(skills[key]));
  const available = CANONICAL_SKILL_CATEGORIES.filter(({ key }) => !skills[key]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-rp-rule bg-rp-paper/40 p-3 text-xs leading-relaxed text-rp-ink-2">
        Each skill is stored once in a consistent ATS-readable category. Phrases that are responsibilities rather than skills are removed automatically.
      </div>
      {cats.length === 0 && (
        <p className="text-sm text-muted-foreground">No skill categories yet. Add one to get started.</p>
      )}
      {cats.map((cat) => (
        <div key={cat} className="border rounded-md p-3">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-sm font-semibold">
              {CANONICAL_SKILL_CATEGORIES.find(({ key }) => key === cat)?.label ?? cat}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{skills[cat].length} skills</span>
            </Label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${CANONICAL_SKILL_CATEGORIES.find(({ key }) => key === cat)?.label ?? cat} skills`}
              onClick={() => removeCategory(cat)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <Input
            aria-label={`${CANONICAL_SKILL_CATEGORIES.find(({ key }) => key === cat)?.label ?? cat} skills`}
            value={drafts[cat] ?? skills[cat].join(", ")}
            onChange={(e) => {
              const value = e.target.value;
              setDrafts((prev) => ({ ...prev, [cat]: value }));
            }}
            onBlur={() => commitCategory(cat)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCategory(cat);
              }
            }}
            placeholder="Python, PyTorch, JAX, ..."
          />
        </div>
      ))}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Skill category"
          >
            <option value="">Choose a category</option>
            {available.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={addCategory} disabled={!newCategory}>
            <Plus className="size-4 mr-1" /> Add
          </Button>
        </div>
      )}
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
        <BulletLinesTextarea
          rows={3}
          bullets={entry.bullets}
          onBulletsChange={(bullets) => upd({ bullets })}
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
  const generatedControlId = useId();
  const generatedHintId = useId();
  type LabeledControlProps = { id?: string; "aria-describedby"?: string };
  const childProps = isValidElement(children)
    ? (children as ReactElement<LabeledControlProps>).props
    : null;
  const controlId = childProps?.id ?? generatedControlId;
  const describedBy = [childProps?.["aria-describedby"], hint ? generatedHintId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<LabeledControlProps>, {
      id: controlId,
      "aria-describedby": describedBy,
    })
    : children;

  return (
    <div className={`space-y-1 ${className}`}>
      <Label htmlFor={controlId} className="text-xs font-medium text-muted-foreground">{label}</Label>
      {control}
      {hint && <p id={generatedHintId} className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

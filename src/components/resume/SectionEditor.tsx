import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X, Sparkles, Loader2 } from "lucide-react";
import {
  ResumeJSON, ExperienceEntry, EducationEntry,
  CertificationEntry, ProjectEntry, getSkillCategoryLabel,
} from "@/types/resume";
import { SectionId } from "./SectionNavigator";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface SectionEditorProps {
  section: SectionId;
  data: ResumeJSON;
  onChange: (data: ResumeJSON) => void;
}

export function SectionEditor({ section, data, onChange }: SectionEditorProps) {
  switch (section) {
    case "personal": return <PersonalEditor data={data} onChange={onChange} />;
    case "summary": return <SummaryEditor data={data} onChange={onChange} />;
    case "experience": return <ExperienceEditor data={data} onChange={onChange} />;
    case "education": return <EducationEditor data={data} onChange={onChange} />;
    case "skills": return <SkillsEditor data={data} onChange={onChange} />;
    case "projects": return <ProjectsEditor data={data} onChange={onChange} />;
    case "certifications": return <CertificationsEditor data={data} onChange={onChange} />;
    default: return null;
  }
}

// ===== Personal Info =====
function PersonalEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  const update = (field: keyof ResumeJSON["header"], value: string) =>
    onChange({ ...data, header: { ...data.header, [field]: value } });

  const fields = [
    { label: "Full Name", field: "name" as const, placeholder: "John Doe" },
    { label: "Job Title", field: "title" as const, placeholder: "Senior Data Engineer" },
    { label: "Email", field: "email" as const, placeholder: "john@email.com" },
    { label: "Phone", field: "phone" as const, placeholder: "+1 555-123-4567" },
    { label: "Location", field: "location" as const, placeholder: "Dallas, TX" },
    { label: "LinkedIn", field: "linkedin" as const, placeholder: "linkedin.com/in/johndoe" },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Personal Information</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.field} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
            <Input
              placeholder={f.placeholder}
              value={data.header[f.field]}
              onChange={(e) => update(f.field, e.target.value)}
              className="h-9"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Summary =====
function SummaryEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-foreground">Professional Summary</h3>
      <Textarea
        placeholder="Brief professional summary highlighting your experience, skills, and career goals..."
        value={data.summary}
        onChange={(e) => onChange({ ...data, summary: e.target.value })}
        className="min-h-[120px] text-sm"
      />
    </div>
  );
}

// ===== Experience =====
function ExperienceEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  const updateExp = (id: string, field: keyof ExperienceEntry, value: any) =>
    onChange({ ...data, experience: data.experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)) });

  const addExp = () =>
    onChange({
      ...data,
      experience: [...data.experience, { id: crypto.randomUUID(), role: "", company_or_client: "", start_date: "", end_date: "", location: "", bullets: [] }],
    });

  const removeExp = (id: string) =>
    onChange({ ...data, experience: data.experience.filter((e) => e.id !== id) });

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Work Experience</h3>
      {data.experience.map((exp, idx) => (
        <div key={exp.id} className="p-4 rounded-xl border border-border bg-card space-y-3 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">Position {idx + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => removeExp(exp.id)} className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <InputField label="Job Title" value={exp.role} onChange={(v) => updateExp(exp.id, "role", v)} placeholder="Data Engineer" />
            <InputField label="Company" value={exp.company_or_client} onChange={(v) => updateExp(exp.id, "company_or_client", v)} placeholder="Company Inc." />
            <InputField label="Start Date" value={exp.start_date} onChange={(v) => updateExp(exp.id, "start_date", v)} placeholder="Feb 2024" />
            <InputField label="End Date" value={exp.end_date} onChange={(v) => updateExp(exp.id, "end_date", v)} placeholder="Present" />
            <div className="col-span-2">
              <InputField label="Location" value={exp.location} onChange={(v) => updateExp(exp.id, "location", v)} placeholder="Dallas, TX" />
            </div>
          </div>
          <BulletEditor
            bullets={exp.bullets}
            onChange={(bullets) => updateExp(exp.id, "bullets", bullets)}
            jobTitle={exp.role}
            company={exp.company_or_client}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addExp} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add Experience
      </Button>
    </div>
  );
}

// ===== Bullet Editor with AI Enhance =====
function BulletEditor({ bullets, onChange, jobTitle, company }: { bullets: string[]; onChange: (b: string[]) => void; jobTitle: string; company: string }) {
  const [enhancingIdx, setEnhancingIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);
  const { toast } = useToast();

  const updateBullet = (idx: number, value: string) => {
    const next = [...bullets];
    next[idx] = value;
    onChange(next);
  };

  const addBullet = () => onChange([...bullets, ""]);
  const removeBullet = (idx: number) => onChange(bullets.filter((_, i) => i !== idx));

  const enhanceBullet = async (idx: number) => {
    const bullet = bullets[idx];
    if (!bullet.trim()) return;
    setEnhancingIdx(idx);
    setSuggestions([]);
    setOpenPopoverIdx(idx);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enhance-bullet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ bullet, jobTitle, company }),
      });
      if (!resp.ok) throw new Error("Failed to enhance");
      const result = await resp.json();
      setSuggestions(result.suggestions || []);
    } catch {
      toast({ title: "Enhancement failed", description: "Could not generate suggestions", variant: "destructive" });
      setOpenPopoverIdx(null);
    } finally {
      setEnhancingIdx(null);
    }
  };

  const applySuggestion = (idx: number, suggestion: string) => {
    updateBullet(idx, suggestion);
    setOpenPopoverIdx(null);
    setSuggestions([]);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">Bullet Points</Label>
      {bullets.map((bullet, idx) => (
        <div key={idx} className="flex items-start gap-1.5">
          <span className="text-muted-foreground mt-2.5 text-xs">•</span>
          <Input
            value={bullet}
            onChange={(e) => updateBullet(idx, e.target.value)}
            placeholder="Describe achievement using STAR method..."
            className="h-8 text-sm flex-1"
          />
          <Popover open={openPopoverIdx === idx} onOpenChange={(open) => { if (!open) { setOpenPopoverIdx(null); setSuggestions([]); } }}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-primary/60 hover:text-primary"
                onClick={() => enhanceBullet(idx)}
                disabled={enhancingIdx !== null}
                title="AI Enhance"
              >
                {enhancingIdx === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              </Button>
            </PopoverTrigger>
            {suggestions.length > 0 && (
              <PopoverContent align="end" className="w-96 p-0" sideOffset={4}>
                <div className="p-3 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">AI Suggestions (STAR Method)</p>
                </div>
                <div className="divide-y divide-border">
                  {suggestions.map((s, si) => (
                    <button
                      key={si}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors text-sm"
                      onClick={() => applySuggestion(idx, s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            )}
          </Popover>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeBullet(idx)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addBullet} className="gap-1.5 text-muted-foreground hover:text-foreground text-xs h-7">
        <Plus className="h-3 w-3" /> Add bullet
      </Button>
    </div>
  );
}

// ===== Education =====
function EducationEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  const updateEdu = (id: string, field: keyof EducationEntry, value: string) =>
    onChange({ ...data, education: data.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)) });

  const addEdu = () =>
    onChange({ ...data, education: [...data.education, { id: crypto.randomUUID(), degree: "", field: "", institution: "", gpa: "", graduation_date: "", location: "" }] });

  const removeEdu = (id: string) => onChange({ ...data, education: data.education.filter((e) => e.id !== id) });

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Education</h3>
      {data.education.map((edu, idx) => (
        <div key={edu.id} className="p-4 rounded-xl border border-border bg-card space-y-3 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">Education {idx + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => removeEdu(edu.id)} className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <InputField label="Degree" value={edu.degree} onChange={(v) => updateEdu(edu.id, "degree", v)} placeholder="Master's" />
            <InputField label="Field" value={edu.field} onChange={(v) => updateEdu(edu.id, "field", v)} placeholder="Computer Science" />
            <InputField label="Institution" value={edu.institution} onChange={(v) => updateEdu(edu.id, "institution", v)} placeholder="MIT" />
            <InputField label="Graduation Date" value={edu.graduation_date} onChange={(v) => updateEdu(edu.id, "graduation_date", v)} placeholder="May 2023" />
            <InputField label="GPA" value={edu.gpa} onChange={(v) => updateEdu(edu.id, "gpa", v)} placeholder="3.8" />
            <InputField label="Location" value={edu.location} onChange={(v) => updateEdu(edu.id, "location", v)} placeholder="Cambridge, MA" />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addEdu} className="w-full gap-2"><Plus className="h-4 w-4" /> Add Education</Button>
    </div>
  );
}

// ===== Skills =====
function SkillsEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  const [skillInput, setSkillInput] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [newCatName, setNewCatName] = useState("");

  const addSkill = (cat: string) => {
    if (!skillInput.trim()) return;
    const current = data.skills[cat] || [];
    if (!current.includes(skillInput.trim())) {
      onChange({ ...data, skills: { ...data.skills, [cat]: [...current, skillInput.trim()] } });
    }
    setSkillInput("");
  };

  const removeSkill = (cat: string, skill: string) =>
    onChange({ ...data, skills: { ...data.skills, [cat]: (data.skills[cat] || []).filter((s) => s !== skill) } });

  const removeCat = (cat: string) => {
    const s = { ...data.skills };
    delete s[cat];
    onChange({ ...data, skills: s });
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    const key = newCatName.trim().toLowerCase().replace(/\s+/g, "_").replace(/&/g, "");
    if (!data.skills[key]) onChange({ ...data, skills: { ...data.skills, [key]: [] } });
    setNewCatName("");
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Skills</h3>
      {Object.entries(data.skills).map(([catKey, skills]) => (
        <div key={catKey} className="p-3 rounded-xl border border-border bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{getSkillCategoryLabel(catKey)}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeCat(catKey)}><X className="h-3 w-3" /></Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add skill..."
              value={activeCategory === catKey ? skillInput : ""}
              onChange={(e) => { setActiveCategory(catKey); setSkillInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(catKey); } }}
              className="h-8 text-sm"
            />
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => { setActiveCategory(catKey); addSkill(catKey); }}>Add</Button>
          </div>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skills.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  {skill}
                  <button onClick={() => removeSkill(catKey, skill)}><X className="h-2 w-2" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="New category name..." value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="h-9 text-sm" onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
        <Button variant="outline" size="sm" onClick={addCategory} className="gap-1.5 shrink-0"><Plus className="h-4 w-4" /> Add Category</Button>
      </div>
    </div>
  );
}

// ===== Projects =====
function ProjectsEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  const updateProj = (idx: number, updates: Partial<ProjectEntry>) => {
    const next = [...data.projects];
    next[idx] = { ...next[idx], ...updates };
    onChange({ ...data, projects: next });
  };

  const addProj = () =>
    onChange({ ...data, projects: [...(data.projects || []), { id: crypto.randomUUID(), title: "", organization: "", date: "", bullets: [] }] });

  const removeProj = (idx: number) =>
    onChange({ ...data, projects: data.projects.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Projects</h3>
      {(data.projects || []).map((project, idx) => (
        <div key={project.id} className="p-4 rounded-xl border border-border bg-card space-y-3 relative group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">Project {idx + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => removeProj(idx)} className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2"><InputField label="Project Name" value={project.title} onChange={(v) => updateProj(idx, { title: v })} placeholder="AI Chatbot" /></div>
            <InputField label="Organization" value={project.organization} onChange={(v) => updateProj(idx, { organization: v })} placeholder="MIT" />
            <InputField label="Date" value={project.date} onChange={(v) => updateProj(idx, { date: v })} placeholder="May 2024" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Key Points</Label>
            {project.bullets.map((b, bi) => (
              <div key={bi} className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs">•</span>
                <Input value={b} onChange={(e) => { const nb = [...project.bullets]; nb[bi] = e.target.value; updateProj(idx, { bullets: nb }); }} className="h-8 text-sm flex-1" />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => updateProj(idx, { bullets: project.bullets.filter((_, i) => i !== bi) })}><X className="h-3 w-3" /></Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => updateProj(idx, { bullets: [...project.bullets, ""] })} className="gap-1.5 text-muted-foreground text-xs h-7"><Plus className="h-3 w-3" /> Add point</Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addProj} className="w-full gap-2"><Plus className="h-4 w-4" /> Add Project</Button>
    </div>
  );
}

// ===== Certifications =====
function CertificationsEditor({ data, onChange }: { data: ResumeJSON; onChange: (d: ResumeJSON) => void }) {
  const updateCert = (id: string, field: keyof CertificationEntry, value: string) =>
    onChange({ ...data, certifications: data.certifications.map((c) => (c.id === id ? { ...c, [field]: value } : c)) });

  const addCert = () =>
    onChange({ ...data, certifications: [...data.certifications, { id: crypto.randomUUID(), name: "", issuer: "", date: "" }] });

  const removeCert = (id: string) =>
    onChange({ ...data, certifications: data.certifications.filter((c) => c.id !== id) });

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Certifications</h3>
      {data.certifications.map((cert) => (
        <div key={cert.id} className="p-4 rounded-xl border border-border bg-card space-y-3 relative group">
          <Button variant="ghost" size="icon" onClick={() => removeCert(cert.id)} className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></Button>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2"><InputField label="Certification Name" value={cert.name} onChange={(v) => updateCert(cert.id, "name", v)} placeholder="AWS Solutions Architect" /></div>
            <InputField label="Issuer" value={cert.issuer} onChange={(v) => updateCert(cert.id, "issuer", v)} placeholder="Amazon Web Services" />
            <InputField label="Date" value={cert.date} onChange={(v) => updateCert(cert.id, "date", v)} placeholder="Sep 2024" />
          </div>
        </div>
      ))}
      {data.certifications.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No certifications added yet</p>}
      <Button variant="outline" size="sm" onClick={addCert} className="w-full gap-2"><Plus className="h-4 w-4" /> Add Certification</Button>
    </div>
  );
}

// ===== Reusable Input =====
function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  );
}

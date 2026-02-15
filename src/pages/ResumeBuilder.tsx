import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus, X, Sparkles, Loader2, FileText, Briefcase, GraduationCap,
  Award, Wrench, Upload, FolderKanban, ChevronDown, ChevronUp,
  User as UserIcon, AlignLeft, Globe, Download, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  ResumeJSON, ExperienceEntry, EducationEntry, CertificationEntry,
  ProjectEntry, SKILL_CATEGORY_LABELS, createEmptyResumeJSON,
} from "@/types/resume";
import { ResumePreview } from "@/components/resume/ResumePreview";
import { TemplateSelector } from "@/components/resume/TemplateSelector";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ResumeFormSkeleton } from "@/components/resume/ResumeFormSkeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Robust JSON parser (reused from EnhancedResumeForm)
function parseAIResponse(content: string): Record<string, any> | null {
  let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let braceCount = 0, startIdx = -1, endIdx = -1, inString = false, escapeNext = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === "\\" && inString) { escapeNext = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (!inString) {
      if (c === "{") { if (startIdx === -1) startIdx = i; braceCount++; }
      else if (c === "}") { braceCount--; if (braceCount === 0 && startIdx !== -1) { endIdx = i + 1; break; } }
    }
  }
  if (startIdx === -1 || endIdx === -1) return null;
  const jsonString = cleaned.substring(startIdx, endIdx);
  try { return JSON.parse(jsonString); } catch {}
  try {
    return JSON.parse(jsonString.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,(\s*[}\]])/g, "$1"));
  } catch {}
  return null;
}

type SectionId = "personal" | "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "languages" | "custom";

interface SectionConfig {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: "personal", label: "Personal Information", icon: UserIcon },
  { id: "summary", label: "Professional Summary", icon: AlignLeft },
  { id: "experience", label: "Work Experience", icon: Briefcase },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "certifications", label: "Certifications", icon: Award },
  { id: "languages", label: "Languages", icon: Globe },
];

export default function ResumeBuilder() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resumeData, setResumeData] = useState<ResumeJSON>(createEmptyResumeJSON());
  const [openSections, setOpenSections] = useState<SectionId[]>(["personal", "summary", "experience"]);
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_SECTIONS.map((s) => s.id));
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("professional");
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [currentSkillCategory, setCurrentSkillCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isMobilePreview, setIsMobilePreview] = useState(false);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
    });
  }, [navigate]);

  // Auto-save to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("resumeBuilderData");
    if (saved) {
      try { setResumeData(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem("resumeBuilderData", JSON.stringify(resumeData));
    }, 500);
    return () => clearTimeout(timeout);
  }, [resumeData]);

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const moveSection = (id: SectionId, direction: "up" | "down") => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(id);
      if (direction === "up" && idx > 0) {
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return next;
      }
      if (direction === "down" && idx < prev.length - 1) {
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        return next;
      }
      return prev;
    });
  };

  // Resume import handler
  const handleResumeImported = async (text: string, fileName: string) => {
    setIsParsingResume(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an expert resume parser. Extract ALL structured resume data. Return ONLY valid JSON matching this schema:
{"header":{"name":"","title":"","location":"","email":"","phone":"","linkedin":""},"summary":"","experience":[{"role":"","company_or_client":"","start_date":"","end_date":"","location":"","bullets":[]}],"education":[{"degree":"","field":"","institution":"","gpa":"","graduation_date":"","location":""}],"certifications":[{"name":"","issuer":"","date":""}],"skills":{"category_name":["skill1"]},"projects":[{"title":"","organization":"","date":"","bullets":[]}]}
Extract EVERY bullet point. Use lowercase_snake_case for skill category keys matching the resume's actual categories.`,
              },
              { role: "user", content: `Parse this resume:\n\n${text}` },
            ],
            model: "google/gemini-2.5-pro",
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to parse resume");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const parsed = JSON.parse(line.slice(6));
                const c = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || "";
                if (c) fullContent += c;
              } catch {}
            }
          }
        }
      }

      const parsedData = parseAIResponse(fullContent);
      if (!parsedData) throw new Error("Could not extract structured data");

      const newData: ResumeJSON = {
        header: { ...resumeData.header, ...parsedData.header },
        summary: parsedData.summary || resumeData.summary,
        experience: parsedData.experience?.length > 0
          ? parsedData.experience.map((e: any) => ({
              id: crypto.randomUUID(), role: e.role || "", company_or_client: e.company_or_client || "",
              start_date: e.start_date || "", end_date: e.end_date || "", location: e.location || "",
              bullets: Array.isArray(e.bullets) ? e.bullets : [],
            }))
          : resumeData.experience,
        education: parsedData.education?.length > 0
          ? parsedData.education.map((e: any) => ({
              id: crypto.randomUUID(), degree: e.degree || "", field: e.field || "",
              institution: e.institution || "", gpa: e.gpa || "", graduation_date: e.graduation_date || "", location: e.location || "",
            }))
          : resumeData.education,
        certifications: parsedData.certifications?.length > 0
          ? parsedData.certifications.map((c: any) => ({
              id: crypto.randomUUID(), name: c.name || "", issuer: c.issuer || "", date: c.date || "",
            }))
          : resumeData.certifications,
        skills: { ...resumeData.skills, ...parsedData.skills },
        projects: parsedData.projects?.length > 0
          ? parsedData.projects.map((p: any) => ({
              id: crypto.randomUUID(), title: p.title || "", organization: p.organization || "",
              date: p.date || "", bullets: Array.isArray(p.bullets) ? p.bullets : [],
            }))
          : resumeData.projects,
      };
      setResumeData(newData);
      toast({ title: "Resume imported!", description: `Extracted data from ${fileName}. Review and edit.` });
    } catch (error) {
      toast({ title: "Import failed", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setIsParsingResume(false);
    }
  };

  // Update helpers
  const updateHeader = (field: keyof ResumeJSON["header"], value: string) => {
    setResumeData((prev) => ({ ...prev, header: { ...prev.header, [field]: value } }));
  };

  const addExperience = () => {
    setResumeData((prev) => ({
      ...prev,
      experience: [...prev.experience, { id: crypto.randomUUID(), role: "", company_or_client: "", start_date: "", end_date: "", location: "", bullets: [] }],
    }));
  };

  const removeExperience = (id: string) => {
    setResumeData((prev) => ({ ...prev, experience: prev.experience.filter((e) => e.id !== id) }));
  };

  const updateExperience = (id: string, field: keyof ExperienceEntry, value: any) => {
    setResumeData((prev) => ({
      ...prev,
      experience: prev.experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  };

  const addEducation = () => {
    setResumeData((prev) => ({
      ...prev,
      education: [...prev.education, { id: crypto.randomUUID(), degree: "", field: "", institution: "", gpa: "", graduation_date: "", location: "" }],
    }));
  };

  const removeEducation = (id: string) => {
    setResumeData((prev) => ({ ...prev, education: prev.education.filter((e) => e.id !== id) }));
  };

  const updateEducation = (id: string, field: keyof EducationEntry, value: string) => {
    setResumeData((prev) => ({
      ...prev,
      education: prev.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  };

  const addCertification = () => {
    setResumeData((prev) => ({
      ...prev,
      certifications: [...prev.certifications, { id: crypto.randomUUID(), name: "", issuer: "", date: "" }],
    }));
  };

  const removeCertification = (id: string) => {
    setResumeData((prev) => ({ ...prev, certifications: prev.certifications.filter((c) => c.id !== id) }));
  };

  const updateCertification = (id: string, field: keyof CertificationEntry, value: string) => {
    setResumeData((prev) => ({
      ...prev,
      certifications: prev.certifications.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  };

  const addSkillToCategory = (category: string, skill: string) => {
    if (!skill.trim()) return;
    setResumeData((prev) => {
      const current = prev.skills[category] || [];
      if (current.includes(skill.trim())) return prev;
      return { ...prev, skills: { ...prev.skills, [category]: [...current, skill.trim()] } };
    });
  };

  const removeSkillFromCategory = (category: string, skill: string) => {
    setResumeData((prev) => ({
      ...prev,
      skills: { ...prev.skills, [category]: (prev.skills[category] || []).filter((s) => s !== skill) },
    }));
  };

  // Section renderers
  const renderPersonal = () => (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Full Name *", field: "name" as const, placeholder: "John Doe" },
        { label: "Job Title", field: "title" as const, placeholder: "Data Engineer" },
        { label: "Email *", field: "email" as const, placeholder: "john@email.com" },
        { label: "Phone", field: "phone" as const, placeholder: "+1 555-123-4567" },
        { label: "Location", field: "location" as const, placeholder: "Dallas, TX" },
        { label: "LinkedIn", field: "linkedin" as const, placeholder: "linkedin.com/in/johndoe" },
      ].map((f) => (
        <div key={f.field} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{f.label}</Label>
          <Input placeholder={f.placeholder} value={resumeData.header[f.field]} onChange={(e) => updateHeader(f.field, e.target.value)} className="h-9 text-sm" />
        </div>
      ))}
    </div>
  );

  const renderSummary = () => (
    <Textarea
      placeholder="Brief professional summary highlighting your experience and skills..."
      value={resumeData.summary}
      onChange={(e) => setResumeData((prev) => ({ ...prev, summary: e.target.value }))}
      className="text-sm min-h-[100px]"
    />
  );

  const renderExperience = () => (
    <div className="space-y-4">
      {resumeData.experience.map((exp, index) => (
        <div key={exp.id} className="p-3 bg-muted/50 rounded-xl space-y-3 relative">
          {resumeData.experience.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => removeExperience(exp.id)} className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </Button>
          )}
          <p className="text-xs font-semibold text-muted-foreground">Position {index + 1}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Company *</Label><Input placeholder="Company Inc." value={exp.company_or_client} onChange={(e) => updateExperience(exp.id, "company_or_client", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Role *</Label><Input placeholder="Data Engineer" value={exp.role} onChange={(e) => updateExperience(exp.id, "role", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input placeholder="Feb 2024" value={exp.start_date} onChange={(e) => updateExperience(exp.id, "start_date", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">End Date</Label><Input placeholder="Present" value={exp.end_date} onChange={(e) => updateExperience(exp.id, "end_date", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Location</Label><Input placeholder="Dallas, TX" value={exp.location} onChange={(e) => updateExperience(exp.id, "location", e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bullet Points (one per line)</Label>
            <Textarea placeholder="• Designed ETL pipelines&#10;• Led data migration" value={exp.bullets.join("\n")} onChange={(e) => updateExperience(exp.id, "bullets", e.target.value.split("\n").filter((b) => b.trim()))} className="text-sm min-h-[80px]" />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addExperience} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add Experience
      </Button>
    </div>
  );

  const renderEducation = () => (
    <div className="space-y-3">
      {resumeData.education.map((edu, index) => (
        <div key={edu.id} className="p-3 bg-muted/50 rounded-xl space-y-2 relative">
          {resumeData.education.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => removeEducation(edu.id)} className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Institution</Label><Input placeholder="University of..." value={edu.institution} onChange={(e) => updateEducation(edu.id, "institution", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Degree</Label><Input placeholder="Master's" value={edu.degree} onChange={(e) => updateEducation(edu.id, "degree", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Field</Label><Input placeholder="Computer Science" value={edu.field} onChange={(e) => updateEducation(edu.id, "field", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Graduation Date</Label><Input placeholder="May 2023" value={edu.graduation_date} onChange={(e) => updateEducation(edu.id, "graduation_date", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">GPA</Label><Input placeholder="3.8" value={edu.gpa} onChange={(e) => updateEducation(edu.id, "gpa", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Location</Label><Input placeholder="Cambridge, MA" value={edu.location} onChange={(e) => updateEducation(edu.id, "location", e.target.value)} className="h-8 text-sm" /></div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addEducation} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add Education
      </Button>
    </div>
  );

  const renderSkills = () => (
    <div className="space-y-3">
      {Object.entries(resumeData.skills).map(([categoryKey, skills]) => (
        <div key={categoryKey} className="p-3 bg-muted/50 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{SKILL_CATEGORY_LABELS[categoryKey] || categoryKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { const s = { ...resumeData.skills }; delete s[categoryKey]; setResumeData((prev) => ({ ...prev, skills: s })); }} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Add skill..." value={currentSkillCategory === categoryKey ? skillInput : ""} onChange={(e) => { setCurrentSkillCategory(categoryKey); setSkillInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkillToCategory(categoryKey, skillInput); setSkillInput(""); } }} className="h-8 text-sm" />
            <Button type="button" variant="outline" size="sm" onClick={() => { addSkillToCategory(categoryKey, skillInput); setSkillInput(""); }} className="h-8">Add</Button>
          </div>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skills.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  {skill}
                  <button type="button" onClick={() => removeSkillFromCategory(categoryKey, skill)}><X className="h-2 w-2" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="p-3 border-2 border-dashed border-border rounded-xl space-y-2">
        <span className="text-sm text-muted-foreground">Add New Category</span>
        <div className="flex gap-2">
          <Input placeholder="e.g., Cloud Platforms" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="h-8 text-sm" />
          <Button type="button" variant="outline" size="sm" onClick={() => {
            if (newCategoryName.trim()) {
              const key = newCategoryName.trim().toLowerCase().replace(/\s+/g, "_").replace(/&/g, "");
              if (!resumeData.skills[key]) setResumeData((prev) => ({ ...prev, skills: { ...prev.skills, [key]: [] } }));
              setNewCategoryName("");
            }
          }} className="h-8"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-4">
      {resumeData.projects.map((project, index) => (
        <div key={project.id} className="p-3 bg-muted/50 rounded-xl space-y-3 relative">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-muted-foreground">Project {index + 1}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResumeData((prev) => ({ ...prev, projects: prev.projects.filter((_, i) => i !== index) }))} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1"><Label className="text-xs">Project Name</Label><Input value={project.title} onChange={(e) => { const u = [...resumeData.projects]; u[index] = { ...project, title: e.target.value }; setResumeData((prev) => ({ ...prev, projects: u })); }} placeholder="AI Chatbot" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Organization</Label><Input value={project.organization} onChange={(e) => { const u = [...resumeData.projects]; u[index] = { ...project, organization: e.target.value }; setResumeData((prev) => ({ ...prev, projects: u })); }} placeholder="MIT" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Date</Label><Input value={project.date} onChange={(e) => { const u = [...resumeData.projects]; u[index] = { ...project, date: e.target.value }; setResumeData((prev) => ({ ...prev, projects: u })); }} placeholder="May 2024" className="h-8 text-sm" /></div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Key Points (one per line)</Label>
            <Textarea value={project.bullets.join("\n")} onChange={(e) => { const u = [...resumeData.projects]; u[index] = { ...project, bullets: e.target.value.split("\n").filter((b) => b.trim()) }; setResumeData((prev) => ({ ...prev, projects: u })); }} placeholder="• Built a full-stack application&#10;• Used React and Node.js" className="text-sm min-h-[60px]" />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setResumeData((prev) => ({ ...prev, projects: [...prev.projects, { id: crypto.randomUUID(), title: "", organization: "", date: "", bullets: [] }] }))} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add Project
      </Button>
    </div>
  );

  const renderCertifications = () => (
    <div className="space-y-3">
      {resumeData.certifications.map((cert) => (
        <div key={cert.id} className="p-3 bg-muted/50 rounded-xl space-y-2 relative">
          <Button type="button" variant="ghost" size="icon" onClick={() => removeCertification(cert.id)} className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1"><Label className="text-xs">Name</Label><Input placeholder="AWS Certified..." value={cert.name} onChange={(e) => updateCertification(cert.id, "name", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Date</Label><Input placeholder="Sep 2024" value={cert.date} onChange={(e) => updateCertification(cert.id, "date", e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Issuer</Label><Input placeholder="Amazon Web Services" value={cert.issuer} onChange={(e) => updateCertification(cert.id, "issuer", e.target.value)} className="h-8 text-sm" /></div>
        </div>
      ))}
      {resumeData.certifications.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No certifications added yet</p>}
      <Button type="button" variant="outline" size="sm" onClick={addCertification} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add Certification
      </Button>
    </div>
  );

  const renderLanguages = () => (
    <p className="text-xs text-muted-foreground text-center py-4">
      Languages section coming soon. You can add languages under a custom Skills category for now.
    </p>
  );

  const sectionRenderers: Record<SectionId, () => React.ReactNode> = {
    personal: renderPersonal,
    summary: renderSummary,
    experience: renderExperience,
    education: renderEducation,
    skills: renderSkills,
    projects: renderProjects,
    certifications: renderCertifications,
    languages: renderLanguages,
    custom: () => null,
  };

  const orderedSections = sectionOrder
    .map((id) => DEFAULT_SECTIONS.find((s) => s.id === id))
    .filter(Boolean) as SectionConfig[];

  return (
    <>
      <TemplateSelector isOpen={showTemplateSelector} onClose={() => setShowTemplateSelector(false)} onSelect={(id) => { setSelectedTemplate(id); setShowTemplateSelector(false); }} selectedTemplateId={selectedTemplate} />

      <div className="flex h-[calc(100vh-68px)] overflow-hidden">
        {/* Left Panel — Editor */}
        <div className={cn("flex flex-col border-r border-border bg-background", isMobilePreview ? "hidden md:flex md:w-1/2 lg:w-[480px]" : "flex-1 md:flex-none md:w-1/2 lg:w-[480px]")}>
          {/* Editor Header */}
          <div className="shrink-0 px-5 py-4 border-b border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Resume Builder
              </h1>
              <div className="flex items-center gap-2 md:hidden">
                <Button variant="outline" size="sm" onClick={() => setIsMobilePreview(!isMobilePreview)}>
                  {isMobilePreview ? "Edit" : "Preview"}
                </Button>
              </div>
            </div>

            {/* Import & Template */}
            <div className="flex gap-2">
              <DocumentUpload onTextExtracted={handleResumeImported} isLoading={isParsingResume} label={isParsingResume ? "Parsing..." : "Import Resume"} />
              <Button variant="outline" size="sm" onClick={() => setShowTemplateSelector(true)} className="gap-1.5 shrink-0">
                <FileText className="h-3.5 w-3.5" />
                {selectedTemplate === "creative" ? "Creative" : "Professional"}
              </Button>
            </div>
          </div>

          {/* Scrollable Form */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2 pb-8">
              {isParsingResume && <ResumeFormSkeleton />}
              {!isParsingResume && orderedSections.map((section, idx) => {
                const isOpen = openSections.includes(section.id);
                const Icon = section.icon;
                return (
                  <Collapsible key={section.id} open={isOpen} onOpenChange={() => toggleSection(section.id)}>
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="flex-1 text-left text-sm font-semibold text-foreground">{section.label}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveSection(section.id, "up"); }} disabled={idx === 0} className="p-1 rounded hover:bg-muted disabled:opacity-20">
                              <ArrowUp className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveSection(section.id, "down"); }} disabled={idx === orderedSections.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-20">
                              <ArrowDown className="w-3 h-3 text-muted-foreground" />
                            </button>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-1">
                          {sectionRenderers[section.id]()}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel — Live Preview (sticky) */}
        <div className={cn("flex-1 bg-muted/30 overflow-hidden", isMobilePreview ? "flex" : "hidden md:flex")}>
          <div className="flex-1 flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-sm">
              <span className="text-sm font-semibold text-foreground">Live Preview</span>
              <div className="flex items-center gap-2 md:hidden">
                <Button variant="outline" size="sm" onClick={() => setIsMobilePreview(false)}>
                  ← Back to Editor
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <ResumePreview data={resumeData} isGenerating={isParsingResume} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

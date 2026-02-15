import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useResumeExport } from "@/hooks/use-resume-export";
import {
  ResumeJSON,
  ExperienceEntry,
  EducationEntry,
  CertificationEntry,
  ProjectEntry,
  SKILL_CATEGORY_LABELS,
  createEmptyResumeJSON,
} from "@/types/resume";
import { ResumeTemplate } from "@/components/resume/ResumeTemplate";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ResumeFormSkeleton } from "@/components/resume/ResumeFormSkeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  User as UserIcon,
  FileText,
  Briefcase,
  GraduationCap,
  Wrench,
  FolderKanban,
  Award,
  Plus,
  X,
  Loader2,
  Eye,
  EyeOff,
  Download,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Printer,
  Cloud,
  CloudOff,
  Wand2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SectionId =
  | "personal"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications";

interface SectionConfig {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  getCount: (data: ResumeJSON) => number;
  getCompleteness: (data: ResumeJSON) => number;
}

// ─── Section definitions with completeness scoring ──────────────────────────

const SECTIONS: SectionConfig[] = [
  {
    id: "personal",
    label: "Personal Information",
    icon: <UserIcon className="h-4 w-4" />,
    getCount: (d) => {
      const h = d.header;
      return [h.name, h.title, h.email, h.phone, h.location, h.linkedin].filter(Boolean).length;
    },
    getCompleteness: (d) => {
      const h = d.header;
      const filled = [h.name, h.email, h.phone, h.location, h.title, h.linkedin].filter(Boolean).length;
      return Math.round((filled / 6) * 100);
    },
  },
  {
    id: "summary",
    label: "Professional Summary",
    icon: <FileText className="h-4 w-4" />,
    getCount: (d) => (d.summary ? 1 : 0),
    getCompleteness: (d) => {
      if (!d.summary) return 0;
      if (d.summary.length < 50) return 30;
      if (d.summary.length < 150) return 60;
      return 100;
    },
  },
  {
    id: "experience",
    label: "Work Experience",
    icon: <Briefcase className="h-4 w-4" />,
    getCount: (d) => d.experience.filter((e) => e.company_or_client).length,
    getCompleteness: (d) => {
      const valid = d.experience.filter((e) => e.company_or_client);
      if (valid.length === 0) return 0;
      const scores = valid.map((e) => {
        let s = 0;
        if (e.company_or_client) s += 20;
        if (e.role) s += 20;
        if (e.start_date) s += 15;
        if (e.end_date) s += 15;
        if (e.bullets.length >= 3) s += 30;
        else if (e.bullets.length > 0) s += 15;
        return s;
      });
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    },
  },
  {
    id: "education",
    label: "Education",
    icon: <GraduationCap className="h-4 w-4" />,
    getCount: (d) => d.education.filter((e) => e.institution).length,
    getCompleteness: (d) => {
      const valid = d.education.filter((e) => e.institution);
      if (valid.length === 0) return 0;
      const scores = valid.map((e) => {
        let s = 0;
        if (e.institution) s += 30;
        if (e.degree) s += 25;
        if (e.field) s += 25;
        if (e.graduation_date) s += 20;
        return s;
      });
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    },
  },
  {
    id: "skills",
    label: "Skills & Interests",
    icon: <Wrench className="h-4 w-4" />,
    getCount: (d) => Object.values(d.skills).flat().length,
    getCompleteness: (d) => {
      const total = Object.values(d.skills).flat().length;
      if (total === 0) return 0;
      if (total < 5) return 30;
      if (total < 10) return 60;
      return 100;
    },
  },
  {
    id: "projects",
    label: "Projects",
    icon: <FolderKanban className="h-4 w-4" />,
    getCount: (d) => d.projects.filter((p) => p.title).length,
    getCompleteness: (d) => {
      const valid = d.projects.filter((p) => p.title);
      if (valid.length === 0) return 0;
      const scores = valid.map((p) => {
        let s = 0;
        if (p.title) s += 30;
        if (p.organization) s += 20;
        if (p.bullets.length >= 2) s += 50;
        else if (p.bullets.length > 0) s += 25;
        return s;
      });
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    },
  },
  {
    id: "certifications",
    label: "Certifications",
    icon: <Award className="h-4 w-4" />,
    getCount: (d) => d.certifications.filter((c) => c.name).length,
    getCompleteness: (d) => {
      const valid = d.certifications.filter((c) => c.name);
      if (valid.length === 0) return 0;
      return 100;
    },
  },
];

// ─── Robust AI response parser ──────────────────────────────────────────────

function parseAIResponse(content: string): Record<string, any> | null {
  let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let braceCount = 0, startIdx = -1, endIdx = -1, inString = false, escapeNext = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === "\\" && inString) { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === "{") { if (startIdx === -1) startIdx = i; braceCount++; }
      else if (char === "}") { braceCount--; if (braceCount === 0 && startIdx !== -1) { endIdx = i + 1; break; } }
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

function formatBullets(responsibilities: string | string[]): string[] {
  if (!responsibilities) return [];
  if (Array.isArray(responsibilities))
    return responsibilities.filter((r) => r && r.trim()).map((r) => r.trim().replace(/^[•\-*]\s*/, ""));
  return String(responsibilities).split(/\n|(?=•)|(?=-)/).map((l) => l.trim()).filter((l) => l.length > 0).map((l) => l.replace(/^[•\-*]\s*/, ""));
}

async function streamAIText(
  accessToken: string,
  messages: { role: string; content: string }[],
  model = "google/gemini-2.5-flash",
): Promise<string> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messages, model }),
    },
  );
  if (!response.ok) throw new Error("AI request failed");
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let full = "";
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split("\n")) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const p = JSON.parse(line.slice(6));
            const c = p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || p.content || p.text;
            if (c) full += c;
          } catch {}
        }
      }
    }
  }
  return full;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ResumeBuilder() {
  const { toast } = useToast();
  const { exportToPDF, exportToWord, isExporting } = useResumeExport();
  const resumeRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<ResumeJSON>(createEmptyResumeJSON());
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null);
  const [hiddenSections, setHiddenSections] = useState<Set<SectionId>>(new Set());
  const [aiEnhancingSection, setAiEnhancingSection] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [currentSkillCategory, setCurrentSkillCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Load saved resume ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoaded(true); return; }

      const { data: resumes } = await supabase
        .from("resumes" as any).select("*").eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(1);

      if (resumes && resumes.length > 0) {
        const r = resumes[0] as any;
        setCurrentResumeId(r.id);
        setData({
          header: r.personal_info || createEmptyResumeJSON().header,
          summary: r.summary || "",
          experience: Array.isArray(r.experience) ? r.experience : [],
          education: Array.isArray(r.education) ? r.education : [],
          certifications: Array.isArray(r.certifications) ? r.certifications : [],
          skills: r.skills && typeof r.skills === "object" && !Array.isArray(r.skills) ? r.skills : {},
          projects: Array.isArray(r.projects) ? r.projects : [],
        });
      }
      setIsLoaded(true);
    })();
  }, []);

  // ── Auto-save (debounced 2s) ───────────────────────────────────────────
  const saveToSupabase = useCallback(async (resumeJson: ResumeJSON) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsSaving(true);
    try {
      const payload = {
        user_id: user.id,
        title: resumeJson.header.name ? `${resumeJson.header.name}'s Resume` : "Untitled Resume",
        personal_info: resumeJson.header as any, summary: resumeJson.summary,
        experience: resumeJson.experience as any, education: resumeJson.education as any,
        skills: resumeJson.skills as any, projects: resumeJson.projects as any,
        certifications: resumeJson.certifications as any, template: "professional",
      };
      if (currentResumeId) {
        await supabase.from("resumes" as any).update(payload).eq("id", currentResumeId);
      } else {
        const { data: newResume } = await supabase.from("resumes" as any).insert(payload).select("id").single();
        if (newResume) setCurrentResumeId((newResume as any).id);
      }
      setLastSaved(new Date());
    } catch {}
    setIsSaving(false);
  }, [currentResumeId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToSupabase(data), 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [data, saveToSupabase, isLoaded]);

  // ── Completeness ──────────────────────────────────────────────────────
  const completeness = Math.round(SECTIONS.reduce((sum, s) => sum + s.getCompleteness(data), 0) / SECTIONS.length);
  const completenessColor = completeness >= 80 ? "text-green-500" : completeness >= 50 ? "text-yellow-500" : "text-red-400";
  const completenessLabel = completeness >= 80 ? "Excellent" : completeness >= 50 ? "Good start" : "Needs work";

  // ── AI parsing ────────────────────────────────────────────────────────
  const handleResumeImported = async (text: string, fileName: string) => {
    setIsParsingResume(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const fullContent = await streamAIText(session.session.access_token, [
        { role: "system", content: `You are an expert resume parser. Extract ALL structured resume data.\nOUTPUT: Return ONLY valid JSON.\nSCHEMA: {"header":{"name":"","title":"","location":"","email":"","phone":"","linkedin":""},"summary":"","experience":[{"role":"","company_or_client":"","start_date":"","end_date":"","location":"","bullets":[]}],"education":[{"degree":"","field":"","institution":"","gpa":"","graduation_date":"","location":""}],"certifications":[{"name":"","issuer":"","date":""}],"skills":{},"projects":[{"title":"","organization":"","date":"","bullets":[]}]}\nRULES: Extract EVERY bullet point. Use lowercase_snake_case for skill category keys. Use "" for missing fields. Return ONLY JSON.` },
        { role: "user", content: `Parse this resume:\n\n${text}` },
      ], "google/gemini-2.5-pro");

      const parsedData = parseAIResponse(fullContent);
      if (!parsedData) throw new Error("Could not extract structured data.");

      setData({
        header: { name: parsedData.header?.name || data.header.name, title: parsedData.header?.title || data.header.title, email: parsedData.header?.email || data.header.email, phone: parsedData.header?.phone || data.header.phone, location: parsedData.header?.location || data.header.location, linkedin: parsedData.header?.linkedin || data.header.linkedin },
        summary: parsedData.summary || data.summary,
        experience: parsedData.experience?.length > 0 ? parsedData.experience.map((e: any) => ({ id: crypto.randomUUID(), role: e.role || "", company_or_client: e.company_or_client || "", start_date: e.start_date || "", end_date: e.end_date || "", location: e.location || "", bullets: Array.isArray(e.bullets) ? e.bullets : formatBullets(e.bullets || "") })) : data.experience,
        education: parsedData.education?.length > 0 ? parsedData.education.map((e: any) => ({ id: crypto.randomUUID(), degree: e.degree || "", field: e.field || "", institution: e.institution || "", gpa: e.gpa || "", graduation_date: e.graduation_date || "", location: e.location || "" })) : data.education,
        certifications: parsedData.certifications?.length > 0 ? parsedData.certifications.map((c: any) => ({ id: crypto.randomUUID(), name: c.name || "", issuer: c.issuer || "", date: c.date || "" })) : data.certifications,
        skills: { ...data.skills, ...parsedData.skills },
        projects: parsedData.projects?.length > 0 ? parsedData.projects.map((p: any) => ({ id: crypto.randomUUID(), title: p.title || "", organization: p.organization || "", date: p.date || "", bullets: Array.isArray(p.bullets) ? p.bullets : [] })) : data.projects,
      });
      toast({ title: "Resume imported!", description: `Extracted data from ${fileName}.` });
    } catch (error) {
      toast({ title: "Import failed", description: error instanceof Error ? error.message : "Failed to parse resume", variant: "destructive" });
    } finally { setIsParsingResume(false); }
  };

  // ── AI enhancements ───────────────────────────────────────────────────
  const enhanceSummaryWithAI = async () => {
    if (!data.summary && !data.header.title) { toast({ title: "Add content first", description: "Write a draft summary or add your job title.", variant: "destructive" }); return; }
    setAiEnhancingSection("summary");
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const context = `Name: ${data.header.name}\nTitle: ${data.header.title}\nExperience: ${data.experience.filter(e => e.company_or_client).map(e => `${e.role} at ${e.company_or_client}`).join(", ")}\nSkills: ${Object.values(data.skills).flat().join(", ")}`;
      const result = await streamAIText(session.session.access_token, [
        { role: "system", content: "You are an expert resume writer. Generate a concise, impactful professional summary (2-4 sentences, under 80 words). Use strong action verbs, quantify achievements. Output ONLY the summary text." },
        { role: "user", content: data.summary ? `Improve this summary:\n\n"${data.summary}"\n\nContext:\n${context}` : `Write a professional summary for:\n${context}` },
      ]);
      const cleaned = result.replace(/^["']|["']$/g, "").trim();
      if (cleaned) { setData((prev) => ({ ...prev, summary: cleaned })); toast({ title: "Summary enhanced!" }); }
    } catch { toast({ title: "Enhancement failed", variant: "destructive" }); }
    finally { setAiEnhancingSection(null); }
  };

  const enhanceBulletsWithAI = async (expId: string) => {
    const exp = data.experience.find((e) => e.id === expId);
    if (!exp || exp.bullets.length === 0) { toast({ title: "Add bullets first", variant: "destructive" }); return; }
    setAiEnhancingSection(`exp-${expId}`);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const result = await streamAIText(session.session.access_token, [
        { role: "system", content: `Improve bullet points for ${exp.role} at ${exp.company_or_client}. Start with strong action verbs, add metrics. Return ONLY a JSON array of strings.` },
        { role: "user", content: `Improve:\n${exp.bullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}` },
      ]);
      const enhanced = JSON.parse(result.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
      if (Array.isArray(enhanced) && enhanced.length > 0) {
        setData((prev) => ({ ...prev, experience: prev.experience.map((e) => (e.id === expId ? { ...e, bullets: enhanced } : e)) }));
        toast({ title: "Bullets enhanced!", description: `${enhanced.length} bullet points improved.` });
      }
    } catch { toast({ title: "Enhancement failed", variant: "destructive" }); }
    finally { setAiEnhancingSection(null); }
  };

  // ── Data mutation helpers ──────────────────────────────────────────────
  const updateHeader = (field: keyof ResumeJSON["header"], value: string) => setData((prev) => ({ ...prev, header: { ...prev.header, [field]: value } }));
  const addExperience = () => setData((prev) => ({ ...prev, experience: [...prev.experience, { id: crypto.randomUUID(), role: "", company_or_client: "", start_date: "", end_date: "", location: "", bullets: [] }] }));
  const removeExperience = (id: string) => setData((prev) => ({ ...prev, experience: prev.experience.filter((e) => e.id !== id) }));
  const updateExperience = (id: string, field: keyof ExperienceEntry, value: any) => setData((prev) => ({ ...prev, experience: prev.experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)) }));
  const addEducation = () => setData((prev) => ({ ...prev, education: [...prev.education, { id: crypto.randomUUID(), degree: "", field: "", institution: "", gpa: "", graduation_date: "", location: "" }] }));
  const removeEducation = (id: string) => setData((prev) => ({ ...prev, education: prev.education.filter((e) => e.id !== id) }));
  const updateEducation = (id: string, field: keyof EducationEntry, value: string) => setData((prev) => ({ ...prev, education: prev.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)) }));
  const addCertification = () => setData((prev) => ({ ...prev, certifications: [...prev.certifications, { id: crypto.randomUUID(), name: "", issuer: "", date: "" }] }));
  const removeCertification = (id: string) => setData((prev) => ({ ...prev, certifications: prev.certifications.filter((c) => c.id !== id) }));
  const updateCertification = (id: string, field: keyof CertificationEntry, value: string) => setData((prev) => ({ ...prev, certifications: prev.certifications.map((c) => (c.id === id ? { ...c, [field]: value } : c)) }));
  const addProject = () => setData((prev) => ({ ...prev, projects: [...prev.projects, { id: crypto.randomUUID(), title: "", organization: "", date: "", bullets: [""] }] }));
  const removeProject = (index: number) => setData((prev) => ({ ...prev, projects: prev.projects.filter((_, i) => i !== index) }));
  const updateProject = (index: number, updates: Partial<ProjectEntry>) => setData((prev) => ({ ...prev, projects: prev.projects.map((p, i) => (i === index ? { ...p, ...updates } : p)) }));
  const addSkillToCategory = (category: string, skill: string) => { if (!skill.trim()) return; const current = data.skills[category] || []; if (!current.includes(skill.trim())) setData((prev) => ({ ...prev, skills: { ...prev.skills, [category]: [...current, skill.trim()] } })); };
  const removeSkillFromCategory = (category: string, skill: string) => setData((prev) => ({ ...prev, skills: { ...prev.skills, [category]: (prev.skills[category] || []).filter((s) => s !== skill) } }));
  const toggleSectionVisibility = (sectionId: SectionId) => setHiddenSections((prev) => { const next = new Set(prev); next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId); return next; });
  const resetResume = () => { setData(createEmptyResumeJSON()); setHiddenSections(new Set()); setCurrentResumeId(null); toast({ title: "Resume cleared" }); };

  // ── Preview data with hidden sections stripped ─────────────────────────
  const previewData: ResumeJSON = {
    header: hiddenSections.has("personal") ? { name: "", title: "", email: "", phone: "", location: "", linkedin: "" } : data.header,
    summary: hiddenSections.has("summary") ? "" : data.summary,
    experience: hiddenSections.has("experience") ? [] : data.experience,
    education: hiddenSections.has("education") ? [] : data.education,
    skills: hiddenSections.has("skills") ? {} : data.skills,
    projects: hiddenSections.has("projects") ? [] : data.projects,
    certifications: hiddenSections.has("certifications") ? [] : data.certifications,
  };

  const fileName = data.header.name ? `${data.header.name.replace(/\s+/g, "_")}_Resume` : "Resume";
  const handleDownloadPDF = () => { if (resumeRef.current) exportToPDF(resumeRef.current, fileName); };
  const handleDownloadWord = () => exportToWord(data, fileName);
  const handlePrintView = () => { localStorage.setItem("printResumeData", JSON.stringify(data)); window.open("/print-resume", "_blank"); };

  if (!isLoaded) return <div className="flex h-[calc(100vh-68px)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-[calc(100vh-68px)] w-full overflow-hidden bg-background">
      {/* ─── LEFT PANEL: Accordion editor ─────────────────────────────── */}
      <div className={cn("w-full lg:w-[45%] lg:min-w-[380px] flex flex-col border-r border-border", mobileView !== "editor" && "hidden lg:flex")}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
          <h1 className="text-sm font-bold flex-1">Resume Builder</h1>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isSaving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</> : lastSaved ? <><Cloud className="h-3 w-3 text-green-500" /> Saved</> : <><CloudOff className="h-3 w-3" /> Not saved</>}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMobileView("preview")} className="h-7 text-xs lg:hidden">Preview</Button>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={resetResume} className="h-8 w-8 shrink-0 text-muted-foreground"><RotateCcw className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Reset all fields</TooltipContent></Tooltip>
        </div>

        <div className="px-4 py-2.5 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Resume Completeness</span>
            <span className={`text-xs font-bold ${completenessColor}`}>{completeness}% - {completenessLabel}</span>
          </div>
          <Progress value={completeness} className="h-1.5" />
        </div>

        <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Import Resume</span>
            <Badge variant="secondary" className="text-[10px] h-5">AI-Powered</Badge>
          </div>
          <DocumentUpload onTextExtracted={handleResumeImported} isLoading={isParsingResume} label={isParsingResume ? "AI is parsing your resume..." : "Drop any file here - PDF, Word, Image, Text"} />
        </div>

        {isParsingResume && (
          <div className="px-4 py-3 space-y-2 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2 text-sm text-primary font-medium"><Loader2 className="h-4 w-4 animate-spin" /><span>AI is extracting your resume data...</span></div>
            <ResumeFormSkeleton />
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className={isParsingResume ? "opacity-30 pointer-events-none" : ""}>
            <Accordion type="multiple" defaultValue={["personal", "summary"]} className="px-3 py-1">
              {SECTIONS.map((section) => {
                const count = section.getCount(data);
                const sectionCompleteness = section.getCompleteness(data);
                const isHidden = hiddenSections.has(section.id);
                return (
                  <AccordionItem key={section.id} value={section.id} className="border-b border-border/40">
                    <div className="flex items-center group">
                      <AccordionTrigger className="flex-1 py-3 px-2 text-sm hover:no-underline gap-2 [&>svg]:order-first [&>svg]:text-muted-foreground">
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={isHidden ? "opacity-40" : ""}>{section.icon}</span>
                          <span className={`font-medium truncate ${isHidden ? "opacity-40 line-through" : ""}`}>{section.label}</span>
                          {count > 0 && <Badge variant="secondary" className="ml-auto text-[10px] h-5 shrink-0">{count}</Badge>}
                          {sectionCompleteness > 0 && sectionCompleteness < 100 && <Tooltip><TooltipTrigger asChild><AlertCircle className="h-3 w-3 text-yellow-500 shrink-0" /></TooltipTrigger><TooltipContent>{sectionCompleteness}% complete</TooltipContent></Tooltip>}
                          {sectionCompleteness === 100 && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                        </span>
                      </AccordionTrigger>
                      <Tooltip><TooltipTrigger asChild><button onClick={(e) => { e.stopPropagation(); toggleSectionVisibility(section.id); }} className="p-1.5 mr-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">{isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></TooltipTrigger><TooltipContent>{isHidden ? "Show on resume" : "Hide from resume"}</TooltipContent></Tooltip>
                    </div>
                    <AccordionContent className="px-2 pb-4">
                      {section.id === "personal" && (
                        <div className="grid grid-cols-2 gap-3">
                          {([{ field: "name" as const, label: "Full Name *", placeholder: "John Doe" }, { field: "title" as const, label: "Job Title", placeholder: "Data Engineer" }, { field: "email" as const, label: "Email *", placeholder: "john@email.com", type: "email" }, { field: "phone" as const, label: "Phone", placeholder: "+1 555-123-4567" }, { field: "location" as const, label: "Location", placeholder: "Dallas, TX" }, { field: "linkedin" as const, label: "LinkedIn", placeholder: "linkedin.com/in/johndoe" }] as const).map(({ field, label, placeholder, type }) => (
                            <div key={field} className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label><Input type={type || "text"} placeholder={placeholder} value={data.header[field]} onChange={(e) => updateHeader(field, e.target.value)} className="bg-background h-9 text-sm" /></div>
                          ))}
                        </div>
                      )}
                      {section.id === "summary" && (
                        <div className="space-y-2">
                          <Textarea placeholder="Brief professional summary..." value={data.summary} onChange={(e) => setData((prev) => ({ ...prev, summary: e.target.value }))} className="bg-background text-sm min-h-[100px]" />
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{data.summary.length} chars{data.summary.length > 0 && data.summary.length < 50 && " - too short"}</span>
                            <Button type="button" variant="outline" size="sm" onClick={enhanceSummaryWithAI} disabled={aiEnhancingSection === "summary"} className="h-7 text-xs gap-1.5">
                              {aiEnhancingSection === "summary" ? <><Loader2 className="h-3 w-3 animate-spin" /> Enhancing...</> : <><Sparkles className="h-3 w-3" /> {data.summary ? "Enhance with AI" : "Generate with AI"}</>}
                            </Button>
                          </div>
                        </div>
                      )}
                      {section.id === "experience" && (
                        <div className="space-y-4">
                          {data.experience.map((exp, index) => (
                            <div key={exp.id} className="p-3 bg-muted/40 rounded-lg space-y-3 border border-border/30">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Experience {index + 1}</p>
                                <div className="flex items-center gap-1">
                                  {exp.bullets.length > 0 && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" onClick={() => enhanceBulletsWithAI(exp.id)} disabled={aiEnhancingSection === `exp-${exp.id}`} className="h-6 w-6 text-primary">{aiEnhancingSection === `exp-${exp.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent>Enhance bullets with AI</TooltipContent></Tooltip>}
                                  {data.experience.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeExperience(exp.id)} className="h-6 w-6 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Company *</Label><Input placeholder="Company Inc." value={exp.company_or_client} onChange={(e) => updateExperience(exp.id, "company_or_client", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Role *</Label><Input placeholder="Data Engineer" value={exp.role} onChange={(e) => updateExperience(exp.id, "role", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Start Date</Label><Input placeholder="Feb 2024" value={exp.start_date} onChange={(e) => updateExperience(exp.id, "start_date", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">End Date</Label><Input placeholder="Present" value={exp.end_date} onChange={(e) => updateExperience(exp.id, "end_date", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1 col-span-2"><Label className="text-xs text-muted-foreground">Location</Label><Input placeholder="Dallas, TX" value={exp.location} onChange={(e) => updateExperience(exp.id, "location", e.target.value)} className="bg-background h-8 text-sm" /></div>
                              </div>
                              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Bullet Points (one per line)</Label><Textarea placeholder={"• Designed ETL pipelines\n• Led data migration"} value={exp.bullets.join("\n")} onChange={(e) => updateExperience(exp.id, "bullets", e.target.value.split("\n").filter((b) => b.trim()))} className="bg-background text-sm min-h-[80px]" /></div>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={addExperience} className="w-full gap-2 border-dashed"><Plus className="h-3 w-3" /> Add Experience</Button>
                        </div>
                      )}
                      {section.id === "education" && (
                        <div className="space-y-3">
                          {data.education.map((edu) => (
                            <div key={edu.id} className="p-3 bg-muted/40 rounded-lg space-y-2 relative border border-border/30">
                              {data.education.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeEducation(edu.id)} className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Institution</Label><Input placeholder="University of..." value={edu.institution} onChange={(e) => updateEducation(edu.id, "institution", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Degree</Label><Input placeholder="Master's" value={edu.degree} onChange={(e) => updateEducation(edu.id, "degree", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Field</Label><Input placeholder="Computer Science" value={edu.field} onChange={(e) => updateEducation(edu.id, "field", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Graduation</Label><Input placeholder="May 2023" value={edu.graduation_date} onChange={(e) => updateEducation(edu.id, "graduation_date", e.target.value)} className="bg-background h-8 text-sm" /></div>
                              </div>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={addEducation} className="w-full gap-2 border-dashed"><Plus className="h-3 w-3" /> Add Education</Button>
                        </div>
                      )}
                      {section.id === "skills" && (
                        <div className="space-y-3">
                          {Object.entries(data.skills).map(([categoryKey, skills]) => (
                            <div key={categoryKey} className="p-3 bg-muted/40 rounded-lg space-y-2 border border-border/30">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{SKILL_CATEGORY_LABELS[categoryKey] || categoryKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</span>
                                <Button type="button" variant="ghost" size="sm" onClick={() => { const s = { ...data.skills }; delete s[categoryKey]; setData((p) => ({ ...p, skills: s })); }} className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
                              </div>
                              <div className="flex gap-2">
                                <Input placeholder="Add skill..." value={currentSkillCategory === categoryKey ? skillInput : ""} onChange={(e) => { setCurrentSkillCategory(categoryKey); setSkillInput(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkillToCategory(categoryKey, skillInput); setSkillInput(""); } }} className="bg-background h-7 text-sm" />
                                <Button type="button" variant="outline" size="sm" onClick={() => { addSkillToCategory(categoryKey, skillInput); setSkillInput(""); }} className="h-7 text-xs">Add</Button>
                              </div>
                              {skills.length > 0 && <div className="flex flex-wrap gap-1.5">{skills.map((skill) => <Badge key={skill} variant="secondary" className="text-xs gap-1 cursor-default">{skill}<button type="button" onClick={() => removeSkillFromCategory(categoryKey, skill)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button></Badge>)}</div>}
                            </div>
                          ))}
                          <div className="p-3 border-2 border-dashed border-muted-foreground/20 rounded-lg space-y-2">
                            <span className="text-xs text-muted-foreground">Add New Skill Category</span>
                            <div className="flex gap-2">
                              <Input placeholder="e.g., Cloud Platforms" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="bg-background h-7 text-sm" onKeyDown={(e) => { if (e.key === "Enter" && newCategoryName.trim()) { const key = newCategoryName.trim().toLowerCase().replace(/\s+/g, "_").replace(/&/g, ""); if (!data.skills[key]) setData((p) => ({ ...p, skills: { ...p.skills, [key]: [] } })); setNewCategoryName(""); } }} />
                              <Button type="button" variant="outline" size="sm" onClick={() => { if (newCategoryName.trim()) { const key = newCategoryName.trim().toLowerCase().replace(/\s+/g, "_").replace(/&/g, ""); if (!data.skills[key]) setData((p) => ({ ...p, skills: { ...p.skills, [key]: [] } })); setNewCategoryName(""); } }} className="h-7"><Plus className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          {Object.keys(data.skills).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No skills yet. Upload a resume or add categories above.</p>}
                        </div>
                      )}
                      {section.id === "projects" && (
                        <div className="space-y-4">
                          {data.projects.map((project, index) => (
                            <div key={project.id} className="p-3 bg-muted/40 rounded-lg space-y-3 border border-border/30">
                              <div className="flex justify-between items-center"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project {index + 1}</span><Button type="button" variant="ghost" size="icon" onClick={() => removeProject(index)} className="h-6 w-6 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button></div>
                              <div className="grid gap-3">
                                <div><Label className="text-xs text-muted-foreground">Project Name</Label><Input value={project.title} onChange={(e) => updateProject(index, { title: e.target.value })} placeholder="e.g., AI-Powered Chatbot" className="h-8 text-sm" /></div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div><Label className="text-xs text-muted-foreground">Organization</Label><Input value={project.organization} onChange={(e) => updateProject(index, { organization: e.target.value })} placeholder="e.g., MIT" className="h-8 text-sm" /></div>
                                  <div><Label className="text-xs text-muted-foreground">Date</Label><Input value={project.date} onChange={(e) => updateProject(index, { date: e.target.value })} placeholder="May 2024" className="h-8 text-sm" /></div>
                                </div>
                                <div>
                                  <div className="flex justify-between items-center mb-1"><Label className="text-xs text-muted-foreground">Key Points</Label><Button type="button" variant="ghost" size="sm" onClick={() => updateProject(index, { bullets: [...project.bullets, ""] })} className="h-5 text-[10px] gap-1"><Plus className="h-2.5 w-2.5" /> Add</Button></div>
                                  <div className="space-y-2">{project.bullets.map((bullet, bulletIdx) => (<div key={bulletIdx} className="flex gap-2 items-start"><span className="text-muted-foreground text-xs mt-2.5">&#8226;</span><Textarea value={bullet} onChange={(e) => { const b = [...project.bullets]; b[bulletIdx] = e.target.value; updateProject(index, { bullets: b }); }} placeholder="Describe what you built..." className="min-h-[50px] text-sm" /><Button type="button" variant="ghost" size="sm" onClick={() => updateProject(index, { bullets: project.bullets.filter((_, i) => i !== bulletIdx) })} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"><X className="h-3 w-3" /></Button></div>))}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={addProject} className="w-full gap-2 border-dashed"><Plus className="h-3 w-3" /> Add Project</Button>
                        </div>
                      )}
                      {section.id === "certifications" && (
                        <div className="space-y-3">
                          {data.certifications.map((cert) => (
                            <div key={cert.id} className="p-3 bg-muted/40 rounded-lg space-y-2 relative border border-border/30">
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeCertification(cert.id)} className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1 col-span-2"><Label className="text-xs text-muted-foreground">Certification Name</Label><Input placeholder="AWS Certified..." value={cert.name} onChange={(e) => updateCertification(cert.id, "name", e.target.value)} className="bg-background h-8 text-sm" /></div>
                                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Date</Label><Input placeholder="Sep 2024" value={cert.date} onChange={(e) => updateCertification(cert.id, "date", e.target.value)} className="bg-background h-8 text-sm" /></div>
                              </div>
                              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Issuer</Label><Input placeholder="Amazon Web Services" value={cert.issuer} onChange={(e) => updateCertification(cert.id, "issuer", e.target.value)} className="bg-background h-8 text-sm" /></div>
                            </div>
                          ))}
                          {data.certifications.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No certifications added yet</p>}
                          <Button type="button" variant="outline" size="sm" onClick={addCertification} className="w-full gap-2 border-dashed"><Plus className="h-3 w-3" /> Add Certification</Button>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </ScrollArea>
      </div>

      {/* ─── RIGHT PANEL: Resume preview ──────────────────────────────── */}
      <div className={cn("flex-1 flex flex-col min-w-0 bg-muted/20", mobileView !== "preview" && "hidden lg:flex")}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMobileView("editor")} className="h-7 text-xs lg:hidden">← Editor</Button>
            <h2 className="text-sm font-bold">Preview</h2>
            {hiddenSections.size > 0 && <Badge variant="outline" className="text-[10px] h-5">{hiddenSections.size} hidden</Badge>}
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handlePrintView} disabled={isExporting} className="h-8 gap-1.5"><Printer className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Print</span></Button></TooltipTrigger><TooltipContent>Print-friendly view</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleDownloadWord} disabled={isExporting} className="h-8 gap-1.5"><FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Word</span></Button></TooltipTrigger><TooltipContent>Export as .docx</TooltipContent></Tooltip>
            <Button size="sm" onClick={handleDownloadPDF} disabled={isExporting} className="h-8 gap-1.5">{isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF</Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto shadow-xl relative" style={{ width: "fit-content" }}>
            <ResumeTemplate ref={resumeRef} data={previewData} />
            {isParsingResume && <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded"><div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-primary animate-spin" /><span className="text-sm text-muted-foreground">Parsing resume...</span></div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

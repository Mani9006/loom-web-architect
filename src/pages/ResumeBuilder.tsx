import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useResumeExport } from "@/hooks/use-resume-export";
import {
  ResumeJSON,
  ExperienceEntry,
  EducationEntry,
  CertificationEntry,
  ProjectEntry,
  LanguageEntry,
  VolunteerEntry,
  AwardEntry,
  CustomSection,
  CustomSectionEntry,
  SKILL_CATEGORY_LABELS,
  createEmptyResumeJSON,
} from "@/types/resume";
import { calculateATSScore, buildSectionFixPrompt, ATSScore, ATSIssue } from "@/lib/ats-scorer";
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
  AlertTriangle,
  Info,
  Printer,
  Cloud,
  CloudOff,
  Wand2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Target,
  Zap,
  Copy,
  Check,
  Globe,
  Heart,
  Trophy,
  Shield,
  Pencil,
  Trash2,
  LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BuiltInSectionId =
  | "personal"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "languages"
  | "volunteer"
  | "awards";

// A section can be a built-in type or a custom section (prefixed with "custom_")
export type SectionId = BuiltInSectionId | string;

interface ActiveSection {
  id: SectionId;
  label: string;
  builtIn: boolean; // false for custom sections
}

// Built-in section metadata (icon lookup, count functions)
const BUILT_IN_ICONS: Record<BuiltInSectionId, React.ReactNode> = {
  personal: <UserIcon className="h-4 w-4" />,
  summary: <FileText className="h-4 w-4" />,
  experience: <Briefcase className="h-4 w-4" />,
  education: <GraduationCap className="h-4 w-4" />,
  skills: <Wrench className="h-4 w-4" />,
  projects: <FolderKanban className="h-4 w-4" />,
  certifications: <Award className="h-4 w-4" />,
  languages: <Globe className="h-4 w-4" />,
  volunteer: <Heart className="h-4 w-4" />,
  awards: <Trophy className="h-4 w-4" />,
};

const DEFAULT_SECTIONS: ActiveSection[] = [
  { id: "personal", label: "Personal Information", builtIn: true },
  { id: "summary", label: "Professional Summary", builtIn: true },
  { id: "experience", label: "Work Experience", builtIn: true },
  { id: "education", label: "Education", builtIn: true },
  { id: "skills", label: "Skills", builtIn: true },
  { id: "projects", label: "Projects", builtIn: true },
  { id: "certifications", label: "Certifications", builtIn: true },
];

// All available built-in sections (for the "Add Section" picker)
const ALL_BUILT_IN_SECTIONS: ActiveSection[] = [
  ...DEFAULT_SECTIONS,
  { id: "languages", label: "Languages", builtIn: true },
  { id: "volunteer", label: "Volunteer Experience", builtIn: true },
  { id: "awards", label: "Awards & Publications", builtIn: true },
];

function getSectionCount(id: SectionId, data: ResumeJSON): number {
  switch (id) {
    case "personal": return [data.header.name, data.header.title, data.header.email, data.header.phone, data.header.location, data.header.linkedin].filter(Boolean).length;
    case "summary": return data.summary ? 1 : 0;
    case "experience": return data.experience.filter((e) => e.company_or_client).length;
    case "education": return data.education.filter((e) => e.institution).length;
    case "skills": return Object.values(data.skills).flat().length;
    case "projects": return data.projects.filter((p) => p.title).length;
    case "certifications": return data.certifications.filter((c) => c.name).length;
    case "languages": return (data.languages || []).filter((l) => l.language).length;
    case "volunteer": return (data.volunteer || []).filter((v) => v.organization).length;
    case "awards": return (data.awards || []).filter((a) => a.title).length;
    default: {
      const cs = (data.customSections || []).find((s) => s.id === id);
      return cs ? cs.entries.filter((e) => e.title).length : 0;
    }
  }
}

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
  mode = "resume",
): Promise<string> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messages, mode }),
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
  const [activeSections, setActiveSections] = useState<ActiveSection[]>(DEFAULT_SECTIONS);
  const [showAddSection, setShowAddSection] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState("");
  const [expandedCustomId, setExpandedCustomId] = useState<string | null>(null);
  const [hiddenSections, setHiddenSections] = useState<Set<SectionId>>(new Set());
  const [aiEnhancingSection, setAiEnhancingSection] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [currentSkillCategory, setCurrentSkillCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const [expandedExpId, setExpandedExpId] = useState<string | null>(null);
  const [expandedEduId, setExpandedEduId] = useState<string | null>(null);
  const [expandedProjIdx, setExpandedProjIdx] = useState<number | null>(null);
  const [expandedCertId, setExpandedCertId] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [showJobTarget, setShowJobTarget] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [keywordMatches, setKeywordMatches] = useState<{ matched: string[]; missing: string[] } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedLangId, setExpandedLangId] = useState<string | null>(null);
  const [expandedVolId, setExpandedVolId] = useState<string | null>(null);
  const [expandedAwardId, setExpandedAwardId] = useState<string | null>(null);
  const [showATSDetails, setShowATSDetails] = useState(false);
  const [aiFixingSection, setAiFixingSection] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── ATS Score (live, memoized) ──────────────────────────────────────────
  const atsScore = useMemo(() => calculateATSScore(data), [data]);
  const atsColor = atsScore.overall >= 80 ? "text-green-500" : atsScore.overall >= 60 ? "text-yellow-500" : "text-red-500";
  const atsBgColor = atsScore.overall >= 80 ? "bg-green-500" : atsScore.overall >= 60 ? "bg-yellow-500" : "bg-red-500";
  const getIssuesForSection = (sectionName: string) => atsScore.issues.filter((i) => i.section === sectionName);

  // Map our section IDs to ATS section names
  const sectionToATSName: Record<string, string> = {
    personal: "Personal Info",
    summary: "Summary",
    experience: "Experience",
    education: "Education",
    skills: "Skills",
    projects: "Projects",
    certifications: "Certifications",
    formatting: "Formatting",
  };

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
          languages: Array.isArray(r.languages) ? r.languages : [],
          volunteer: Array.isArray(r.volunteer) ? r.volunteer : [],
          awards: Array.isArray(r.awards) ? r.awards : [],
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

  // ── Completeness (simplified: based on how many active sections have content) ─
  const completeness = useMemo(() => {
    if (activeSections.length === 0) return 0;
    const filled = activeSections.filter((s) => getSectionCount(s.id, data) > 0).length;
    return Math.round((filled / activeSections.length) * 100);
  }, [activeSections, data]);
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
      ], "resume_parse");

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
      ], "resume_enhance");
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
      ], "resume_bullets");
      const enhanced = JSON.parse(result.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
      if (Array.isArray(enhanced) && enhanced.length > 0) {
        setData((prev) => ({ ...prev, experience: prev.experience.map((e) => (e.id === expId ? { ...e, bullets: enhanced } : e)) }));
        toast({ title: "Bullets enhanced!", description: `${enhanced.length} bullet points improved.` });
      }
    } catch { toast({ title: "Enhancement failed", variant: "destructive" }); }
    finally { setAiEnhancingSection(null); }
  };

  // ── Keyword analysis (local, instant) ────────────────────────────────
  const analyzeKeywords = useCallback((jd: string) => {
    if (!jd.trim()) { setKeywordMatches(null); return; }
    const resumeText = [
      data.summary,
      ...data.experience.flatMap((e) => [e.role, e.company_or_client, ...e.bullets]),
      ...data.education.map((e) => `${e.degree} ${e.field} ${e.institution}`),
      ...Object.values(data.skills).flat(),
      ...data.projects.flatMap((p) => [p.title, ...p.bullets]),
    ].join(" ").toLowerCase();

    const stopWords = new Set(["the", "a", "an", "and", "or", "is", "in", "to", "for", "of", "with", "on", "at", "by", "from", "as", "be", "are", "was", "were", "will", "can", "has", "have", "had", "do", "does", "this", "that", "it", "we", "you", "they", "our", "your", "their", "its", "not", "but", "if", "about", "all", "also", "into", "than", "then", "up", "out", "no", "so", "what", "which", "who", "how", "each", "she", "he", "my", "over"]);
    const words = jd.toLowerCase().replace(/[^a-z0-9+#.\- ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
    const uniqueKeywords = [...new Set(words)];

    const matched: string[] = [];
    const missing: string[] = [];
    uniqueKeywords.forEach((kw) => {
      if (resumeText.includes(kw)) matched.push(kw);
      else missing.push(kw);
    });
    setKeywordMatches({ matched, missing });
  }, [data]);

  useEffect(() => {
    if (jobDescription) analyzeKeywords(jobDescription);
    else setKeywordMatches(null);
  }, [jobDescription, analyzeKeywords]);

  // ── AI Tailor resume to job description ─────────────────────────────
  const tailorResumeToJob = async () => {
    if (!jobDescription.trim()) { toast({ title: "Add a job description first", variant: "destructive" }); return; }
    setIsTailoring(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const currentResume = JSON.stringify(data, null, 2);
      const result = await streamAIText(session.session.access_token, [
        { role: "system", content: `You are an expert resume tailoring assistant. Given a resume JSON and a job description, optimize the resume to better match the job. Improve the summary to target the role, enhance bullet points with relevant keywords, and reorder skills to prioritize job-relevant ones. Return ONLY valid JSON in the EXACT same schema as the input. Do NOT add fabricated experience or skills the person doesn't have - only reword and optimize existing content.` },
        { role: "user", content: `JOB DESCRIPTION:\n${jobDescription}\n\nCURRENT RESUME:\n${currentResume}\n\nTailor this resume to the job description. Return the full JSON.` },
      ], "resume_fix");

      const tailored = parseAIResponse(result);
      if (!tailored) throw new Error("Could not parse tailored resume");
      setData({
        header: tailored.header || data.header,
        summary: tailored.summary || data.summary,
        experience: tailored.experience?.map((e: any) => ({ ...e, id: e.id || crypto.randomUUID(), bullets: Array.isArray(e.bullets) ? e.bullets : [] })) || data.experience,
        education: tailored.education || data.education,
        certifications: tailored.certifications || data.certifications,
        skills: tailored.skills || data.skills,
        projects: tailored.projects?.map((p: any) => ({ ...p, id: p.id || crypto.randomUUID(), bullets: Array.isArray(p.bullets) ? p.bullets : [] })) || data.projects,
      });
      toast({ title: "Resume tailored!", description: "Your resume has been optimized for this job." });
    } catch { toast({ title: "Tailoring failed", variant: "destructive" }); }
    finally { setIsTailoring(false); }
  };

  // ── Move items up/down helpers ──────────────────────────────────────
  const moveExperience = (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= data.experience.length) return;
    setData((prev) => {
      const arr = [...prev.experience];
      [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
      return { ...prev, experience: arr };
    });
  };
  const moveEducation = (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= data.education.length) return;
    setData((prev) => {
      const arr = [...prev.education];
      [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
      return { ...prev, education: arr };
    });
  };
  const moveProject = (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= data.projects.length) return;
    setData((prev) => {
      const arr = [...prev.projects];
      [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
      return { ...prev, projects: arr };
    });
  };

  // ── Copy resume as plain text ───────────────────────────────────────
  const copyAsPlainText = () => {
    const lines: string[] = [];
    if (data.header.name) lines.push(data.header.name);
    if (data.header.title) lines.push(data.header.title);
    const contact = [data.header.email, data.header.phone, data.header.location, data.header.linkedin].filter(Boolean).join(" | ");
    if (contact) lines.push(contact);
    if (data.summary) { lines.push("", "SUMMARY", data.summary); }
    if (data.experience.some((e) => e.company_or_client)) {
      lines.push("", "EXPERIENCE");
      data.experience.filter((e) => e.company_or_client).forEach((e) => {
        lines.push(`${e.role} | ${e.company_or_client} | ${e.start_date} - ${e.end_date}`);
        e.bullets.forEach((b) => lines.push(`  - ${b}`));
      });
    }
    if (data.education.some((e) => e.institution)) {
      lines.push("", "EDUCATION");
      data.education.filter((e) => e.institution).forEach((e) => lines.push(`${e.degree} in ${e.field}, ${e.institution} (${e.graduation_date})`));
    }
    if (Object.values(data.skills).flat().length > 0) {
      lines.push("", "SKILLS");
      Object.entries(data.skills).forEach(([k, v]) => { if (v.length > 0) lines.push(`${SKILL_CATEGORY_LABELS[k] || k}: ${v.join(", ")}`); });
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedField("resume");
    setTimeout(() => setCopiedField(null), 2000);
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
  const addLanguage = () => setData((prev) => ({ ...prev, languages: [...(prev.languages || []), { id: crypto.randomUUID(), language: "", proficiency: "Professional" }] }));
  const removeLanguage = (id: string) => setData((prev) => ({ ...prev, languages: (prev.languages || []).filter((l) => l.id !== id) }));
  const updateLanguage = (id: string, field: keyof LanguageEntry, value: string) => setData((prev) => ({ ...prev, languages: (prev.languages || []).map((l) => (l.id === id ? { ...l, [field]: value } : l)) }));
  const addVolunteer = () => setData((prev) => ({ ...prev, volunteer: [...(prev.volunteer || []), { id: crypto.randomUUID(), role: "", organization: "", date: "", bullets: [] }] }));
  const removeVolunteer = (id: string) => setData((prev) => ({ ...prev, volunteer: (prev.volunteer || []).filter((v) => v.id !== id) }));
  const updateVolunteer = (id: string, field: keyof VolunteerEntry, value: any) => setData((prev) => ({ ...prev, volunteer: (prev.volunteer || []).map((v) => (v.id === id ? { ...v, [field]: value } : v)) }));
  const addAward = () => setData((prev) => ({ ...prev, awards: [...(prev.awards || []), { id: crypto.randomUUID(), title: "", issuer: "", date: "" }] }));
  const removeAward = (id: string) => setData((prev) => ({ ...prev, awards: (prev.awards || []).filter((a) => a.id !== id) }));
  const updateAward = (id: string, field: keyof AwardEntry, value: string) => setData((prev) => ({ ...prev, awards: (prev.awards || []).map((a) => (a.id === id ? { ...a, [field]: value } : a)) }));
  const toggleSectionVisibility = (sectionId: SectionId) => setHiddenSections((prev) => { const next = new Set(prev); next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId); return next; });

  // ── Section management ────────────────────────────────────────────────
  const removeSection = (sectionId: SectionId) => {
    setActiveSections((prev) => prev.filter((s) => s.id !== sectionId));
    // If it's a custom section, also remove data
    if (sectionId.startsWith("custom_")) {
      setData((prev) => ({ ...prev, customSections: (prev.customSections || []).filter((s) => s.id !== sectionId) }));
    }
  };
  const addBuiltInSection = (sectionId: BuiltInSectionId) => {
    const existing = ALL_BUILT_IN_SECTIONS.find((s) => s.id === sectionId);
    if (existing && !activeSections.some((s) => s.id === sectionId)) {
      setActiveSections((prev) => [...prev, existing]);
    }
    setShowAddSection(false);
  };
  const addCustomSection = (name: string) => {
    const id = `custom_${crypto.randomUUID().slice(0, 8)}`;
    setActiveSections((prev) => [...prev, { id, label: name, builtIn: false }]);
    setData((prev) => ({ ...prev, customSections: [...(prev.customSections || []), { id, name, entries: [] }] }));
    setShowAddSection(false);
  };
  const renameSection = (sectionId: SectionId, newLabel: string) => {
    setActiveSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, label: newLabel } : s)));
    if (sectionId.startsWith("custom_")) {
      setData((prev) => ({ ...prev, customSections: (prev.customSections || []).map((s) => (s.id === sectionId ? { ...s, name: newLabel } : s)) }));
    }
    setEditingSectionId(null);
  };
  const addCustomEntry = (sectionId: string) => {
    setData((prev) => ({
      ...prev,
      customSections: (prev.customSections || []).map((s) =>
        s.id === sectionId ? { ...s, entries: [...s.entries, { id: crypto.randomUUID(), title: "", subtitle: "", date: "", bullets: [] }] } : s
      ),
    }));
  };
  const removeCustomEntry = (sectionId: string, entryId: string) => {
    setData((prev) => ({
      ...prev,
      customSections: (prev.customSections || []).map((s) =>
        s.id === sectionId ? { ...s, entries: s.entries.filter((e) => e.id !== entryId) } : s
      ),
    }));
  };
  const updateCustomEntry = (sectionId: string, entryId: string, field: keyof CustomSectionEntry, value: any) => {
    setData((prev) => ({
      ...prev,
      customSections: (prev.customSections || []).map((s) =>
        s.id === sectionId ? { ...s, entries: s.entries.map((e) => (e.id === entryId ? { ...e, [field]: value } : e)) } : s
      ),
    }));
  };
  const resetResume = () => { setData(createEmptyResumeJSON()); setHiddenSections(new Set()); setActiveSections(DEFAULT_SECTIONS); setCurrentResumeId(null); toast({ title: "Resume cleared" }); };

  // ── AI Fix Section Issues ─────────────────────────────────────────────
  const aiFixSection = async (sectionName: string) => {
    const issues = getIssuesForSection(sectionName);
    if (issues.length === 0) return;
    setAiFixingSection(sectionName);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const prompt = buildSectionFixPrompt(sectionName, data, issues);
      const result = await streamAIText(session.session.access_token, [
        { role: "system", content: prompt },
        { role: "user", content: "Fix the issues and return the improved content." },
      ], "resume_fix");

      if (sectionName === "Summary") {
        const cleaned = result.replace(/^["']|["']$/g, "").replace(/```/g, "").trim();
        if (cleaned) setData((prev) => ({ ...prev, summary: cleaned }));
      } else if (sectionName === "Experience") {
        const parsed = parseAIResponse(result);
        if (parsed && Array.isArray(parsed)) {
          setData((prev) => ({
            ...prev,
            experience: parsed.map((e: any, idx: number) => ({
              id: prev.experience[idx]?.id || crypto.randomUUID(),
              role: e.role || prev.experience[idx]?.role || "",
              company_or_client: e.company_or_client || prev.experience[idx]?.company_or_client || "",
              start_date: e.start_date || prev.experience[idx]?.start_date || "",
              end_date: e.end_date || prev.experience[idx]?.end_date || "",
              location: e.location || prev.experience[idx]?.location || "",
              bullets: Array.isArray(e.bullets) ? e.bullets : prev.experience[idx]?.bullets || [],
            })),
          }));
        }
      } else if (sectionName === "Skills") {
        const parsed = parseAIResponse(result);
        if (parsed && typeof parsed === "object") {
          setData((prev) => ({ ...prev, skills: { ...prev.skills, ...parsed } }));
        }
      }
      toast({ title: `${sectionName} improved!`, description: "AI has fixed the ATS issues." });
    } catch {
      toast({ title: "AI fix failed", variant: "destructive" });
    } finally {
      setAiFixingSection(null);
    }
  };

  // ── Preview data with hidden sections stripped ─────────────────────────
  const previewData: ResumeJSON = {
    header: hiddenSections.has("personal") ? { name: "", title: "", email: "", phone: "", location: "", linkedin: "" } : data.header,
    summary: hiddenSections.has("summary") ? "" : data.summary,
    experience: hiddenSections.has("experience") ? [] : data.experience,
    education: hiddenSections.has("education") ? [] : data.education,
    skills: hiddenSections.has("skills") ? {} : data.skills,
    projects: hiddenSections.has("projects") ? [] : data.projects,
    certifications: hiddenSections.has("certifications") ? [] : data.certifications,
    languages: hiddenSections.has("languages") ? [] : data.languages,
    volunteer: hiddenSections.has("volunteer") ? [] : data.volunteer,
    awards: hiddenSections.has("awards") ? [] : data.awards,
    customSections: data.customSections?.filter((cs) => !hiddenSections.has(cs.id)),
  };

  const fileName = data.header.name ? `${data.header.name.replace(/\s+/g, "_")}_Resume` : "Resume";
  const handleDownloadPDF = () => exportToPDF(previewData, fileName);
  const handleDownloadWord = () => exportToWord(data, fileName);
  const handlePrintView = () => { localStorage.setItem("printResumeData", JSON.stringify(data)); window.open("/print-resume", "_blank"); };

  if (!isLoaded) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ─── LEFT PANEL: Accordion editor ─────────────────────────────── */}
      <div className={cn("w-full lg:w-[38%] lg:min-w-[340px] lg:max-w-[440px] flex flex-col min-h-0 border-r border-border", mobileView !== "editor" && "hidden lg:flex")}>
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

        <ScrollArea className="flex-1 min-h-0">
          {/* Job Description Targeting */}
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() => setShowJobTarget(!showJobTarget)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-orange-500/10 to-amber-500/10 hover:from-orange-500/15 hover:to-amber-500/15 border border-orange-500/20 text-orange-700 dark:text-orange-400 transition-colors"
            >
              <Target className="h-4 w-4" />
              <span className="flex-1 text-left">Target a Job Description</span>
              {keywordMatches && (
                <Badge variant="outline" className="text-[10px] h-5 border-orange-500/30">
                  {keywordMatches.matched.length}/{keywordMatches.matched.length + keywordMatches.missing.length} keywords
                </Badge>
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showJobTarget && "rotate-180")} />
            </button>
            {showJobTarget && (
              <div className="mt-2 p-3 bg-muted/40 rounded-lg border border-border/30 space-y-3">
                <Textarea
                  placeholder="Paste a job description here to get keyword matching and AI-powered tailoring..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="bg-background text-sm min-h-[100px] resize-y"
                />
                {keywordMatches && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Keyword Match</span>
                          <span className={cn("text-xs font-bold",
                            keywordMatches.matched.length / (keywordMatches.matched.length + keywordMatches.missing.length) >= 0.7 ? "text-green-500" :
                            keywordMatches.matched.length / (keywordMatches.matched.length + keywordMatches.missing.length) >= 0.4 ? "text-yellow-500" : "text-red-400"
                          )}>
                            {Math.round((keywordMatches.matched.length / (keywordMatches.matched.length + keywordMatches.missing.length)) * 100)}%
                          </span>
                        </div>
                        <Progress value={Math.round((keywordMatches.matched.length / (keywordMatches.matched.length + keywordMatches.missing.length)) * 100)} className="h-1.5" />
                      </div>
                    </div>
                    {keywordMatches.missing.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Missing Keywords</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {keywordMatches.missing.slice(0, 20).map((kw) => (
                            <Badge key={kw} variant="outline" className="text-[10px] border-red-500/30 text-red-500">{kw}</Badge>
                          ))}
                          {keywordMatches.missing.length > 20 && <span className="text-[10px] text-muted-foreground">+{keywordMatches.missing.length - 20} more</span>}
                        </div>
                      </div>
                    )}
                    {keywordMatches.matched.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium text-green-500 uppercase tracking-wider">Matched</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {keywordMatches.matched.slice(0, 15).map((kw) => (
                            <Badge key={kw} variant="outline" className="text-[10px] border-green-500/30 text-green-500">{kw}</Badge>
                          ))}
                          {keywordMatches.matched.length > 15 && <span className="text-[10px] text-muted-foreground">+{keywordMatches.matched.length - 15} more</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={tailorResumeToJob}
                  disabled={isTailoring || !jobDescription.trim()}
                  className="w-full gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                >
                  {isTailoring ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> AI is tailoring your resume...</> : <><Zap className="h-3.5 w-3.5" /> Tailor Resume to This Job</>}
                </Button>
              </div>
            )}
          </div>

          <div className={isParsingResume ? "opacity-30 pointer-events-none" : ""}>
            <Accordion type="multiple" defaultValue={["personal", "summary"]} className="px-3 py-1">
              {activeSections.map((section) => {
                const count = getSectionCount(section.id, data);
                const isHidden = hiddenSections.has(section.id);
                const sectionIcon = section.builtIn ? BUILT_IN_ICONS[section.id as BuiltInSectionId] : <LayoutList className="h-4 w-4" />;
                return (
                  <AccordionItem key={section.id} value={section.id} className="border-b border-border/40">
                    <div className="flex items-center group">
                      <AccordionTrigger className="flex-1 py-3 px-2 text-sm hover:no-underline gap-2 [&>svg]:order-first [&>svg]:text-muted-foreground">
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={isHidden ? "opacity-40" : ""}>{sectionIcon}</span>
                          {editingSectionId === section.id ? (
                            <input
                              autoFocus
                              value={editingSectionLabel}
                              onChange={(e) => setEditingSectionLabel(e.target.value)}
                              onBlur={() => { if (editingSectionLabel.trim()) renameSection(section.id, editingSectionLabel.trim()); else setEditingSectionId(null); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (editingSectionLabel.trim()) renameSection(section.id, editingSectionLabel.trim()); } if (e.key === "Escape") setEditingSectionId(null); }}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-sm bg-background border border-primary/30 rounded px-1.5 py-0.5 outline-none focus:border-primary w-full max-w-[180px]"
                            />
                          ) : (
                            <span
                              className={`font-medium truncate ${isHidden ? "opacity-40 line-through" : ""}`}
                              onDoubleClick={(e) => { e.stopPropagation(); setEditingSectionId(section.id); setEditingSectionLabel(section.label); }}
                            >
                              {section.label}
                            </span>
                          )}
                          {count > 0 && <Badge variant="secondary" className="ml-auto text-[10px] h-5 shrink-0">{count}</Badge>}
                        </span>
                      </AccordionTrigger>
                      <div className="flex items-center shrink-0">
                        <Tooltip><TooltipTrigger asChild><button onClick={(e) => { e.stopPropagation(); setEditingSectionId(section.id); setEditingSectionLabel(section.label); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button></TooltipTrigger><TooltipContent>Rename section</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><button onClick={(e) => { e.stopPropagation(); toggleSectionVisibility(section.id); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">{isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button></TooltipTrigger><TooltipContent>{isHidden ? "Show on resume" : "Hide from resume"}</TooltipContent></Tooltip>
                        {(section.id !== "personal" && section.id !== "summary") && (
                          <Tooltip><TooltipTrigger asChild><button onClick={(e) => { e.stopPropagation(); removeSection(section.id); }} className="p-1 mr-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button></TooltipTrigger><TooltipContent>Remove section</TooltipContent></Tooltip>
                        )}
                      </div>
                    </div>
                    <AccordionContent className="px-2 pb-2 pt-0">
                      {/* ── Personal Info: compact 3-col grid ── */}
                      {section.id === "personal" && (
                        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                          {([{ field: "name" as const, label: "Name", placeholder: "John Doe" }, { field: "title" as const, label: "Title", placeholder: "Data Engineer" }, { field: "email" as const, label: "Email", placeholder: "john@email.com", type: "email" as const }, { field: "phone" as const, label: "Phone", placeholder: "+1 555-123-4567" }, { field: "location" as const, label: "Location", placeholder: "Dallas, TX" }, { field: "linkedin" as const, label: "LinkedIn", placeholder: "linkedin.com/in/..." }] as { field: keyof typeof data.header; label: string; placeholder: string; type?: string }[]).map(({ field, label, placeholder, type }) => (
                            <div key={field}>
                              <Input type={type || "text"} placeholder={`${label}: ${placeholder}`} value={data.header[field]} onChange={(e) => updateHeader(field, e.target.value)} className="bg-background h-7 text-xs" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Summary: compact textarea ── */}
                      {section.id === "summary" && (
                        <div className="space-y-1.5">
                          <Textarea placeholder="Brief professional summary..." value={data.summary} onChange={(e) => setData((prev) => ({ ...prev, summary: e.target.value }))} className="bg-background text-xs min-h-[60px] resize-y" />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{data.summary.length} chars</span>
                            <Button type="button" variant="ghost" size="sm" onClick={enhanceSummaryWithAI} disabled={aiEnhancingSection === "summary"} className="h-6 text-[10px] gap-1 px-2">
                              {aiEnhancingSection === "summary" ? <><Loader2 className="h-3 w-3 animate-spin" /> Enhancing...</> : <><Sparkles className="h-3 w-3" /> {data.summary ? "Enhance" : "Generate"}</>}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* ── Experience: collapsed rows, click to expand ── */}
                      {section.id === "experience" && (
                        <div className="space-y-1">
                          {data.experience.map((exp, index) => (
                            <div key={exp.id} className="rounded border border-border/40 overflow-hidden">
                              {/* Summary row - always visible */}
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedExpId === exp.id && "bg-muted/40")}
                                onClick={() => setExpandedExpId(expandedExpId === exp.id ? null : exp.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedExpId === exp.id && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">
                                  {exp.role || exp.company_or_client ? `${exp.role || "Role"}${exp.company_or_client ? ` @ ${exp.company_or_client}` : ""}` : `Experience ${index + 1}`}
                                </span>
                                {exp.start_date && <span className="text-[10px] text-muted-foreground shrink-0">{exp.start_date}{exp.end_date ? ` - ${exp.end_date}` : ""}</span>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {data.experience.length > 1 && <>
                                    <button type="button" onClick={() => moveExperience(index, "up")} disabled={index === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                                    <button type="button" onClick={() => moveExperience(index, "down")} disabled={index === data.experience.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                                  </>}
                                  {exp.bullets.length > 0 && <button type="button" onClick={() => enhanceBulletsWithAI(exp.id)} disabled={aiEnhancingSection === `exp-${exp.id}`} className="p-0.5 rounded hover:bg-muted text-primary">{aiEnhancingSection === `exp-${exp.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}</button>}
                                  {data.experience.length > 1 && <button type="button" onClick={() => removeExperience(exp.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>}
                                </div>
                              </div>
                              {/* Expanded form */}
                              {expandedExpId === exp.id && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <Input placeholder="Company *" value={exp.company_or_client} onChange={(e) => updateExperience(exp.id, "company_or_client", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Role *" value={exp.role} onChange={(e) => updateExperience(exp.id, "role", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Start date" value={exp.start_date} onChange={(e) => updateExperience(exp.id, "start_date", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="End date" value={exp.end_date} onChange={(e) => updateExperience(exp.id, "end_date", e.target.value)} className="bg-background h-7 text-xs" />
                                  </div>
                                  <Input placeholder="Location" value={exp.location} onChange={(e) => updateExperience(exp.id, "location", e.target.value)} className="bg-background h-7 text-xs" />
                                  <Textarea placeholder={"Bullet points (one per line)\n- Designed ETL pipelines...\n- Led data migration..."} value={exp.bullets.join("\n")} onChange={(e) => updateExperience(exp.id, "bullets", e.target.value.split("\n").filter((b) => b.trim()))} className="bg-background text-xs min-h-[60px] resize-y" />
                                </div>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={addExperience} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Experience</button>
                        </div>
                      )}

                      {/* ── Education: collapsed rows ── */}
                      {section.id === "education" && (
                        <div className="space-y-1">
                          {data.education.map((edu, eduIndex) => (
                            <div key={edu.id} className="rounded border border-border/40 overflow-hidden">
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedEduId === edu.id && "bg-muted/40")}
                                onClick={() => setExpandedEduId(expandedEduId === edu.id ? null : edu.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedEduId === edu.id && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">
                                  {edu.institution || edu.degree ? `${edu.degree || "Degree"}${edu.institution ? ` - ${edu.institution}` : ""}` : `Education ${eduIndex + 1}`}
                                </span>
                                {edu.graduation_date && <span className="text-[10px] text-muted-foreground shrink-0">{edu.graduation_date}</span>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {data.education.length > 1 && <>
                                    <button type="button" onClick={() => moveEducation(eduIndex, "up")} disabled={eduIndex === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                                    <button type="button" onClick={() => moveEducation(eduIndex, "down")} disabled={eduIndex === data.education.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                                  </>}
                                  {data.education.length > 1 && <button type="button" onClick={() => removeEducation(edu.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>}
                                </div>
                              </div>
                              {expandedEduId === edu.id && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <Input placeholder="Institution" value={edu.institution} onChange={(e) => updateEducation(edu.id, "institution", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Degree" value={edu.degree} onChange={(e) => updateEducation(edu.id, "degree", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Field" value={edu.field} onChange={(e) => updateEducation(edu.id, "field", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Graduation date" value={edu.graduation_date} onChange={(e) => updateEducation(edu.id, "graduation_date", e.target.value)} className="bg-background h-7 text-xs" />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={addEducation} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Education</button>
                        </div>
                      )}

                      {/* ── Skills: compact badges with inline add ── */}
                      {section.id === "skills" && (
                        <div className="space-y-2">
                          {Object.entries(data.skills).map(([categoryKey, skills]) => (
                            <div key={categoryKey} className="space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">{SKILL_CATEGORY_LABELS[categoryKey] || categoryKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</span>
                                <button type="button" onClick={() => { const s = { ...data.skills }; delete s[categoryKey]; setData((p) => ({ ...p, skills: s })); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {skills.map((skill) => <Badge key={skill} variant="secondary" className="text-[10px] h-5 gap-0.5 px-1.5">{skill}<button type="button" onClick={() => removeSkillFromCategory(categoryKey, skill)} className="hover:text-destructive ml-0.5"><X className="h-2 w-2" /></button></Badge>)}
                                <Input placeholder="+ Add" value={currentSkillCategory === categoryKey ? skillInput : ""} onChange={(e) => { setCurrentSkillCategory(categoryKey); setSkillInput(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkillToCategory(categoryKey, skillInput); setSkillInput(""); } }} className="bg-background h-5 text-[10px] w-20 min-w-0 px-1.5 border-dashed" />
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-1.5 items-center">
                            <Input placeholder="New category name..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="bg-background h-6 text-[10px] flex-1" onKeyDown={(e) => { if (e.key === "Enter" && newCategoryName.trim()) { const key = newCategoryName.trim().toLowerCase().replace(/\s+/g, "_").replace(/&/g, ""); if (!data.skills[key]) setData((p) => ({ ...p, skills: { ...p.skills, [key]: [] } })); setNewCategoryName(""); } }} />
                            <button type="button" onClick={() => { if (newCategoryName.trim()) { const key = newCategoryName.trim().toLowerCase().replace(/\s+/g, "_").replace(/&/g, ""); if (!data.skills[key]) setData((p) => ({ ...p, skills: { ...p.skills, [key]: [] } })); setNewCategoryName(""); } }} className="text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
                          </div>
                          {Object.keys(data.skills).length === 0 && <p className="text-[10px] text-muted-foreground text-center py-1">No skills yet. Upload a resume or add above.</p>}
                        </div>
                      )}

                      {/* ── Projects: collapsed rows ── */}
                      {section.id === "projects" && (
                        <div className="space-y-1">
                          {data.projects.map((project, index) => (
                            <div key={project.id} className="rounded border border-border/40 overflow-hidden">
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedProjIdx === index && "bg-muted/40")}
                                onClick={() => setExpandedProjIdx(expandedProjIdx === index ? null : index)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedProjIdx === index && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">{project.title || `Project ${index + 1}`}</span>
                                {project.date && <span className="text-[10px] text-muted-foreground shrink-0">{project.date}</span>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {data.projects.length > 1 && <>
                                    <button type="button" onClick={() => moveProject(index, "up")} disabled={index === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                                    <button type="button" onClick={() => moveProject(index, "down")} disabled={index === data.projects.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                                  </>}
                                  <button type="button" onClick={() => removeProject(index)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                                </div>
                              </div>
                              {expandedProjIdx === index && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <Input placeholder="Project Name" value={project.title} onChange={(e) => updateProject(index, { title: e.target.value })} className="bg-background h-7 text-xs" />
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <Input placeholder="Organization" value={project.organization} onChange={(e) => updateProject(index, { organization: e.target.value })} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Date" value={project.date} onChange={(e) => updateProject(index, { date: e.target.value })} className="bg-background h-7 text-xs" />
                                  </div>
                                  <Textarea placeholder={"Key points (one per line)\n- Built a chatbot...\n- Implemented ML pipeline..."} value={project.bullets.join("\n")} onChange={(e) => updateProject(index, { bullets: e.target.value.split("\n") })} className="bg-background text-xs min-h-[50px] resize-y" />
                                </div>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={addProject} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Project</button>
                        </div>
                      )}

                      {/* ── Certifications: collapsed rows ── */}
                      {section.id === "certifications" && (
                        <div className="space-y-1">
                          {data.certifications.map((cert) => (
                            <div key={cert.id} className="rounded border border-border/40 overflow-hidden">
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedCertId === cert.id && "bg-muted/40")}
                                onClick={() => setExpandedCertId(expandedCertId === cert.id ? null : cert.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedCertId === cert.id && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">{cert.name || "New Certification"}</span>
                                {cert.date && <span className="text-[10px] text-muted-foreground shrink-0">{cert.date}</span>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => removeCertification(cert.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                                </div>
                              </div>
                              {expandedCertId === cert.id && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <div className="grid grid-cols-3 gap-1.5">
                                    <Input placeholder="Certification Name" value={cert.name} onChange={(e) => updateCertification(cert.id, "name", e.target.value)} className="bg-background h-7 text-xs col-span-2" />
                                    <Input placeholder="Date" value={cert.date} onChange={(e) => updateCertification(cert.id, "date", e.target.value)} className="bg-background h-7 text-xs" />
                                  </div>
                                  <Input placeholder="Issuer (e.g., AWS)" value={cert.issuer} onChange={(e) => updateCertification(cert.id, "issuer", e.target.value)} className="bg-background h-7 text-xs" />
                                </div>
                              )}
                            </div>
                          ))}
                          {data.certifications.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-1">No certifications added yet</p>}
                          <button type="button" onClick={addCertification} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Certification</button>
                        </div>
                      )}
                      {/* ── Languages: collapsible rows ── */}
                      {section.id === "languages" && (
                        <div className="space-y-1">
                          {(data.languages || []).map((lang) => (
                            <div key={lang.id} className="rounded border border-border/40 overflow-hidden">
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedLangId === lang.id && "bg-muted/40")}
                                onClick={() => setExpandedLangId(expandedLangId === lang.id ? null : lang.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedLangId === lang.id && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">{lang.language || "New Language"}</span>
                                {lang.proficiency && <Badge variant="secondary" className="text-[10px] h-5">{lang.proficiency}</Badge>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => removeLanguage(lang.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                                </div>
                              </div>
                              {expandedLangId === lang.id && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <Input placeholder="Language" value={lang.language} onChange={(e) => updateLanguage(lang.id, "language", e.target.value)} className="bg-background h-7 text-xs" />
                                    <select value={lang.proficiency} onChange={(e) => updateLanguage(lang.id, "proficiency", e.target.value)} className="h-7 text-xs rounded-md border border-input bg-background px-2">
                                      {["Native", "Fluent", "Professional", "Conversational", "Basic"].map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {(data.languages || []).length === 0 && <p className="text-[10px] text-muted-foreground text-center py-1">No languages added yet</p>}
                          <button type="button" onClick={addLanguage} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Language</button>
                        </div>
                      )}

                      {/* ── Volunteer: collapsible rows ── */}
                      {section.id === "volunteer" && (
                        <div className="space-y-1">
                          {(data.volunteer || []).map((vol) => (
                            <div key={vol.id} className="rounded border border-border/40 overflow-hidden">
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedVolId === vol.id && "bg-muted/40")}
                                onClick={() => setExpandedVolId(expandedVolId === vol.id ? null : vol.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedVolId === vol.id && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">
                                  {vol.role || vol.organization ? `${vol.role || "Role"}${vol.organization ? ` @ ${vol.organization}` : ""}` : "New Volunteer Experience"}
                                </span>
                                {vol.date && <span className="text-[10px] text-muted-foreground shrink-0">{vol.date}</span>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => removeVolunteer(vol.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                                </div>
                              </div>
                              {expandedVolId === vol.id && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <Input placeholder="Organization" value={vol.organization} onChange={(e) => updateVolunteer(vol.id, "organization", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Role" value={vol.role} onChange={(e) => updateVolunteer(vol.id, "role", e.target.value)} className="bg-background h-7 text-xs" />
                                  </div>
                                  <Input placeholder="Date range" value={vol.date} onChange={(e) => updateVolunteer(vol.id, "date", e.target.value)} className="bg-background h-7 text-xs" />
                                  <Textarea placeholder={"Key contributions (one per line)"} value={vol.bullets.join("\n")} onChange={(e) => updateVolunteer(vol.id, "bullets", e.target.value.split("\n").filter((b: string) => b.trim()))} className="bg-background text-xs min-h-[50px] resize-y" />
                                </div>
                              )}
                            </div>
                          ))}
                          {(data.volunteer || []).length === 0 && <p className="text-[10px] text-muted-foreground text-center py-1">No volunteer experience added yet</p>}
                          <button type="button" onClick={addVolunteer} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Volunteer Experience</button>
                        </div>
                      )}

                      {/* ── Awards & Publications: collapsible rows ── */}
                      {section.id === "awards" && (
                        <div className="space-y-1">
                          {(data.awards || []).map((award) => (
                            <div key={award.id} className="rounded border border-border/40 overflow-hidden">
                              <div
                                className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedAwardId === award.id && "bg-muted/40")}
                                onClick={() => setExpandedAwardId(expandedAwardId === award.id ? null : award.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedAwardId === award.id && "rotate-180")} />
                                <span className="text-xs font-medium truncate flex-1">{award.title || "New Award"}</span>
                                {award.date && <span className="text-[10px] text-muted-foreground shrink-0">{award.date}</span>}
                                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => removeAward(award.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                                </div>
                              </div>
                              {expandedAwardId === award.id && (
                                <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                  <Input placeholder="Award/Publication Title" value={award.title} onChange={(e) => updateAward(award.id, "title", e.target.value)} className="bg-background h-7 text-xs" />
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <Input placeholder="Issuer/Publisher" value={award.issuer} onChange={(e) => updateAward(award.id, "issuer", e.target.value)} className="bg-background h-7 text-xs" />
                                    <Input placeholder="Date" value={award.date} onChange={(e) => updateAward(award.id, "date", e.target.value)} className="bg-background h-7 text-xs" />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {(data.awards || []).length === 0 && <p className="text-[10px] text-muted-foreground text-center py-1">No awards or publications added yet</p>}
                          <button type="button" onClick={addAward} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Award/Publication</button>
                        </div>
                      )}

                      {/* ── Custom section editor ── */}
                      {section.id.startsWith("custom_") && (() => {
                        const cs = (data.customSections || []).find((s) => s.id === section.id);
                        if (!cs) return null;
                        return (
                          <div className="space-y-1">
                            {cs.entries.map((entry) => (
                              <div key={entry.id} className="rounded border border-border/40 overflow-hidden">
                                <div
                                  className={cn("flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors", expandedCustomId === entry.id && "bg-muted/40")}
                                  onClick={() => setExpandedCustomId(expandedCustomId === entry.id ? null : entry.id)}
                                >
                                  <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expandedCustomId === entry.id && "rotate-180")} />
                                  <span className="text-xs font-medium truncate flex-1">{entry.title || "New Entry"}</span>
                                  {entry.date && <span className="text-[10px] text-muted-foreground shrink-0">{entry.date}</span>}
                                  <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => removeCustomEntry(section.id, entry.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                                  </div>
                                </div>
                                {expandedCustomId === entry.id && (
                                  <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/30 bg-muted/20">
                                    <Input placeholder="Title" value={entry.title} onChange={(e) => updateCustomEntry(section.id, entry.id, "title", e.target.value)} className="bg-background h-7 text-xs" />
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <Input placeholder="Subtitle / Organization" value={entry.subtitle} onChange={(e) => updateCustomEntry(section.id, entry.id, "subtitle", e.target.value)} className="bg-background h-7 text-xs" />
                                      <Input placeholder="Date" value={entry.date} onChange={(e) => updateCustomEntry(section.id, entry.id, "date", e.target.value)} className="bg-background h-7 text-xs" />
                                    </div>
                                    <Textarea placeholder={"Details (one per line)"} value={entry.bullets.join("\n")} onChange={(e) => updateCustomEntry(section.id, entry.id, "bullets", e.target.value.split("\n").filter((b: string) => b.trim()))} className="bg-background text-xs min-h-[50px] resize-y" />
                                  </div>
                                )}
                              </div>
                            ))}
                            <button type="button" onClick={() => addCustomEntry(section.id)} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded hover:bg-muted/30 transition-colors"><Plus className="h-3 w-3" /> Add Entry</button>
                          </div>
                        );
                      })()}

                      {/* ── Per-section ATS Issues ── */}
                      {(() => {
                        const atsName = sectionToATSName[section.id];
                        if (!atsName) return null;
                        const sectionIssues = getIssuesForSection(atsName);
                        if (sectionIssues.length === 0) return null;
                        return (
                          <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <Shield className="h-3 w-3" /> ATS Issues ({sectionIssues.length})
                              </span>
                              {(atsName === "Summary" || atsName === "Experience" || atsName === "Skills") && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => aiFixSection(atsName)}
                                  disabled={aiFixingSection === atsName}
                                  className="h-5 text-[10px] gap-1 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                >
                                  {aiFixingSection === atsName ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Fixing...</> : <><Wand2 className="h-2.5 w-2.5" /> AI Fix All</>}
                                </Button>
                              )}
                            </div>
                            {sectionIssues.map((issue) => (
                              <div key={issue.id} className="flex items-start gap-1.5 text-[10px]">
                                {issue.severity === "critical" ? <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" /> :
                                 issue.severity === "warning" ? <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" /> :
                                 <Info className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                  <span className={cn("font-medium",
                                    issue.severity === "critical" ? "text-red-600 dark:text-red-400" :
                                    issue.severity === "warning" ? "text-yellow-600 dark:text-yellow-400" :
                                    "text-blue-600 dark:text-blue-400"
                                  )}>{issue.title}</span>
                                  <span className="text-muted-foreground ml-1">{issue.description}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* ── Add Section Button ── */}
            <div className="px-3 pb-3">
              {!showAddSection ? (
                <button
                  type="button"
                  onClick={() => setShowAddSection(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-primary hover:text-primary/80 border-2 border-dashed border-primary/20 rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <Plus className="h-4 w-4" /> Add Section
                </button>
              ) : (
                <div className="p-3 bg-muted/40 rounded-lg border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Add Section</span>
                    <button type="button" onClick={() => setShowAddSection(false)} className="p-0.5 rounded hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  {/* Built-in sections not yet active */}
                  {ALL_BUILT_IN_SECTIONS.filter((s) => !activeSections.some((a) => a.id === s.id)).length > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Standard Sections</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {ALL_BUILT_IN_SECTIONS.filter((s) => !activeSections.some((a) => a.id === s.id)).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => addBuiltInSection(s.id as BuiltInSectionId)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border/50 bg-background hover:bg-muted hover:border-primary/30 transition-colors"
                          >
                            {BUILT_IN_ICONS[s.id as BuiltInSectionId]}
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Custom section */}
                  <div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Custom Section</span>
                    <div className="flex gap-1.5 mt-1">
                      <Input
                        placeholder="Section name (e.g., Hobbies, References, Publications...)"
                        className="bg-background h-7 text-xs flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                            addCustomSection((e.target as HTMLInputElement).value.trim());
                            (e.target as HTMLInputElement).value = "";
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={(e) => {
                          const input = (e.target as HTMLElement).parentElement?.querySelector("input");
                          if (input && input.value.trim()) { addCustomSection(input.value.trim()); input.value = ""; }
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ─── RIGHT PANEL: Resume preview ──────────────────────────────── */}
      <div className={cn("flex-1 flex flex-col min-w-0 bg-muted/20", mobileView !== "preview" && "hidden lg:flex")}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMobileView("editor")} className="h-7 text-xs lg:hidden">&larr; Editor</Button>
            <h2 className="text-sm font-bold">Preview</h2>
            {hiddenSections.size > 0 && <Badge variant="outline" className="text-[10px] h-5">{hiddenSections.size} hidden</Badge>}
            {/* ATS Score Badge */}
            <button
              type="button"
              onClick={() => setShowATSDetails(!showATSDetails)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                atsScore.overall >= 80 ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/20" :
                atsScore.overall >= 60 ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20" :
                "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20"
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              ATS: {atsScore.overall}%
              {atsScore.issues.length > 0 && <span className="text-[10px] font-normal opacity-70">({atsScore.issues.filter(i => i.severity === "critical").length} critical)</span>}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handlePrintView} disabled={isExporting} className="h-8 gap-1.5"><Printer className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Print</span></Button></TooltipTrigger><TooltipContent>Print-friendly view</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleDownloadWord} disabled={isExporting} className="h-8 gap-1.5"><FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Word</span></Button></TooltipTrigger><TooltipContent>Export as .docx</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={copyAsPlainText} className="h-8 gap-1.5">{copiedField === "resume" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />} <span className="hidden sm:inline">{copiedField === "resume" ? "Copied!" : "Copy"}</span></Button></TooltipTrigger><TooltipContent>Copy as plain text (for pasting into forms)</TooltipContent></Tooltip>
            <Button size="sm" onClick={handleDownloadPDF} disabled={isExporting} className="h-8 gap-1.5">{isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF</Button>
          </div>
        </div>

        {/* ATS Score Expandable Details */}
        {showATSDetails && (
          <div className="border-b border-border bg-card px-4 py-3 space-y-3 max-h-[50vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("text-3xl font-black", atsColor)}>{atsScore.overall}</div>
                <div>
                  <div className="text-sm font-semibold">{atsScore.passesATS ? "ATS Compatible" : "Needs Improvement"}</div>
                  <div className="text-[10px] text-muted-foreground">{atsScore.issues.length} issues found ({atsScore.issues.filter(i => i.severity === "critical").length} critical, {atsScore.issues.filter(i => i.severity === "warning").length} warnings)</div>
                </div>
              </div>
              <button type="button" onClick={() => setShowATSDetails(false)} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            {/* Section scores */}
            <div className="grid grid-cols-4 gap-2">
              {atsScore.sections.map((s) => (
                <div key={s.section} className="text-center p-2 rounded-lg bg-muted/40">
                  <div className={cn("text-lg font-bold", s.score / s.maxScore >= 0.7 ? "text-green-500" : s.score / s.maxScore >= 0.4 ? "text-yellow-500" : "text-red-500")}>
                    {Math.round((s.score / s.maxScore) * 100)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">{s.section}</div>
                </div>
              ))}
            </div>

            {/* All issues */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold">All Issues</div>
              {atsScore.issues.map((issue) => (
                <div key={issue.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/30">
                  {issue.severity === "critical" ? <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /> :
                   issue.severity === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" /> :
                   <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] h-4">{issue.section}</Badge>
                      <span className={cn("font-medium",
                        issue.severity === "critical" ? "text-red-600 dark:text-red-400" :
                        issue.severity === "warning" ? "text-yellow-600 dark:text-yellow-400" :
                        "text-blue-600 dark:text-blue-400"
                      )}>{issue.title}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{issue.description}</p>
                  </div>
                </div>
              ))}
              {atsScore.issues.length === 0 && (
                <div className="text-center py-4 text-sm text-green-500 font-medium flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> No ATS issues found! Your resume looks great.
                </div>
              )}
            </div>
          </div>
        )}

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

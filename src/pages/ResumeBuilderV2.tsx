/**
 * Resume Builder v2 — full redesign.
 *
 * Visual model:
 *   - Top bar:    minimal (title input + save status + export + AI toggle).
 *   - Editor:     left column, vertically stacked section accordions. No
 *                 tabs to flip through — everything's there, scroll to find
 *                 what you want. Click a section header to collapse/expand.
 *   - Preview:    right column, the resume rendered on a "paper" card
 *                 floating on an off-white desk. Visible by default.
 *   - AI panel:   collapsible right rail with JD input + tailor button +
 *                 live ATS score breakdown.
 *
 * The preview updates on every keystroke via the Zustand store (single source
 * of truth). Editor and preview share no parent state — just the store.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  Printer,
  Sparkles,
  Eye,
  EyeOff,
  Code2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useResumeStore } from "@/lib/resume-store";
import { CanonicalTemplate } from "@/components/resume-v2/CanonicalTemplate";
import {
  HeaderEditor,
  SummaryEditor,
  ExperienceEditor,
  EducationEditor,
  SkillsEditor,
  ProjectsEditor,
  CertificationsEditor,
} from "@/components/resume-v2/SectionEditors";
import { AiTailorPanel } from "@/components/resume-v2/AiTailorPanel";
import { createEmptyResumeJSON } from "@/types/resume";
import type { ResumeJSON } from "@/types/resume";

// ─── Section registry ──────────────────────────────────────────────────────

const SECTIONS = [
  { id: "header", label: "Header", description: "Name, role, contact", Cmp: HeaderEditor },
  { id: "summary", label: "Summary", description: "2–3 sentence pitch", Cmp: SummaryEditor },
  { id: "experience", label: "Experience", description: "Roles + impact bullets", Cmp: ExperienceEditor },
  { id: "education", label: "Education", description: "Degrees, schools, dates", Cmp: EducationEditor },
  { id: "skills", label: "Skills", description: "Grouped by category", Cmp: SkillsEditor },
  { id: "projects", label: "Projects", description: "Highlight work outside roles", Cmp: ProjectsEditor },
  { id: "certifications", label: "Certifications", description: "Credentials + dates", Cmp: CertificationsEditor },
] as const;

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ResumeBuilderV2() {
  const { resumeId } = useParams<{ resumeId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { resume, status, setResume, setStatus, setResumeId, reset, hiddenSections } = useResumeStore(
    useShallow((s) => ({
      resume: s.resume,
      status: s.status,
      setResume: s.setResume,
      setStatus: s.setStatus,
      setResumeId: s.setResumeId,
      reset: s.reset,
      hiddenSections: s.hiddenSections,
    })),
  );

  const [resumeName, setResumeName] = useState("Untitled resume");
  const [openSections, setOpenSections] = useState<string[]>(["header", "summary", "experience"]);
  const [aiOpen, setAiOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"preview" | "json">("preview");
  const initialLoadDone = useRef(false);

  // ─── load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (initialLoadDone.current) return;

    if (!resumeId) {
      reset();
      setResumeName("Untitled resume");
      initialLoadDone.current = true;
      return;
    }

    initialLoadDone.current = true;
    setStatus("loading");
    (async () => {
      const { data, error } = await supabase
        .from("resumes")
        .select("*")
        .eq("id", resumeId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) {
        toast.error(error?.message ?? "Resume not found");
        setStatus("error", error?.message ?? "not found");
        return;
      }
      const json = rowToResumeJSON(data);
      setResume(json);
      setResumeId(data.id);
      setResumeName(data.title ?? "Untitled resume");
      setStatus("idle");
    })();
  }, [resumeId, user, setResume, setStatus, setResumeId, reset]);

  // ─── save (debounced autosave) ─────────────────────────────────────────
  const save = useCallback(async () => {
    if (!user) return;
    setStatus("saving");
    const payload = resumeJSONToRow(resume, resumeName, user.id);
    const table = supabase.from("resumes") as ReturnType<typeof supabase.from>;
    if (resumeId) {
      const { error } = await table.update(payload as never).eq("id", resumeId).eq("user_id", user.id);
      if (error) {
        setStatus("error", error.message);
        toast.error(`Save failed: ${error.message}`);
        return;
      }
      setStatus("saved");
    } else {
      const { data, error } = await table.insert(payload as never).select("id").maybeSingle();
      if (error || !data) {
        setStatus("error", error?.message ?? "save failed");
        toast.error(`Save failed: ${error?.message ?? "unknown"}`);
        return;
      }
      setResumeId(data.id);
      navigate(`/resume-builder/v2/${data.id}`, { replace: true });
      setStatus("saved");
    }
  }, [resume, resumeName, resumeId, user, setStatus, setResumeId, navigate]);

  useEffect(() => {
    if (!initialLoadDone.current || !user) return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, resumeName]);

  // ─── render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#f6f5f1] dark:bg-zinc-900 overflow-hidden">
      <TopBar
        resumeName={resumeName}
        onRename={setResumeName}
        status={status}
        onBack={() => navigate("/resume-builder")}
        onSave={() => void save()}
        onPrint={() => window.print()}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((v) => !v)}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
        {/* EDITOR */}
        <div className="overflow-y-auto border-r border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <Eyebrow>Edit your resume</Eyebrow>
            <h2 className="text-2xl font-semibold tracking-tight mt-1 mb-1 text-zinc-900 dark:text-zinc-50" style={{ fontFamily: '"EB Garamond", Georgia, serif' }}>
              Everything updates live on the right
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Click any section to expand. Changes are saved automatically.
            </p>

            <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-2">
              {SECTIONS.map((s) => (
                <AccordionItem
                  key={s.id}
                  value={s.id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 px-4 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-baseline justify-between w-full pr-3">
                      <div className="text-left">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.label}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{s.description}</div>
                      </div>
                      <SectionStatusDot id={s.id} resume={resume} />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-4">
                    <s.Cmp />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <FirstStepHint resume={resume} />
          </div>
        </div>

        {/* PREVIEW */}
        <div className="overflow-y-auto bg-[#f6f5f1] dark:bg-zinc-900 relative">
          <div className="px-6 py-10 flex justify-center">
            {previewMode === "preview" ? (
              <PaperFrame>
                <CanonicalTemplate data={resume} hiddenSections={hiddenSections} />
              </PaperFrame>
            ) : (
              <JsonView resume={resume} />
            )}
          </div>
        </div>
      </div>

      {/* AI side sheet */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-[400px] sm:max-w-none p-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-amber-500" />
              AI tailor + score
            </SheetTitle>
            <SheetDescription className="sr-only">
              Paste a job description to tailor your resume, and view your ATS score.
            </SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
            <AiTailorPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Top bar ───────────────────────────────────────────────────────────────

function TopBar({
  resumeName,
  onRename,
  status,
  onBack,
  onSave,
  onPrint,
  previewMode,
  onPreviewModeChange,
  aiOpen,
  onToggleAi,
}: {
  resumeName: string;
  onRename: (v: string) => void;
  status: ReturnType<typeof useResumeStore.getState>["status"];
  onBack: () => void;
  onSave: () => void;
  onPrint: () => void;
  previewMode: "preview" | "json";
  onPreviewModeChange: (v: "preview" | "json") => void;
  aiOpen: boolean;
  onToggleAi: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-white dark:bg-zinc-950 backdrop-blur">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-600 dark:text-zinc-400">
        <ArrowLeft className="size-4 mr-1" /> All resumes
      </Button>
      <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />
      <Input
        value={resumeName}
        onChange={(e) => onRename(e.target.value)}
        className="max-w-xs h-8 border-0 shadow-none px-2 focus-visible:ring-1 focus-visible:ring-zinc-300 text-sm font-medium"
        placeholder="Untitled resume"
      />
      <SaveStatusPill status={status} />
      <div className="flex-1" />
      <ViewToggle value={previewMode} onChange={onPreviewModeChange} />
      <Button
        variant={aiOpen ? "default" : "outline"}
        size="sm"
        onClick={onToggleAi}
        className="ml-2"
      >
        <Sparkles className="size-4 mr-1.5" /> AI tailor
      </Button>
      <Button variant="outline" size="sm" onClick={onSave}>
        <Save className="size-4 mr-1" /> Save
      </Button>
      <Button size="sm" onClick={onPrint}>
        <Printer className="size-4 mr-1" /> Export PDF
      </Button>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: "preview" | "json";
  onChange: (v: "preview" | "json") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 p-0.5 text-xs">
      <button
        onClick={() => onChange("preview")}
        className={`px-2.5 py-1 rounded-[5px] flex items-center gap-1 transition-colors ${
          value === "preview"
            ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100"
            : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        <Eye className="size-3" /> Preview
      </button>
      <button
        onClick={() => onChange("json")}
        className={`px-2.5 py-1 rounded-[5px] flex items-center gap-1 transition-colors ${
          value === "json"
            ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100"
            : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        <Code2 className="size-3" /> JSON
      </button>
    </div>
  );
}

function SaveStatusPill({ status }: { status: ReturnType<typeof useResumeStore.getState>["status"] }) {
  if (status === "loading") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400"><Loader2 className="size-3 animate-spin" /> Loading…</span>;
  }
  if (status === "saving") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400"><Loader2 className="size-3 animate-spin" /> Saving…</span>;
  }
  if (status === "saved") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-[11px] text-emerald-700 dark:text-emerald-400"><Check className="size-3" /> Saved</span>;
  }
  if (status === "error") {
    return <Badge variant="destructive" className="text-[10px]">Save error</Badge>;
  }
  return null;
}

// ─── Eyebrow / accents ─────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] font-medium text-zinc-500 dark:text-zinc-500">
      {children}
    </div>
  );
}

// ─── Paper frame around the resume preview ────────────────────────────────

function PaperFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative origin-top">
      {/* Subtle paper shadow + edge */}
      <div
        className="bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08),0_24px_48px_-12px_rgba(0,0,0,0.18)] ring-1 ring-zinc-200/60 rounded-sm"
        style={{ transform: "scale(0.9)", transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── JSON view ─────────────────────────────────────────────────────────────

function JsonView({ resume }: { resume: ResumeJSON }) {
  return (
    <pre
      className="bg-zinc-950 text-zinc-100 rounded-lg p-5 text-[12px] leading-relaxed overflow-x-auto max-w-3xl w-full ring-1 ring-zinc-200/60"
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace' }}
    >
      {JSON.stringify(resume, null, 2)}
    </pre>
  );
}

// ─── Section status dot ────────────────────────────────────────────────────

function SectionStatusDot({ id, resume }: { id: string; resume: ResumeJSON }) {
  const filled = isSectionFilled(id, resume);
  return (
    <span
      className={`inline-block size-2 rounded-full shrink-0 ml-3 ${
        filled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
      title={filled ? "Has content" : "Empty"}
    />
  );
}

function isSectionFilled(id: string, r: ResumeJSON): boolean {
  switch (id) {
    case "header":         return Boolean(r.header.name?.trim() || r.header.email?.trim());
    case "summary":        return Boolean(r.summary?.trim());
    case "experience":     return r.experience.some((e) => e.role?.trim() || e.company_or_client?.trim());
    case "education":      return r.education.some((e) => e.institution?.trim() || e.degree?.trim());
    case "skills":         return Object.values(r.skills).some((v) => v.length > 0);
    case "projects":       return r.projects.length > 0;
    case "certifications": return r.certifications.length > 0;
    default:               return false;
  }
}

// ─── Empty state hint ──────────────────────────────────────────────────────

function FirstStepHint({ resume }: { resume: ResumeJSON }) {
  const empty = !resume.header.name?.trim() && !resume.summary?.trim() &&
    !resume.experience.some((e) => e.role || e.company_or_client) &&
    !resume.education.some((e) => e.institution || e.degree);
  if (!empty) return null;
  return (
    <div className="mt-6 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/40 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
      <div className="flex items-start gap-2">
        <EyeOff className="size-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Fresh start — fill in Header first.</span>{" "}
          <span>Click the <strong>Header</strong> section above and add your name + email. The preview on the right updates as you type.</span>
        </div>
      </div>
    </div>
  );
}

// ─── DB row mapping ────────────────────────────────────────────────────────
// The `resumes` table stores per-section JSONB columns. Map between that
// shape and ResumeJSON. The migration 20260512230000 adds proper volunteer/
// awards/custom_sections columns; until applied, those fields are stashed
// inside `personal_info._v2_extras`.

type ResumeRow = Record<string, unknown> & { id?: string };

function rowToResumeJSON(row: ResumeRow): ResumeJSON {
  const empty = createEmptyResumeJSON();
  const personal = (row.personal_info as Record<string, unknown> | null) ?? {};
  const extras = (personal._v2_extras as Record<string, unknown> | undefined) ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    header: {
      name: str(personal.fullName) || str(personal.name),
      title: str(personal.title),
      location: str(personal.location),
      email: str(personal.email),
      phone: str(personal.phone),
      linkedin: str(personal.linkedin),
    },
    summary: (row.summary as string) ?? "",
    experience: arr(row.experience) ?? empty.experience,
    education: arr(row.education) ?? empty.education,
    certifications: arr(row.certifications) ?? [],
    skills: (row.skills as Record<string, string[]>) ?? {},
    projects: arr(row.projects) ?? [],
    languages: arr(row.languages) ?? undefined,
    volunteer: arr(extras.volunteer) ?? undefined,
    awards: arr(extras.awards) ?? undefined,
    customSections: arr(extras.customSections) ?? undefined,
    section_order: (row.section_order as string[] | null) ?? empty.section_order,
  };
}

function resumeJSONToRow(r: ResumeJSON, title: string, userId: string) {
  const v2extras = {
    volunteer: r.volunteer ?? null,
    awards: r.awards ?? null,
    customSections: r.customSections ?? null,
  };
  return {
    user_id: userId,
    title,
    personal_info: {
      fullName: r.header.name,
      title: r.header.title,
      location: r.header.location,
      email: r.header.email,
      phone: r.header.phone,
      linkedin: r.header.linkedin,
      _v2_extras: v2extras,
    },
    summary: r.summary,
    experience: r.experience,
    education: r.education,
    certifications: r.certifications,
    skills: r.skills,
    projects: r.projects,
    languages: r.languages ?? [],
    section_order: r.section_order ?? null,
  };
}

function arr<T>(v: unknown): T[] | null {
  return Array.isArray(v) ? (v as T[]) : null;
}

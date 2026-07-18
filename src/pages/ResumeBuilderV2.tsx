/**
 * Resume Builder v2 — full redesign.
 *
 * Visual model:
 *   - Top bar:    minimal (title input + save status + export + tailor toggle).
 *   - Editor:     left column, vertically stacked section accordions. No
 *                 tabs to flip through — everything's there, scroll to find
 *                 what you want. Click a section header to collapse/expand.
 *   - Preview:    right column, the resume rendered on a "paper" card
 *                 floating on an off-white desk. Visible by default.
 *   - Tailor panel: collapsible right rail with JD input + tailor button +
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
  ShieldCheck,
  TriangleAlert,
  Download,
  FileText,
  Braces,
  ChevronDown,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
import type { ResumeJSON, ResumeParseQuality } from "@/types/resume";
import { useResumeExport } from "@/hooks/use-resume-export";
import { normalizeResumeSkills } from "@/lib/resume-skills";
import { captureIncident } from "@/lib/incidents";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";

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
  const [parseQuality, setParseQuality] = useState<ResumeParseQuality | null>(null);
  const [importFormatMode, setImportFormatMode] = useState<"ats_recommended" | "preserve_source">("ats_recommended");
  const [sourceDocumentId, setSourceDocumentId] = useState<string | null>(null);
  const [storedExtras, setStoredExtras] = useState<Record<string, unknown>>({ document_role: "master" });
  const initialLoadDone = useRef(false);
  const { exportToPDF, exportToWord, exportToJSON, isExporting } = useResumeExport();

  // ─── load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (initialLoadDone.current) return;

    if (!resumeId) {
      reset();
      setResumeName("Untitled resume");
      setStoredExtras({ document_role: "master" });
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
        if (error) void captureIncident(error, { source: "manual", operation: "resume_load" });
        toast.error("We could not open this résumé. Return to your résumé library and try again.");
        setStatus("error", error?.message ?? "not found");
        return;
      }
      const rawData = data as unknown as ResumeRow;
      const json = rowToResumeJSON(rawData);
      setResume(json);
      setResumeId(data.id);
      setResumeName(data.title ?? "Untitled resume");
      setParseQuality(isParseQuality(rawData.parse_quality) ? rawData.parse_quality : null);
      const personal = rawData.personal_info && typeof rawData.personal_info === "object"
        ? rawData.personal_info as Record<string, unknown>
        : {};
      const extras = personal._v2_extras && typeof personal._v2_extras === "object"
        ? personal._v2_extras as Record<string, unknown>
        : {};
      setImportFormatMode(extras.import_format_mode === "preserve_source" ? "preserve_source" : "ats_recommended");
      setStoredExtras(extras);
      setSourceDocumentId(typeof rawData.source_document_id === "string" ? rawData.source_document_id : null);
      setStatus("idle");
    })();
  }, [resumeId, user, setResume, setStatus, setResumeId, reset]);

  // ─── save (debounced autosave) ─────────────────────────────────────────
  const save = useCallback(async () => {
    if (!user) return;
    setStatus("saving");
    const payload = resumeJSONToRow(resume, resumeName, user.id, importFormatMode, sourceDocumentId, storedExtras);
    const table = supabase.from("resumes") as ReturnType<typeof supabase.from>;
    if (resumeId) {
      const { error } = await table.update(payload as never).eq("id", resumeId).eq("user_id", user.id);
      if (error) {
        setStatus("error", error.message);
        void captureIncident(error, { source: "manual", operation: "resume_save" });
        const safeError = toUserFacingError(error, {
          operation: "resume_save",
          defaultMessage: "Your latest edits remain on this screen. Try saving again in a moment.",
        });
        toast.error(`${safeError.title}. ${withSupportReference(safeError)}`);
        return;
      }
      setStatus("saved");
    } else {
      const { data, error } = await table.insert(payload as never).select("id").maybeSingle();
      if (error || !data) {
        setStatus("error", error?.message ?? "save failed");
        if (error) void captureIncident(error, { source: "manual", operation: "resume_create" });
        const safeError = toUserFacingError(error ?? new Error("Resume create returned no record"), {
          operation: "resume_create",
          defaultMessage: "Your résumé remains on this screen. Try saving again in a moment.",
        });
        toast.error(`${safeError.title}. ${withSupportReference(safeError)}`);
        return;
      }
      setResumeId(data.id);
      navigate(`/resume-builder/v2/${data.id}`, { replace: true });
      setStatus("saved");
    }
  }, [resume, resumeName, resumeId, user, setStatus, setResumeId, navigate, importFormatMode, sourceDocumentId, storedExtras]);

  useEffect(() => {
    if (!initialLoadDone.current || !user) return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, resumeName, importFormatMode]);

  const createTailoredVersion = useCallback(async (tailored: ResumeJSON) => {
    if (!user) throw new Error("Sign in before creating a tailored version.");

    const sourceTitle = resumeName.trim() || "Untitled resume";
    const tailoredTitle = `${sourceTitle.replace(/\s+— tailored$/i, "")} — tailored`;
    const tailoredExtras = {
      document_role: "tailored_draft",
      source_resume_id: resumeId ?? null,
    };
    const payload = resumeJSONToRow(tailored, tailoredTitle, user.id, "ats_recommended", null, tailoredExtras);
    const table = supabase.from("resumes") as ReturnType<typeof supabase.from>;
    const { data, error } = await table.insert(payload as never).select("id").maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Could not save the tailored version.");
    }

    setResume(tailored);
    setResumeId(data.id);
    setResumeName(tailoredTitle);
    setStoredExtras(tailoredExtras);
    setStatus("saved");
    navigate(`/resume-builder/v2/${data.id}`, { replace: true });
  }, [navigate, resumeId, resumeName, setResume, setResumeId, setStatus, user]);

  // ─── render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-rp-canvas overflow-hidden">
      <TopBar
        resumeName={resumeName}
        onRename={setResumeName}
        status={status}
        onBack={() => navigate("/resume-builder")}
        onSave={() => void save()}
        onExportPDF={() => void exportToPDF(resume, safeFileName(resumeName))}
        onExportWord={() => void exportToWord(resume, safeFileName(resumeName))}
        onExportJSON={() => void exportToJSON(resume, safeFileName(resumeName))}
        isExporting={isExporting}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((v) => !v)}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
        {/* EDITOR */}
        <div className="overflow-y-auto border-r border-rp-rule bg-rp-canvas">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <Eyebrow>Edit your resume</Eyebrow>
            <h2 className="text-2xl font-semibold tracking-tight mt-1 mb-1 text-rp-ink" style={{ fontFamily: '"Manrope", "Inter", system-ui, sans-serif' }}>
              Everything updates live on the right
            </h2>
            <p className="text-sm text-rp-ink-2 mb-6">
              Click any section to expand. Changes are saved automatically.
            </p>

            {parseQuality && <ParseQualityCard quality={parseQuality} />}
            {sourceDocumentId && (
              <FormatWorkflowCard mode={importFormatMode} onChange={setImportFormatMode} />
            )}

            <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-2">
              {SECTIONS.map((s) => (
                <AccordionItem
                  key={s.id}
                  value={s.id}
                  className="border border-rp-rule rounded-lg bg-rp-paper px-4"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-baseline justify-between w-full pr-3">
                      <div className="text-left">
                        <div className="text-sm font-semibold text-rp-ink">{s.label}</div>
                        <div className="text-[11px] text-rp-ink-2 mt-0.5">{s.description}</div>
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
        <div className="overflow-y-auto bg-rp-canvas relative">
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

      {/* Job-tailoring side sheet */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-[400px] sm:max-w-none p-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-amber-500" />
              Job tailor + ATS score
            </SheetTitle>
            <SheetDescription className="sr-only">
              Paste a job description to tailor your resume, and view your ATS score.
            </SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
            <AiTailorPanel onCreateTailoredVersion={createTailoredVersion} />
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
  onExportPDF,
  onExportWord,
  onExportJSON,
  isExporting,
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
  onExportPDF: () => void;
  onExportWord: () => void;
  onExportJSON: () => void;
  isExporting: boolean;
  previewMode: "preview" | "json";
  onPreviewModeChange: (v: "preview" | "json") => void;
  aiOpen: boolean;
  onToggleAi: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-rp-rule bg-rp-canvas">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-rp-ink-2">
        <ArrowLeft className="size-4 mr-1" /> All resumes
      </Button>
      <div className="h-5 w-px bg-rp-rule mx-1" />
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
        <Sparkles className="size-4 mr-1.5" /> Tailor to job
      </Button>
      <Button variant="outline" size="sm" onClick={onSave}>
        <Save className="size-4 mr-1" /> Save
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={isExporting}>
            {isExporting ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Download className="size-4 mr-1.5" />}
            Export <ChevronDown className="ml-1 size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onExportPDF}>
            <Printer className="mr-2 size-4" /> PDF · ATS text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportWord}>
            <FileText className="mr-2 size-4" /> Word · editable DOCX
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportJSON}>
            <Braces className="mr-2 size-4" /> JSON · structured data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
    <div className="inline-flex items-center rounded-md bg-rp-paper p-0.5 text-xs">
      <button
        onClick={() => onChange("preview")}
        className={`px-2.5 py-1 rounded-[5px] flex items-center gap-1 transition-colors ${
          value === "preview"
            ? "bg-rp-paper-2 shadow-sm text-rp-ink"
            : "text-rp-ink-2"
        }`}
      >
        <Eye className="size-3" /> Preview
      </button>
      <button
        onClick={() => onChange("json")}
        className={`px-2.5 py-1 rounded-[5px] flex items-center gap-1 transition-colors ${
          value === "json"
            ? "bg-rp-paper-2 shadow-sm text-rp-ink"
            : "text-rp-ink-2"
        }`}
      >
        <Code2 className="size-3" /> JSON
      </button>
    </div>
  );
}

function SaveStatusPill({ status }: { status: ReturnType<typeof useResumeStore.getState>["status"] }) {
  if (status === "loading") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rp-paper text-[11px] text-rp-ink-2"><Loader2 className="size-3 animate-spin" /> Loading…</span>;
  }
  if (status === "saving") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rp-paper text-[11px] text-rp-ink-2"><Loader2 className="size-3 animate-spin" /> Saving…</span>;
  }
  if (status === "saved") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rp-accent/10 text-[11px] text-rp-accent"><Check className="size-3" /> Saved</span>;
  }
  if (status === "error") {
    return <Badge variant="destructive" className="text-[10px]">Save error</Badge>;
  }
  return null;
}

// ─── Eyebrow / accents ─────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] font-medium text-rp-ink-3">
      {children}
    </div>
  );
}

// ─── Paper frame around the resume preview ────────────────────────────────

function PaperFrame({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);
  const [paperHeight, setPaperHeight] = useState(1056);

  useEffect(() => {
    const host = hostRef.current;
    const paper = paperRef.current;
    if (!host || !paper) return;

    const update = () => {
      const available = Math.max(320, host.clientWidth - 8);
      setScale(Math.min(1, available / 816));
      setPaperHeight(Math.max(1056, paper.scrollHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(paper);
    return () => observer.disconnect();
  }, []);

  const pageCount = Math.max(1, Math.ceil(paperHeight / 1056));

  return (
    <div ref={hostRef} className="relative w-full flex flex-col items-center min-w-0">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rp-rule bg-rp-paper px-3 py-1 text-[11px] text-rp-ink-2">
        <span className="font-semibold text-rp-ink">{pageCount} {pageCount === 1 ? "page" : "pages"}</span>
        <span aria-hidden="true">·</span>
        <span>US Letter · selectable ATS text</span>
      </div>
      <div
        className="relative shrink-0"
        style={{ width: 816 * scale, height: paperHeight * scale }}
      >
        <div
          ref={paperRef}
          className="absolute left-0 top-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08),0_24px_48px_-12px_rgba(0,0,0,0.18)] ring-1 ring-zinc-200/60"
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
        {Array.from({ length: pageCount - 1 }, (_, index) => (
          <div
            key={index}
            className="absolute left-0 right-0 z-10 border-t border-dashed border-zinc-400/80 pointer-events-none"
            style={{ top: (index + 1) * 1056 * scale }}
          >
            <span className="absolute right-2 -top-3 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 shadow-sm">
              Page {index + 2}
            </span>
          </div>
        ))}
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
        filled ? "bg-rp-accent" : "bg-rp-rule-2"
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
    <div className="mt-6 border border-dashed border-rp-rule-2 rounded-lg bg-rp-paper px-4 py-3 text-sm text-rp-ink-2">
      <div className="flex items-start gap-2">
        <EyeOff className="size-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-rp-ink">Fresh start — fill in Header first.</span>{" "}
          <span>Click the <strong>Header</strong> section above and add your name + email. The preview on the right updates as you type.</span>
        </div>
      </div>
    </div>
  );
}

function ParseQualityCard({ quality }: { quality: ResumeParseQuality }) {
  const passed = quality.status === "passed";
  const Icon = passed ? ShieldCheck : TriangleAlert;
  return (
    <div className={`mb-5 rounded-lg border px-4 py-3 ${
      passed
        ? "border-emerald-500/25 bg-emerald-500/5"
        : "border-amber-500/30 bg-amber-500/5"
    }`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-4 shrink-0 ${passed ? "text-emerald-600" : "text-amber-600"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-rp-ink">
              Source coverage {quality.score}%
            </p>
            <span className="text-[10px] uppercase tracking-[0.12em] text-rp-ink-3">
              {passed ? "Quality gate passed" : "Review required"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-[10.5px] text-rp-ink-2">
            <span>Terms {quality.metrics.lexicalCoverage}%</span>
            <span>Bullets {quality.metrics.bulletCoverage}%</span>
            <span>Dates {quality.metrics.dateCoverage}%</span>
            <span>Sections {quality.metrics.sectionCoverage}%</span>
          </div>
          {quality.warnings.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-rp-ink-2">{quality.warnings[0]}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FormatWorkflowCard({
  mode,
  onChange,
}: {
  mode: "ats_recommended" | "preserve_source";
  onChange: (mode: "ats_recommended" | "preserve_source") => void;
}) {
  const preserving = mode === "preserve_source";
  return (
    <div className="mb-5 rounded-lg border border-rp-rule bg-rp-paper px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-md">
          <p className="text-sm font-semibold text-rp-ink">Format workflow</p>
          <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">
            {preserving
              ? "The uploaded file remains the application master. This editor is the structured analysis copy used for matching and tailoring."
              : "Exports use the recommended single-column ATS layout with selectable text and validated PDF, DOCX, and JSON output."}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-rp-rule bg-rp-canvas p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onChange("ats_recommended")}
            className={`rounded px-2.5 py-1.5 ${!preserving ? "bg-rp-ink text-rp-canvas" : "text-rp-ink-2"}`}
          >
            ATS layout
          </button>
          <button
            type="button"
            onClick={() => onChange("preserve_source")}
            className={`rounded px-2.5 py-1.5 ${preserving ? "bg-rp-ink text-rp-canvas" : "text-rp-ink-2"}`}
          >
            Original master
          </button>
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
    skills: normalizeResumeSkills(row.skills),
    projects: arr(row.projects) ?? [],
    languages: arr(row.languages) ?? undefined,
    volunteer: arr(row.volunteer) ?? arr(extras.volunteer) ?? undefined,
    awards: arr(row.awards) ?? arr(extras.awards) ?? undefined,
    customSections: arr(row.custom_sections) ?? arr(extras.customSections) ?? undefined,
    section_order: (row.section_order as string[] | null) ?? empty.section_order,
  };
}

function resumeJSONToRow(
  r: ResumeJSON,
  title: string,
  userId: string,
  importFormatMode: "ats_recommended" | "preserve_source",
  sourceDocumentId: string | null,
  extras: Record<string, unknown>,
) {
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
      _v2_extras: { ...extras, import_format_mode: importFormatMode },
    },
    summary: r.summary,
    experience: r.experience,
    education: r.education,
    certifications: r.certifications,
    skills: normalizeResumeSkills(r.skills),
    projects: r.projects,
    languages: r.languages ?? [],
    volunteer: r.volunteer ?? [],
    awards: r.awards ?? [],
    custom_sections: r.customSections ?? [],
    section_order: r.section_order ?? null,
    source_document_id: sourceDocumentId,
  };
}

function safeFileName(value: string): string {
  const sanitized = value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return sanitized || "resume";
}

function arr<T>(v: unknown): T[] | null {
  return Array.isArray(v) ? (v as T[]) : null;
}

function isParseQuality(value: unknown): value is ResumeParseQuality {
  if (!value || typeof value !== "object") return false;
  const quality = value as Partial<ResumeParseQuality>;
  return typeof quality.score === "number"
    && (quality.status === "passed" || quality.status === "review_required")
    && Boolean(quality.metrics && typeof quality.metrics === "object")
    && Array.isArray(quality.warnings);
}

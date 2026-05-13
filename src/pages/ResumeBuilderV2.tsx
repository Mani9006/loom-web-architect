/**
 * Resume Builder v2 — clean rebuild.
 *
 * Layout:
 *   [ header bar: name, save status, export ]
 *   [ left: section editor (tabs) | right: live preview | far right: AI tailor ]
 *
 * Single source of truth = Zustand store (src/lib/resume-store.ts).
 * Renders only via CanonicalTemplate. No template-id branching.
 *
 * Read/write to `resumes` Supabase table (same schema as v1).
 * Reachable at /resume-builder/v2 (new) or /resume-builder/v2/:resumeId (existing).
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { ArrowLeft, Check, Loader2, Save, FileDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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

const TABS = [
  { id: "header", label: "Header", Cmp: HeaderEditor },
  { id: "summary", label: "Summary", Cmp: SummaryEditor },
  { id: "experience", label: "Experience", Cmp: ExperienceEditor },
  { id: "education", label: "Education", Cmp: EducationEditor },
  { id: "skills", label: "Skills", Cmp: SkillsEditor },
  { id: "projects", label: "Projects", Cmp: ProjectsEditor },
  { id: "certifications", label: "Certifications", Cmp: CertificationsEditor },
] as const;

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
  const [activeTab, setActiveTab] = useState<string>("header");
  const [showAiPanel, setShowAiPanel] = useState(true);
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

  // ─── save ───────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!user) return;
    setStatus("saving");
    const payload = resumeJSONToRow(resume, resumeName, user.id);
    // Cast: existing codebase pattern — the resumes table's JSONB columns are
    // typed as `Json` but our payload uses concrete entry types that are valid
    // Json subsets. TS can't see the structural equivalence.
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

  // debounced autosave on any change after initial load
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (!user) return;
    const t = setTimeout(() => {
      void save();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, resumeName]);

  const handleExport = () => {
    // Defer real PDF export to next iteration; print is the cleanest stopgap.
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background/95 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => navigate("/resume-builder")}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Input
          value={resumeName}
          onChange={(e) => setResumeName(e.target.value)}
          className="max-w-xs h-8"
        />
        <SaveStatusPill status={status} />
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setShowAiPanel((v) => !v)} title="Toggle AI panel">
          {showAiPanel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void save()}>
          <Save className="size-4 mr-1" /> Save
        </Button>
        <Button size="sm" onClick={handleExport}>
          <FileDown className="size-4 mr-1" /> Export
        </Button>
      </div>

      {/* panes */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* editor */}
        <ResizablePanel defaultSize={42} minSize={30}>
          <div className="h-full flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="mx-3 mt-3 justify-start overflow-x-auto whitespace-nowrap">
                {TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="text-xs">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {TABS.map((t) => (
                    <TabsContent key={t.id} value={t.id} className="mt-0">
                      <t.Cmp />
                    </TabsContent>
                  ))}
                </div>
              </ScrollArea>
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* preview */}
        <ResizablePanel defaultSize={showAiPanel ? 36 : 58} minSize={30}>
          <ScrollArea className="h-full bg-muted/30">
            <div className="p-6 flex justify-center">
              <div className="shadow-lg" style={{ transform: "scale(0.85)", transformOrigin: "top center" }}>
                <CanonicalTemplate data={resume} hiddenSections={hiddenSections} />
              </div>
            </div>
          </ScrollArea>
        </ResizablePanel>

        {showAiPanel && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={22} minSize={18}>
              <AiTailorPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function SaveStatusPill({ status }: { status: ReturnType<typeof useResumeStore.getState>["status"] }) {
  if (status === "loading") return <Pill icon={<Loader2 className="size-3 animate-spin" />}>Loading…</Pill>;
  if (status === "saving") return <Pill icon={<Loader2 className="size-3 animate-spin" />}>Saving…</Pill>;
  if (status === "saved") return <Pill icon={<Check className="size-3 text-emerald-500" />}>Saved</Pill>;
  if (status === "error") return <Pill icon={<span className="size-2 rounded-full bg-rose-500" />}>Error</Pill>;
  return null;
}
function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

// ─── DB row mapping ────────────────────────────────────────────────────────
// The `resumes` table stores per-section JSONB columns rather than a single
// blob. Map between that shape and ResumeJSON here.

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
  // The resumes table doesn't (yet) have columns for volunteer/awards/custom
  // sections — stash them inside personal_info under `_v2_extras` so they
  // survive a round-trip without a schema change.
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

// Separator export kept to satisfy potential future tab dividers without touching imports.
export const _Separator = Separator;

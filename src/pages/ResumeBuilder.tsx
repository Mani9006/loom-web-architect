import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, Loader2, Upload, Check, CloudUpload } from "lucide-react";
import { ResumeJSON, createEmptyResumeJSON } from "@/types/resume";
import { ResumeTemplate } from "@/components/resume/ResumeTemplate";
import { SectionNavigator, SectionId } from "@/components/resume/SectionNavigator";
import { SectionEditor } from "@/components/resume/SectionEditor";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ResumeFormSkeleton } from "@/components/resume/ResumeFormSkeleton";
import { useResumeExport } from "@/hooks/use-resume-export";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Robust JSON parser
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

const DEFAULT_SECTION_ORDER: SectionId[] = ["personal", "summary", "experience", "education", "skills", "projects", "certifications"];

export default function ResumeBuilder() {
  const { toast } = useToast();
  const resumeRef = useRef<HTMLDivElement>(null);
  const { exportToPDF, isExporting } = useResumeExport();

  const [resumeData, setResumeData] = useState<ResumeJSON>(createEmptyResumeJSON());
  const [activeSection, setActiveSection] = useState<SectionId>("personal");
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_SECTION_ORDER);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [mobileView, setMobileView] = useState<"nav" | "edit" | "preview">("edit");

  // Load resume from database
  useEffect(() => {
    const loadResume = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data: resumes } = await supabase
        .from("resumes" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (resumes && resumes.length > 0) {
        const r = resumes[0] as any;
        setCurrentResumeId(r.id);
        setResumeData({
          header: r.personal_info || createEmptyResumeJSON().header,
          summary: r.summary || "",
          experience: Array.isArray(r.experience) ? r.experience : [],
          education: Array.isArray(r.education) ? r.education : [],
          certifications: Array.isArray(r.certifications) ? r.certifications : [],
          skills: r.skills && typeof r.skills === "object" && !Array.isArray(r.skills) ? r.skills : {},
          projects: Array.isArray(r.projects) ? r.projects : [],
        });
      }
      setIsLoading(false);
    };
    loadResume();
  }, []);

  // Auto-save with 1.5s debounce
  useEffect(() => {
    if (isLoading) return;
    const timeout = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setSaveStatus("saving");
      const payload = {
        user_id: user.id,
        title: resumeData.header.name ? `${resumeData.header.name}'s Resume` : "Untitled Resume",
        personal_info: resumeData.header as any,
        summary: resumeData.summary,
        experience: resumeData.experience as any,
        education: resumeData.education as any,
        skills: resumeData.skills as any,
        projects: resumeData.projects as any,
        certifications: resumeData.certifications as any,
        template: "professional",
      };

      if (currentResumeId) {
        await supabase.from("resumes" as any).update(payload).eq("id", currentResumeId);
      } else {
        const { data } = await supabase.from("resumes" as any).insert(payload).select("id").single();
        if (data) setCurrentResumeId((data as any).id);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [resumeData, isLoading]);

  // Resume import handler
  const handleResumeImported = useCallback(async (text: string, fileName: string) => {
    setIsParsingResume(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an expert resume parser. Extract ALL structured resume data. Return ONLY valid JSON matching this schema:
{"header":{"name":"","title":"","location":"","email":"","phone":"","linkedin":""},"summary":"","experience":[{"role":"","company_or_client":"","start_date":"","end_date":"","location":"","bullets":[]}],"education":[{"degree":"","field":"","institution":"","gpa":"","graduation_date":"","location":""}],"certifications":[{"name":"","issuer":"","date":""}],"skills":{"category_name":["skill1"]},"projects":[{"title":"","organization":"","date":"","bullets":[]}]}
Extract EVERY bullet point without truncation. Use lowercase_snake_case for skill category keys.`,
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
        header: { ...createEmptyResumeJSON().header, ...parsedData.header },
        summary: parsedData.summary || "",
        experience: parsedData.experience?.length > 0
          ? parsedData.experience.map((e: any) => ({ id: crypto.randomUUID(), role: e.role || "", company_or_client: e.company_or_client || "", start_date: e.start_date || "", end_date: e.end_date || "", location: e.location || "", bullets: Array.isArray(e.bullets) ? e.bullets : [] }))
          : createEmptyResumeJSON().experience,
        education: parsedData.education?.length > 0
          ? parsedData.education.map((e: any) => ({ id: crypto.randomUUID(), degree: e.degree || "", field: e.field || "", institution: e.institution || "", gpa: e.gpa || "", graduation_date: e.graduation_date || "", location: e.location || "" }))
          : createEmptyResumeJSON().education,
        certifications: parsedData.certifications?.length > 0
          ? parsedData.certifications.map((c: any) => ({ id: crypto.randomUUID(), name: c.name || "", issuer: c.issuer || "", date: c.date || "" }))
          : [],
        skills: parsedData.skills && typeof parsedData.skills === "object" ? parsedData.skills : {},
        projects: parsedData.projects?.length > 0
          ? parsedData.projects.map((p: any) => ({ id: crypto.randomUUID(), title: p.title || "", organization: p.organization || "", date: p.date || "", bullets: Array.isArray(p.bullets) ? p.bullets : [] }))
          : [],
      };
      setResumeData(newData);
      toast({ title: "Resume imported!", description: `Extracted data from ${fileName}` });
    } catch (error) {
      toast({ title: "Import failed", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setIsParsingResume(false);
    }
  }, [toast]);

  const handleExportPDF = () => {
    if (resumeRef.current) {
      const fileName = resumeData.header.name
        ? `${resumeData.header.name.replace(/\s+/g, "_")}_Resume`
        : "Resume";
      exportToPDF(resumeRef.current, fileName);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-68px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-68px)] overflow-hidden">
      {/* ===== LEFT PANEL - Section Navigator (hidden mobile) ===== */}
      <div className={cn(
        "w-[220px] border-r border-border bg-background shrink-0 flex flex-col",
        "hidden lg:flex"
      )}>
        <div className="shrink-0 px-4 py-3 border-b border-border/50">
          <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Resume Builder
          </h1>
        </div>

        {/* Upload Zone */}
        <div className="p-3 border-b border-border/50">
          <DocumentUpload
            onTextExtracted={handleResumeImported}
            isLoading={isParsingResume}
            label={isParsingResume ? "Parsing..." : "Upload Resume"}
            accept=".pdf,.txt"
          />
        </div>

        <ScrollArea className="flex-1">
          <SectionNavigator
            data={resumeData}
            activeSection={activeSection}
            sectionOrder={sectionOrder}
            onSelect={setActiveSection}
            onReorder={setSectionOrder}
          />
        </ScrollArea>

        {/* Save Status */}
        <div className="shrink-0 px-4 py-2.5 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
          {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>}
          {saveStatus === "saved" && <><Check className="h-3 w-3 text-green-500" /> Saved</>}
          {saveStatus === "idle" && <><CloudUpload className="h-3 w-3" /> Auto-save enabled</>}
        </div>
      </div>

      {/* ===== CENTER PANEL - Section Editor ===== */}
      <div className={cn(
        "flex-1 lg:flex-none lg:w-[calc(100%-220px-42%)] flex flex-col bg-background min-w-0",
        mobileView !== "edit" && "hidden lg:flex"
      )}>
        {/* Mobile header */}
        <div className="shrink-0 px-4 py-3 border-b border-border/50 flex items-center justify-between lg:hidden">
          <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Resume Builder
          </h1>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setMobileView("preview")}>Preview</Button>
          </div>
        </div>

        {/* Mobile upload */}
        <div className="lg:hidden px-4 py-2 border-b border-border/50">
          <DocumentUpload onTextExtracted={handleResumeImported} isLoading={isParsingResume} label={isParsingResume ? "Parsing..." : "Upload"} accept=".pdf,.txt" />
        </div>

        {/* Mobile section tabs */}
        <div className="lg:hidden shrink-0 border-b border-border/50 overflow-x-auto">
          <div className="flex gap-1 p-2 min-w-max">
            {sectionOrder.map((id) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                  activeSection === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Editor header */}
        <div className="shrink-0 px-5 py-3 border-b border-border/50 hidden lg:flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground capitalize">{activeSection.replace("personal", "Personal Info")} Editor</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>}
            {saveStatus === "saved" && <><Check className="h-3 w-3 text-green-500" /> Saved</>}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 pb-8">
            {isParsingResume ? (
              <ResumeFormSkeleton />
            ) : (
              <SectionEditor
                section={activeSection}
                data={resumeData}
                onChange={setResumeData}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ===== RIGHT PANEL - Live Preview ===== */}
      <div className={cn(
        "lg:w-[42%] shrink-0 border-l border-border bg-muted/30 flex flex-col overflow-hidden",
        mobileView !== "preview" && "hidden lg:flex"
      )}>
        {/* Preview header */}
        <div className="shrink-0 px-4 py-3 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-sm">
          <span className="text-sm font-semibold text-foreground">Live Preview</span>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleExportPDF}
              disabled={isExporting || isParsingResume}
              className="gap-1.5 text-xs h-7"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download PDF
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7 lg:hidden" onClick={() => setMobileView("edit")}>
              ← Editor
            </Button>
          </div>
        </div>

        {/* Scrollable preview */}
        <div className="flex-1 overflow-auto p-4">
          <div className="mx-auto shadow-xl relative" style={{ width: "fit-content" }}>
            <ResumeTemplate ref={resumeRef} data={resumeData} />
            {isParsingResume && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <span className="text-sm text-muted-foreground">Parsing resume...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

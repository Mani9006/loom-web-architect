/* eslint-disable @typescript-eslint/no-explicit-any -- legacy Supabase JSON rows are incrementally typed */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ResumeJSON, createEmptyResumeJSON } from "@/types/resume";
import { calculateATSScore } from "@/lib/ats-scorer";
import {
  streamAIText, parseAIResponse, mapParsedToResumePayload,
  prepareResumeTextForParsing, calculateResumeParseQuality, buildResumeCorrectionPrompt,
} from "@/lib/ai-resume-parser";
import { captureIncident } from "@/lib/incidents";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";
import { ResumeTemplate } from "@/components/resume/ResumeTemplate";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, FileText, MoreVertical, Copy, Trash2,
  Pencil, Clock, Sparkles, Shield, Briefcase, Loader2,
  CheckCircle, Upload, FolderOpen,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { TerminalLoader, TerminalText } from "@/components/Terminal";
import { normalizeResumeSkills } from "@/lib/resume-skills";
import { hydrateApplicationProfileFromResume } from "@/lib/resume-profile-autofill";
import { personalInfoToHeader } from "@/lib/resume-personal-info";

type ResumeSource = "scratch" | "upload" | "existing";
type ImportFormatMode = "ats_recommended" | "preserve_source";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.normalize("NFKC"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface ResumeRow {
  id: string;
  title: string;
  personal_info: any;
  summary: string;
  experience: any[];
  education: any[];
  skills: any;
  projects: any[];
  certifications: any[];
  languages: any[];
  template: string;
  updated_at: string;
  created_at: string;
  source_document_id?: string | null;
}

function mapRowToResumeJSON(r: ResumeRow): ResumeJSON {
  return {
    header: personalInfoToHeader(r.personal_info),
    summary: r.summary || "",
    experience: Array.isArray(r.experience) ? r.experience : [],
    education: Array.isArray(r.education) ? r.education : [],
    certifications: Array.isArray(r.certifications) ? r.certifications : [],
    skills: normalizeResumeSkills(r.skills),
    projects: Array.isArray(r.projects) ? r.projects : [],
    languages: Array.isArray(r.languages) ? r.languages : [],
    volunteer: [],
    awards: [],
  };
}

export default function ResumeProjects() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newResumeName, setNewResumeName] = useState("");
  const [newResumeRole, setNewResumeRole] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [resumeSource, setResumeSource] = useState<ResumeSource>("scratch");
  const [uploadedResumeText, setUploadedResumeText] = useState<string | null>(null);
  const [uploadedResumeFileName, setUploadedResumeFileName] = useState("");
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [existingDocuments, setExistingDocuments] = useState<any[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [importFormatMode, setImportFormatMode] = useState<ImportFormatMode>("ats_recommended");
  const [primaryResumeId, setPrimaryResumeId] = useState<string | null>(null);

  // ── Fetch all resumes ─────────────────────────────────────────────────
  const fetchResumes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data, error }, { data: applicationDrafts }] = await Promise.all([
      supabase
        .from("resumes" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("draft_applications")
        .select("tailored_resume_id")
        .eq("user_id", user.id),
    ]);

    if (!error && data) {
      const applicationResumeIds = new Set(
        (applicationDrafts || []).flatMap(({ tailored_resume_id }) => tailored_resume_id ? [tailored_resume_id] : []),
      );
      const nonApplicationResumes = (data as any as ResumeRow[]).filter((resume) => {
        const role = resume.personal_info?._v2_extras?.document_role;
        return role !== "application_snapshot" && role !== "tailored_draft" && !applicationResumeIds.has(resume.id);
      });
      let masters = nonApplicationResumes.filter((resume) => {
        // Imported documents are durable masters even when a historical title
        // contains the word "tailored". Generated copies do not carry the source
        // document link and stay with their application instead.
        if (resume.source_document_id) return true;
        return !/,\s*tailored(?:\s*,|$)|application resume$/i.test(resume.title || "");
      });
      if (masters.length === 0 && nonApplicationResumes.length > 0) {
        // Legacy records predate document-role metadata. Keep the oldest one as
        // the source rather than exposing every historical variant or an empty
        // library. New saves receive explicit metadata and do not use this path.
        masters = [nonApplicationResumes.reduce((oldest, resume) =>
          new Date(resume.created_at).getTime() < new Date(oldest.created_at).getTime() ? resume : oldest
        )];
      }
      setResumes(masters);
    } else if (error) {
      // A failed read must not render as a false "No resumes yet" empty state.
      toast({ title: "Couldn't load your résumés", description: "Refresh to try again.", variant: "destructive" });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("primary_resume_id")
      .eq("user_id", user.id)
      .maybeSingle();
    setPrimaryResumeId((profile as { primary_resume_id?: string | null } | null)?.primary_resume_id ?? null);
    setIsLoading(false);
  };

  useEffect(() => { fetchResumes(); }, []);

  // ── Fetch existing uploaded documents when create dialog opens ──────
  useEffect(() => {
    if (!createOpen) return;
    const fetchDocs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_documents" as any)
        .select("id, file_name, category, created_at, extracted_text")
        .eq("user_id", user.id)
        .eq("category", "resume")
        .order("created_at", { ascending: false });
      if (data) setExistingDocuments(data as any[]);
    };
    fetchDocs();
  }, [createOpen]);

  // ── Filtered resumes ──────────────────────────────────────────────────
  const filteredResumes = useMemo(() => {
    if (!searchQuery.trim()) return resumes;
    const q = searchQuery.toLowerCase();
    return resumes.filter((r) => {
      const title = r.title?.toLowerCase() || "";
      const role = r.personal_info?.title?.toLowerCase() || "";
      const name = (r.personal_info?.name || r.personal_info?.fullName)?.toLowerCase() || "";
      return title.includes(q) || role.includes(q) || name.includes(q);
    });
  }, [resumes, searchQuery]);

  // ── Reset dialog state ───────────────────────────────────────────────
  const resetCreateDialog = () => {
    setNewResumeName("");
    setNewResumeRole("");
    setResumeSource("scratch");
    setUploadedResumeText(null);
    setUploadedResumeFileName("");
    setUploadedDocumentId(null);
    setSelectedDocumentId(null);
    setIsParsingImport(false);
    setImportFormatMode("ats_recommended");
  };

  // ── Create new resume ─────────────────────────────────────────────────
  const handleCreateResume = async () => {
    if (!newResumeName.trim()) return;
    setIsCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsCreating(false); return; }

    let payload: any;
    const emptyResume = createEmptyResumeJSON();

    if (resumeSource === "scratch") {
      // Empty resume
      payload = {
        user_id: user.id,
        title: newResumeName.trim(),
        personal_info: {
          ...emptyResume.header,
          title: newResumeRole.trim(),
          _v2_extras: { document_role: "master", import_format_mode: "ats_recommended" },
        } as any,
        summary: "",
        experience: [] as any,
        education: [] as any,
        skills: {} as any,
        projects: [] as any,
        certifications: [] as any,
        languages: [] as any,
        template: "professional",
      };
    } else {
      // "upload" or "existing", get extracted text and AI-parse it
      let textToParse: string;
      let sourceDocumentId: string | null = null;
      if (resumeSource === "upload") {
        textToParse = uploadedResumeText!;
        sourceDocumentId = uploadedDocumentId;
      } else {
        const selectedDoc = existingDocuments.find((d) => d.id === selectedDocumentId);
        textToParse = selectedDoc?.extracted_text || "";
        sourceDocumentId = selectedDoc?.id || null;
        if (!textToParse) {
          toast({ title: "Error", description: "Selected document has no extracted text.", variant: "destructive" });
          setIsCreating(false);
          return;
        }
      }

      // AI parse
      setIsParsingImport(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error("Not authenticated");

        // Prepare text: truncate if too long, preserve structure
        const preparedText = prepareResumeTextForParsing(textToParse);
        console.log(`[ResumeProjects] Parsing resume text: ${preparedText.length} chars (original: ${textToParse.length})`);

        // System prompt is now defined server-side for mode "resume_parse"
        // streamAIText now has built-in retry logic (3 attempts with exponential backoff)
        const fullContent = await streamAIText(
          session.session.access_token,
          [
            { role: "user", content: `Parse this resume:\n\n${preparedText}` },
          ],
          "resume_parse",
        );

        let parsedData = parseAIResponse(fullContent);
        if (!parsedData) {
          console.error("[ResumeProjects] Failed to parse AI response:", fullContent.substring(0, 500));
          throw new Error("Could not extract structured data from the AI response. Please try again.");
        }

        let quality = calculateResumeParseQuality(preparedText, parsedData);

        // Low-confidence imports receive one targeted correction pass. The
        // deterministic gate, not the model's self-assessment, decides whether
        // the extraction is safe to present as complete.
        if (quality.status === "review_required") {
          const correctedContent = await streamAIText(
            session.session.access_token,
            [{ role: "user", content: buildResumeCorrectionPrompt(preparedText, parsedData, quality) }],
            "resume_parse",
          );
          const corrected = parseAIResponse(correctedContent);
          if (corrected) {
            const correctedQuality = calculateResumeParseQuality(preparedText, corrected);
            if (correctedQuality.score >= quality.score) {
              parsedData = corrected;
              quality = correctedQuality;
            }
          }
        }

        const mapped = mapParsedToResumePayload(parsedData);
        if (!mapped.personal_info.name) {
          // The parser could not extract the candidate's name. Fall back to
          // the profile full_name so we never render a "Your Name" literal.
          const { data: nameProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .maybeSingle();
          mapped.personal_info.name = (nameProfile?.full_name ?? "").trim();
        }
        const sourceHash = await sha256(preparedText);

        payload = {
          user_id: user.id,
          title: newResumeName.trim(),
          personal_info: {
            ...mapped.personal_info,
            title: newResumeRole.trim() || mapped.personal_info.title,
            _v2_extras: { document_role: "master", import_format_mode: importFormatMode },
          } as any,
          summary: mapped.summary,
          experience: mapped.experience as any,
          education: mapped.education as any,
          skills: mapped.skills as any,
          projects: mapped.projects as any,
          certifications: mapped.certifications as any,
          languages: mapped.languages as any,
          volunteer: mapped.volunteer as any,
          awards: mapped.awards as any,
          custom_sections: mapped.custom_sections as any,
          source_document_id: sourceDocumentId,
          source_hash: sourceHash,
          parser_version: quality.version,
          parse_quality: quality as any,
          parsed_at: new Date().toISOString(),
          template: "professional",
        };

        if (quality.status === "passed") {
          toast({
            title: `Source coverage ${quality.score}%`,
            description: importFormatMode === "preserve_source"
              ? "The original remains your application master; the structured copy is ready for matching and review."
              : "The import passed the lossless extraction gate and is ready in the recommended ATS layout.",
          });
        } else {
          toast({
            title: `Review required · ${quality.score}% coverage`,
            description: quality.warnings[0] || "Some source evidence needs review before applying.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("[ResumeProjects] Import error:", error);
        void captureIncident(error, { source: "manual", operation: "resume_parse" });
        const safeError = toUserFacingError(error, {
          operation: "resume_parse",
          defaultMessage: "We could not read this resume reliably. Try a text-based PDF or DOCX file.",
        });
        toast({
          title: safeError.title,
          description: withSupportReference(safeError),
          variant: "destructive",
        });
        setIsCreating(false);
        setIsParsingImport(false);
        return;
      } finally {
        setIsParsingImport(false);
      }
    }

    // Insert into Supabase
    const { data: newResume, error } = await supabase
      .from("resumes" as any)
      .insert(payload)
      .select("id")
      .single();

    setIsCreating(false);
    if (error) {
      toast({ title: "Error", description: "Failed to create resume. Please try again.", variant: "destructive" });
      return;
    }

    const createdResumeId = (newResume as unknown as { id: string }).id;
    if (resumeSource !== "scratch") {
      const importedId = createdResumeId;
      const { error: primaryError } = await supabase
        .from("profiles")
        .update({ primary_resume_id: importedId } as never)
        .eq("user_id", user.id);
      if (!primaryError) setPrimaryResumeId(importedId);

      // One upload should be enough. Fill reusable application defaults from
      // verified resume fields and start the personalized feed in the
      // background while the user reviews the editor.
      void (async () => {
        try {
          await hydrateApplicationProfileFromResume({
            userId: user.id,
            resumeId: importedId,
            resume: payload as Record<string, unknown>,
            accountEmail: user.email,
          });
          await supabase.functions.invoke("career-ops-bootstrap", { body: {} });
          const parsePassed = payload.parse_quality?.status === "passed";
          if (parsePassed) {
            const { error: reviewError } = await supabase.functions.invoke("career-profile-review", {
              body: { resume_id: importedId },
            });
            if (!reviewError) await supabase.functions.invoke("career-ops-bootstrap", { body: {} });
          }
        } catch (backgroundError) {
          void captureIncident(backgroundError, { source: "manual", operation: "resume_workspace_autofill" }, "warning");
        }
      })();
      toast({
        title: "Your workspace is being prepared",
        description: "We filled reusable profile details from the resume and started finding matching roles. You can review the resume while this finishes.",
      });
    }

    setCreateOpen(false);
    resetCreateDialog();
    navigate(`/resume-builder/${createdResumeId}`);
  };

  const handleSetPrimaryResume = async (resumeId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ primary_resume_id: resumeId } as never)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Could not change matching resume", description: "Try again in a moment.", variant: "destructive" });
      return;
    }
    setPrimaryResumeId(resumeId);
    toast({ title: "Matching resume updated", description: "Job matches will now use this complete resume history." });
  };

  // ── Clone resume ──────────────────────────────────────────────────────
  const handleClone = async (resumeId: string) => {
    const source = resumes.find((r) => r.id === resumeId);
    if (!source) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { id, created_at, updated_at, ...rest } = source;
    const { error } = await supabase
      .from("resumes" as any)
      .insert({
        ...rest,
        user_id: user.id,
        title: `${source.title} (Copy)`,
      } as any);

    if (error) {
      toast({ title: "Error", description: "Failed to clone resume.", variant: "destructive" });
      return;
    }

    toast({ title: "Resume cloned", description: `"${source.title} (Copy)" has been created.` });
    fetchResumes();
  };

  // ── Delete resume ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    const target = resumes.find((r) => r.id === deleteConfirmId);

    const { error } = await supabase
      .from("resumes" as any)
      .delete()
      .eq("id", deleteConfirmId);

    if (error) {
      toast({ title: "Error", description: "Failed to delete resume.", variant: "destructive" });
    } else {
      toast({ title: "Resume deleted", description: `"${target?.title || "Resume"}" has been removed.` });
      setResumes((prev) => prev.filter((r) => r.id !== deleteConfirmId));
    }
    setDeleteConfirmId(null);
  };

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-44" />
        </div>
        <Skeleton className="h-10 w-full max-w-sm mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-rp-canvas">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-24">
        {/* Date + status row */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-4 border-b border-rp-rule">
          <span
            className="text-rp-ink-2"
            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", letterSpacing: "0.06em" }}
          >
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </span>
          <span
            className="text-rp-ink-3"
            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.06em" }}
          >
            library · {resumes.length} {resumes.length === 1 ? "résumé" : "résumés"}
          </span>
        </div>

        {/* Typed title with red cursor */}
        <div className="mt-10 mb-4">
          <h1
            className="text-rp-ink"
            style={{
              fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
              fontSize: "clamp(38px, 6vw, 60px)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              fontWeight: 700,
            }}
          >
            <TerminalText text="Your résumés." speed={80} startDelay={150} />
          </h1>
        </div>
        <p
          className="text-rp-ink-2 max-w-2xl"
          style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "16px", lineHeight: 1.6 }}
        >
          Your source and master résumés only. Job-specific versions stay attached to Applications, so small edits never clutter this library.
        </p>

        {/* One resume workflow, rather than separate products in the sidebar. */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-rp-rule border border-rp-rule mt-8">
          <button onClick={() => setCreateOpen(true)} className="bg-rp-canvas p-4 text-left hover:bg-rp-paper transition-colors group">
            <Upload className="h-4 w-4 text-rp-accent" strokeWidth={1.7} />
            <p className="mt-3 text-sm font-semibold text-rp-ink">Import & parse</p>
            <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Turn PDF, DOCX, text, or an existing document into editable resume sections.</p>
          </button>
          <button onClick={() => navigate("/ats-checker")} className="bg-rp-canvas p-4 text-left hover:bg-rp-paper transition-colors group">
            <Shield className="h-4 w-4 text-rp-accent" strokeWidth={1.7} />
            <p className="mt-3 text-sm font-semibold text-rp-ink">ATS & formatting</p>
            <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Check parseability, structure, section quality, keywords, and job alignment.</p>
          </button>
          <button onClick={() => navigate("/matches")} className="bg-rp-canvas p-4 text-left hover:bg-rp-paper transition-colors group">
            <Sparkles className="h-4 w-4 text-rp-accent" strokeWidth={1.7} />
            <p className="mt-3 text-sm font-semibold text-rp-ink">Tailor per job</p>
            <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Create a separate evidence-backed version without overwriting your source resume.</p>
          </button>
          <button onClick={() => navigate("/documents")} className="bg-rp-canvas p-4 text-left hover:bg-rp-paper transition-colors group">
            <FolderOpen className="h-4 w-4 text-rp-accent" strokeWidth={1.7} />
            <p className="mt-3 text-sm font-semibold text-rp-ink">Documents</p>
            <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">Keep source resumes, tailored variants, and application documents together.</p>
          </button>
        </div>

        {/* Action row, primary uses default (white-on-black) like the rest of the app */}
        <div className="mt-7 flex items-center gap-2">
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New résumé
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const resumeId = resumes.some((resume) => resume.id === primaryResumeId)
                ? primaryResumeId
                : resumes[0]?.id;
              if (resumeId) navigate(`/resume-builder/${resumeId}`);
              else setCreateOpen(true);
            }}
            className="gap-2"
          >
            <Pencil className="h-4 w-4" />
            {resumes.length > 0 ? "Open matching résumé" : "Open editor"}
          </Button>
        </div>

        {/* Search */}
        {resumes.length > 0 && (
          <div className="mt-10 flex items-center gap-3 border-b border-rp-rule pb-3 max-w-md">
            <Search className="w-3.5 h-3.5 text-rp-ink-3 shrink-0" strokeWidth={1.6} />
            <input
              placeholder="Search by name or role…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none placeholder:text-rp-ink-3 text-rp-ink"
              style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: "13.5px" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-rp-ink-3 hover:text-rp-ink"
                style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                clear
              </button>
            )}
          </div>
        )}

      {/* Empty state */}
      {resumes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No resumes yet</h2>
          <p className="text-muted-foreground max-w-md mb-6">
            Create your first resume to get started. Build an ATS-ready source resume, then tailor a separate copy for each job.
          </p>
          <Button onClick={() => setCreateOpen(true)} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Your First Resume
          </Button>
        </div>
      )}

      {/* No search results */}
      {resumes.length > 0 && filteredResumes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>No resumes match "{searchQuery}"</p>
        </div>
      )}

      {/* Resume cards grid */}
      {filteredResumes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredResumes.map((resume) => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              onClick={() => navigate(`/resume-builder/${resume.id}`)}
              onClone={() => handleClone(resume.id)}
              onDelete={() => setDeleteConfirmId(resume.id)}
              isPrimary={primaryResumeId === resume.id}
              onSetPrimary={() => void handleSetPrimaryResume(resume.id)}
            />
          ))}
        </div>
      )}

      {/* Create Resume Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create New Resume
            </DialogTitle>
            <DialogDescription>
              Start fresh or import from an existing document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Resume Name */}
            <div className="space-y-2">
              <Label htmlFor="resume-name">Resume Name *</Label>
              <Input
                id="resume-name"
                placeholder="e.g., Senior Engineer Resume"
                value={newResumeName}
                onChange={(e) => setNewResumeName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Target Role */}
            <div className="space-y-2">
              <Label htmlFor="resume-role">Target Role (optional)</Label>
              <Input
                id="resume-role"
                placeholder="e.g., Senior Software Engineer"
                value={newResumeRole}
                onChange={(e) => setNewResumeRole(e.target.value)}
              />
            </div>

            {/* Resume Source Selection */}
            <div className="space-y-3">
              <Label>Resume Source</Label>
              <RadioGroup value={resumeSource} onValueChange={(v) => setResumeSource(v as ResumeSource)} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="scratch" id="src-scratch" />
                  <Label htmlFor="src-scratch" className="font-normal cursor-pointer">Start from scratch</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="upload" id="src-upload" />
                  <Label htmlFor="src-upload" className="font-normal cursor-pointer flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5" /> Upload a resume file
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="existing" id="src-existing" />
                  <Label htmlFor="src-existing" className="font-normal cursor-pointer flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" /> Use an existing document
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Upload section */}
            {resumeSource === "upload" && (
              <div className="space-y-2 p-3 bg-rp-paper rounded-md border border-rp-rule">
                <DocumentUpload
                  onTextExtracted={(text, fileName) => {
                    setUploadedResumeText(text);
                    setUploadedResumeFileName(fileName);
                    if (!newResumeName.trim()) {
                      setNewResumeName(fileName.replace(/\.[^.]+$/, ""));
                    }
                  }}
                  persistToDocuments={true}
                  onDocumentSaved={(doc) => setUploadedDocumentId(doc.id)}
                  label="Drop your resume here"
                />
                {uploadedResumeText && (
                  <div
                    className="flex items-center gap-2 mt-2 text-rp-accent"
                    style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "11.5px" }}
                  >
                    <span className="size-1.5 rounded-full bg-rp-accent" />
                    OK · extracted {uploadedResumeFileName} ({uploadedResumeText.length.toLocaleString()} chars)
                  </div>
                )}
              </div>
            )}

            {/* Existing document picker */}
            {resumeSource === "existing" && (
              <div className="space-y-2">
                {existingDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg border text-center">
                    No uploaded resume documents found. Upload one first using the option above.
                  </p>
                ) : (
                  <Select value={selectedDocumentId || ""} onValueChange={setSelectedDocumentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a document..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingDocuments.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.file_name}, {format(new Date(doc.created_at), "MMM dd, yyyy")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {resumeSource !== "scratch" && (
              <div className="space-y-3 rounded-lg border border-rp-rule bg-rp-paper p-3.5">
                <div>
                  <p className="text-sm font-semibold text-rp-ink">Choose the format workflow</p>
                  <p className="mt-1 text-xs leading-relaxed text-rp-ink-2">
                    Source coverage is verified after import. Your wording is preserved in either path.
                  </p>
                </div>
                <RadioGroup value={importFormatMode} onValueChange={(value) => setImportFormatMode(value as ImportFormatMode)} className="grid gap-2">
                  <label htmlFor="format-ats" className="flex cursor-pointer items-start gap-3 rounded-md border border-rp-rule bg-rp-canvas p-3">
                    <RadioGroupItem value="ats_recommended" id="format-ats" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium text-rp-ink">Use recommended ATS layout</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-rp-ink-2">Convert the extracted content into the clean editable template used for PDF, Word, and JSON exports.</span>
                    </span>
                  </label>
                  <label htmlFor="format-source" className="flex cursor-pointer items-start gap-3 rounded-md border border-rp-rule bg-rp-canvas p-3">
                    <RadioGroupItem value="preserve_source" id="format-source" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium text-rp-ink">Keep original as application master</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-rp-ink-2">Retain the uploaded file unchanged in Documents. The editor creates a structured analysis copy for matching and tailoring.</span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            )}
          </div>
          {/* Terminal-style loader while parsing, visible right above
              the footer when the AI parse is running. */}
          {(isCreating || isParsingImport) && (
            <div className="px-4 pb-2">
              <TerminalLoader
                title={isParsingImport ? "Parsing résumé" : "Creating"}
                lines={
                  isParsingImport
                    ? [
                        "reading uploaded document...",
                        "extracting structured fields (header, summary, experience, skills)...",
                        "normalizing skill categories...",
                        "saving to your library...",
                      ]
                    : [
                        "creating blank résumé scaffold...",
                        "linking to your account...",
                        "redirecting to editor...",
                      ]
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateResume}
              disabled={
                !newResumeName.trim() ||
                isCreating ||
                isParsingImport ||
                (resumeSource === "upload" && !uploadedResumeText) ||
                (resumeSource === "existing" && !selectedDocumentId)
              }
              className="gap-2"
            >
              {isCreating || isParsingImport ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {isParsingImport ? "Importing..." : "Creating..."}</>
              ) : (
                "Create résumé"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this resume?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{resumes.find((r) => r.id === deleteConfirmId)?.title || "this resume"}" and all its content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

// ─── Resume Card Component ────────────────────────────────────────────────

interface ResumeCardProps {
  resume: ResumeRow;
  onClick: () => void;
  onClone: () => void;
  onDelete: () => void;
  isPrimary: boolean;
  onSetPrimary: () => void;
}

function ResumeCard({ resume, onClick, onClone, onDelete, isPrimary, onSetPrimary }: ResumeCardProps) {
  const resumeData = useMemo(() => mapRowToResumeJSON(resume), [resume]);
  const atsScore = useMemo(() => calculateATSScore(resumeData), [resumeData]);

  const role = resume.personal_info?.title || "";
  const lastEdited = resume.updated_at
    ? formatDistanceToNow(new Date(resume.updated_at), { addSuffix: true })
    : "Unknown";

  const scoreColor = atsScore.overall >= 80
    ? "bg-green-500"
    : atsScore.overall >= 60
    ? "bg-yellow-500"
    : "bg-red-500";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${resume.title || "Untitled resume"}`}
      className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Thumbnail, zoomed to show top portion of resume, centered */}
      <div className="relative h-52 overflow-hidden bg-rp-paper border-b border-border flex items-start justify-center">
        <div
          className="pointer-events-none select-none shrink-0"
          style={{
            width: "816px",
            transform: "scale(0.48)",
            transformOrigin: "top center",
            marginTop: "-4px",
          }}
        >
          <ResumeTemplate data={resumeData} />
        </div>

        {/* ATS Score Badge */}
        <div className={`absolute top-3 right-3 ${scoreColor} text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md`}>
          {atsScore.overall}%
        </div>
        {isPrimary && (
          <div className="absolute left-3 top-3 rounded-full bg-rp-ink px-2.5 py-1 text-[10px] font-semibold text-rp-canvas shadow-md">
            Matching resume
          </div>
        )}

        {/* Hover overlay, dark pill against the white resume thumbnail */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-rp-ink/95 text-rp-canvas backdrop-blur-sm rounded-md px-3 py-1.5 flex items-center gap-2 text-xs font-medium">
              <Pencil className="h-3.5 w-3.5" />
              Edit résumé
            </div>
          </div>
        </div>
      </div>

      {/* Card Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{resume.title || "Untitled Resume"}</h3>
            {role && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <Briefcase className="h-3 w-3 shrink-0" />
                {role}
              </p>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              Last edited {lastEdited}
            </p>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${resume.title || "Untitled resume"}`}
                className="h-8 w-8 shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onClick} className="gap-2">
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClone} className="gap-2">
                <Copy className="h-4 w-4" /> Clone
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSetPrimary} disabled={isPrimary} className="gap-2">
                <CheckCircle className="h-4 w-4" /> {isPrimary ? "Used for matching" : "Use for job matching"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

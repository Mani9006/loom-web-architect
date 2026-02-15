import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ResumeJSON, createEmptyResumeJSON } from "@/types/resume";
import { calculateATSScore } from "@/lib/ats-scorer";
import { ResumeTemplate } from "@/components/resume/ResumeTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Pencil, Clock, Sparkles, Shield, Briefcase,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
}

function mapRowToResumeJSON(r: ResumeRow): ResumeJSON {
  const empty = createEmptyResumeJSON();
  return {
    header: r.personal_info || empty.header,
    summary: r.summary || "",
    experience: Array.isArray(r.experience) ? r.experience : [],
    education: Array.isArray(r.education) ? r.education : [],
    certifications: Array.isArray(r.certifications) ? r.certifications : [],
    skills: r.skills && typeof r.skills === "object" && !Array.isArray(r.skills) ? r.skills : {},
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

  // ── Fetch all resumes ─────────────────────────────────────────────────
  const fetchResumes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("resumes" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setResumes(data as any as ResumeRow[]);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchResumes(); }, []);

  // ── Filtered resumes ──────────────────────────────────────────────────
  const filteredResumes = useMemo(() => {
    if (!searchQuery.trim()) return resumes;
    const q = searchQuery.toLowerCase();
    return resumes.filter((r) => {
      const title = r.title?.toLowerCase() || "";
      const role = r.personal_info?.title?.toLowerCase() || "";
      const name = r.personal_info?.name?.toLowerCase() || "";
      return title.includes(q) || role.includes(q) || name.includes(q);
    });
  }, [resumes, searchQuery]);

  // ── Create new resume ─────────────────────────────────────────────────
  const handleCreateResume = async () => {
    if (!newResumeName.trim()) return;
    setIsCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsCreating(false); return; }

    const emptyResume = createEmptyResumeJSON();
    const payload = {
      user_id: user.id,
      title: newResumeName.trim(),
      personal_info: { ...emptyResume.header, title: newResumeRole.trim() } as any,
      summary: "",
      experience: [] as any,
      education: [] as any,
      skills: {} as any,
      projects: [] as any,
      certifications: [] as any,
      languages: [] as any,
      template: "professional",
    };

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

    setCreateOpen(false);
    setNewResumeName("");
    setNewResumeRole("");
    navigate(`/resume-builder/${(newResume as any).id}`);
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
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            My Resumes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {resumes.length} resume{resumes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Resume
        </Button>
      </div>

      {/* Search */}
      {resumes.length > 0 && (
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resumes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
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
            Create your first resume to get started. Our AI-powered builder will help you craft an ATS-optimized resume in minutes.
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
            />
          ))}
        </div>
      )}

      {/* Create Resume Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create New Resume
            </DialogTitle>
            <DialogDescription>
              Give your resume a name and optionally set a target role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="resume-name">Resume Name *</Label>
              <Input
                id="resume-name"
                placeholder="e.g., Senior Engineer Resume"
                value={newResumeName}
                onChange={(e) => setNewResumeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newResumeName.trim()) handleCreateResume(); }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resume-role">Target Role (optional)</Label>
              <Input
                id="resume-role"
                placeholder="e.g., Senior Software Engineer"
                value={newResumeRole}
                onChange={(e) => setNewResumeRole(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateResume}
              disabled={!newResumeName.trim() || isCreating}
              className="gap-2"
            >
              {isCreating ? "Creating..." : "Create Resume"}
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
  );
}

// ─── Resume Card Component ────────────────────────────────────────────────

interface ResumeCardProps {
  resume: ResumeRow;
  onClick: () => void;
  onClone: () => void;
  onDelete: () => void;
}

function ResumeCard({ resume, onClick, onClone, onDelete }: ResumeCardProps) {
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
      className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail — zoomed to show top portion of resume */}
      <div className="relative h-52 overflow-hidden bg-white border-b border-border">
        <div
          className="absolute inset-0 pointer-events-none select-none"
          style={{
            transform: "scale(0.42)",
            transformOrigin: "top center",
            width: "238%",
            left: "-69%",
          }}
        >
          <div style={{ width: "8.5in" }}>
            <ResumeTemplate data={resumeData} />
          </div>
        </div>

        {/* ATS Score Badge */}
        <div className={`absolute top-3 right-3 ${scoreColor} text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md`}>
          {atsScore.overall}%
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg flex items-center gap-2 text-sm font-medium">
              <Pencil className="h-4 w-4" />
              Edit Resume
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
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FileText, Download, MoreVertical, Pencil, Loader2, Sparkles } from "lucide-react";

interface TailoredResume {
  id: string;
  name: string;
  cv_md: string;
  rendered_html: string | null;
  pdf_url: string | null;
  docx_url: string | null;
  ats_score: number | null;
  source_job_id: string | null;
  source_evaluation_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function ResumesTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [resumes, setResumes] = useState<TailoredResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TailoredResume | null>(null);
  const [renaming, setRenaming] = useState<TailoredResume | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("mc_tailored_resumes")
      .select("*")
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load resumes", description: error.message, variant: "destructive" });
    } else {
      setResumes((data as TailoredResume[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  async function deleteResume(id: string) {
    if (!confirm("Delete this tailored resume?")) return;
    const { error } = await (supabase as any).from("mc_tailored_resumes").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else load();
  }

  async function commitRename() {
    if (!renaming || !renameValue.trim()) return;
    const { error } = await (supabase as any)
      .from("mc_tailored_resumes")
      .update({ name: renameValue.trim() })
      .eq("id", renaming.id);
    if (error) {
      toast({ title: "Rename failed", description: error.message, variant: "destructive" });
    } else {
      setResumes((arr) =>
        arr.map((r) => (r.id === renaming.id ? { ...r, name: renameValue.trim() } : r))
      );
      toast({ title: "Renamed" });
    }
    setRenaming(null);
    setRenameValue("");
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          No tailored resumes yet. Save a job in Discover, then click "Tailor with AI" to generate one
          here.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {resumes.map((r) => (
          <Card key={r.id} className="p-3 flex items-center gap-3">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.name}</div>
              <div className="text-[11px] text-muted-foreground">
                Updated {new Date(r.updated_at).toLocaleDateString()}
                {r.ats_score !== null && (
                  <span className="ml-2">· ATS {Math.round(r.ats_score)}/100</span>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(r.name);
                    setRenaming(r);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadAsMarkdown(r)}>
                  <Download className="w-3.5 h-3.5 mr-2" /> Download .md
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadAsPdf(r, toast)}>
                  <Download className="w-3.5 h-3.5 mr-2" /> Download .pdf
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadAsDocx(r, toast)}>
                  <Download className="w-3.5 h-3.5 mr-2" /> Download .docx
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => deleteResume(r.id)} className="text-destructive">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Card>
        ))}
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(v) => { if (!v) { setRenaming(null); setRenameValue(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename resume</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRenaming(null); setRenameValue(""); }}>Cancel</Button>
            <Button onClick={commitRename} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <CanvasEditor
          resume={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            setResumes((arr) => arr.map((r) => (r.id === updated.id ? updated : r)));
          }}
        />
      )}
    </>
  );
}

function downloadAsMarkdown(r: TailoredResume) {
  const blob = new Blob([r.cv_md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function safeOpenUrl(url: string) {
  if (!url.startsWith("https://")) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function downloadAsPdf(r: TailoredResume, toast: ReturnType<typeof useToast>["toast"]) {
  const { data, error } = await (supabase as any).functions.invoke("mc-render-resume", {
    body: { resume_id: r.id, format: "pdf" },
  });
  if (error || !data?.url) {
    toast({
      title: "PDF export failed",
      description: error?.message ?? "The server didn't return a download URL.",
      variant: "destructive",
    });
    return;
  }
  safeOpenUrl(data.url);
}

async function downloadAsDocx(r: TailoredResume, toast: ReturnType<typeof useToast>["toast"]) {
  const { data, error } = await (supabase as any).functions.invoke("mc-render-resume", {
    body: { resume_id: r.id, format: "docx" },
  });
  if (error || !data?.url) {
    toast({
      title: "DOCX export failed",
      description: error?.message ?? "The server didn't return a download URL.",
      variant: "destructive",
    });
    return;
  }
  safeOpenUrl(data.url);
}

// ── Canvas editor ─────────────────────────────────────────────────────

function CanvasEditor({
  resume,
  onClose,
  onSaved,
}: {
  resume: TailoredResume;
  onClose: () => void;
  onSaved: (updated: TailoredResume) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(resume.name);
  const [cv, setCv] = useState(resume.cv_md);
  const [saving, setSaving] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const isDirty = cv !== resume.cv_md || name.trim() !== resume.name;

  function handleClose() {
    if (isDirty && !confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("mc_tailored_resumes")
      .update({ name: name.trim(), cv_md: cv })
      .eq("id", resume.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    onSaved({ ...resume, name: name.trim(), cv_md: cv, updated_at: new Date().toISOString() });
  }

  async function rewriteSelected(mode: "tighten" | "keywords" | "voice") {
    if (!selectedLine) return;
    setAiBusy(true);
    setAiSuggestions([]);
    try {
      const { data, error } = await (supabase as any).functions.invoke("enhance-bullet", {
        body: { line: selectedLine, mode, context: { full_resume: cv } },
      });
      if (error) throw error;
      setAiSuggestions(data?.suggestions ?? []);
    } catch (e) {
      toast({
        title: "AI rewrite failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setAiBusy(false);
    }
  }

  function applySuggestion(text: string) {
    if (!selectedLine) return;
    setCv((c) => c.replace(selectedLine, text));
    setSelectedLine(text);
    setAiSuggestions([]);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(cv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy — try selecting and copying manually" });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md font-medium" />
            <Badge variant="outline" className="text-[10px]">Canvas</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 flex-1 overflow-hidden">
          {/* Editor */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Markdown — click any line to enable AI suggestions
              </span>
              <Button size="sm" variant="ghost" onClick={copyMarkdown} className="h-6 text-[10px]">
                {copied ? "Copied!" : "Copy .md"}
              </Button>
            </div>
            <Textarea
              value={cv}
              onChange={(e) => {
                setCv(e.target.value);
                setSelectedLine(null);
              }}
              onSelect={(e) => {
                const el = e.currentTarget;
                const start = el.selectionStart ?? 0;
                const end = el.selectionEnd ?? start;
                const text = cv.slice(0, end);
                const lineStart = text.lastIndexOf("\n", start - 1) + 1;
                const lineEndOff = cv.indexOf("\n", start);
                const lineEnd = lineEndOff === -1 ? cv.length : lineEndOff;
                const line = cv.slice(lineStart, lineEnd).trim();
                if (line.length > 5 && line !== selectedLine) setSelectedLine(line);
              }}
              className="font-mono text-xs flex-1 resize-none"
            />
          </div>

          {/* AI side panel */}
          <div className="border rounded-lg p-3 overflow-y-auto flex flex-col">
            <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> AI assistant
            </div>
            {!selectedLine && (
              <p className="text-[11px] text-muted-foreground">
                Click a line in the editor to get AI rewrite suggestions.
              </p>
            )}
            {selectedLine && (
              <>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Selected</div>
                <div className="text-xs bg-muted rounded p-2 mb-3 max-h-24 overflow-y-auto">
                  {selectedLine}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rewriteSelected("tighten")}
                    disabled={aiBusy}
                    className="text-[10px] h-7"
                  >
                    Tighten
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rewriteSelected("keywords")}
                    disabled={aiBusy}
                    className="text-[10px] h-7"
                  >
                    +Keywords
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rewriteSelected("voice")}
                    disabled={aiBusy}
                    className="text-[10px] h-7"
                  >
                    My voice
                  </Button>
                </div>
                {aiBusy && (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Generating…
                  </div>
                )}
                {aiSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggestions</div>
                    {aiSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => applySuggestion(s)}
                        className="block w-full text-left text-xs bg-card border rounded p-2 hover:border-primary/40 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            {isDirty ? "Discard changes" : "Close"}
          </Button>
          <Button onClick={save} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

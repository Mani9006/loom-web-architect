import { useEffect, useRef, useState } from "react";
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

export default function ResumesTab({
  sessionId,
  focusResumeId,
}: {
  sessionId: string;
  /** When set (e.g. via ?tab=resumes&resume=... from the Board), opens that
   *  resume's editor automatically once it's loaded. */
  focusResumeId?: string | null;
}) {
  const { toast } = useToast();
  const [resumes, setResumes] = useState<TailoredResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TailoredResume | null>(null);
  const [renaming, setRenaming] = useState<TailoredResume | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedOnceRef = useRef(false);

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

  // Auto-open the resume the user was linked to (e.g. from the Board's
  // "View tailored resume" button) once it's loaded, then flash-highlight it.
  useEffect(() => {
    if (!focusResumeId || loading || focusedOnceRef.current) return;
    const match = resumes.find((r) => r.id === focusResumeId);
    if (!match) return;
    focusedOnceRef.current = true;
    setEditing(match);
    setFocusedId(focusResumeId);
    const timer = setTimeout(() => setFocusedId(null), 2500);
    return () => clearTimeout(timer);
  }, [focusResumeId, loading, resumes]);

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
          <Card
            key={r.id}
            className={`p-3 flex items-center gap-3 transition-colors ${
              focusedId === r.id ? "border-primary ring-1 ring-primary/40" : ""
            }`}
          >
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

// ── Markdown helpers shared by the PDF/DOCX exporters ──────────────────
// Tailored resumes are plain markdown (see the tailor prompt in BoardTab /
// DiscoverTab), so we only need to handle the subset the AI actually
// produces: #/##/### headings, "- " bullets, and **bold** inline spans.

type MdLine =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "bullet"; text: string }
  | { type: "blank"; text: "" }
  | { type: "text"; text: string };

function parseMarkdownLines(md: string): MdLine[] {
  return md.split("\n").map((raw): MdLine => {
    const line = raw.trimEnd();
    if (!line.trim()) return { type: "blank", text: "" };
    if (line.startsWith("### ")) return { type: "h3", text: line.slice(4) };
    if (line.startsWith("## ")) return { type: "h2", text: line.slice(3) };
    if (line.startsWith("# ")) return { type: "h1", text: line.slice(2) };
    if (/^[-*]\s+/.test(line)) return { type: "bullet", text: line.replace(/^[-*]\s+/, "") };
    return { type: "text", text: line.trim() };
  });
}

/** Splits "**bold** plain **more bold**" into alternating plain/bold runs. */
function splitBoldRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((p) =>
      p.startsWith("**") && p.endsWith("**")
        ? { text: p.slice(2, -2), bold: true }
        : { text: p, bold: false }
    );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownToHtml(md: string): string {
  const inline = (text: string) =>
    splitBoldRuns(text)
      .map((r) => (r.bold ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text)))
      .join("");

  const html: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of parseMarkdownLines(md)) {
    if (line.type === "blank") {
      closeList();
      continue;
    }
    if (line.type === "h1") {
      closeList();
      html.push(`<h1 style="font-size:20px;margin:0 0 4px;">${inline(line.text)}</h1>`);
      continue;
    }
    if (line.type === "h2") {
      closeList();
      html.push(
        `<h2 style="font-size:14px;margin:14px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px;">${inline(line.text)}</h2>`
      );
      continue;
    }
    if (line.type === "h3") {
      closeList();
      html.push(`<h3 style="font-size:12px;margin:8px 0 2px;">${inline(line.text)}</h3>`);
      continue;
    }
    if (line.type === "bullet") {
      if (!inList) {
        html.push('<ul style="margin:2px 0 6px;padding-left:18px;">');
        inList = true;
      }
      html.push(`<li style="margin:1px 0;">${inline(line.text)}</li>`);
      continue;
    }
    closeList();
    html.push(`<p style="margin:2px 0;">${inline(line.text)}</p>`);
  }
  closeList();
  return html.join("\n");
}

/**
 * Renders the tailored resume's markdown to a PDF entirely in the browser
 * (html2pdf.js — already a project dependency) and downloads it. There is
 * no server-side renderer for My Collection resumes: they're stored as
 * markdown (cv_md), not the Resume Builder's structured ResumeJSON, so we
 * can't reuse that hook's PDF path directly.
 */
async function downloadAsPdf(r: TailoredResume, toast: ReturnType<typeof useToast>["toast"]) {
  try {
    const html2pdf = (await import("html2pdf.js")).default;
    const container = document.createElement("div");
    container.style.cssText =
      "padding:36px;font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#1a1a1a;line-height:1.45;";
    container.innerHTML = markdownToHtml(r.cv_md);
    await html2pdf()
      .set({
        margin: 10,
        filename: `${r.name || "resume"}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
      })
      .from(container)
      .save();
  } catch (e) {
    toast({
      title: "PDF export failed",
      description: e instanceof Error ? e.message : "Couldn't generate the PDF in your browser.",
      variant: "destructive",
    });
  }
}

/** Same idea as downloadAsPdf but via the `docx` package, client-side. */
async function downloadAsDocx(r: TailoredResume, toast: ReturnType<typeof useToast>["toast"]) {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
    const { saveAs } = await import("file-saver");

    const children = parseMarkdownLines(r.cv_md).map((line) => {
      if (line.type === "blank") return new Paragraph({ text: "" });
      const runs = splitBoldRuns(line.text).map((run) => new TextRun({ text: run.text, bold: run.bold }));
      if (line.type === "h1") return new Paragraph({ heading: HeadingLevel.TITLE, children: runs });
      if (line.type === "h2")
        return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200 }, children: runs });
      if (line.type === "h3") return new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs });
      if (line.type === "bullet") return new Paragraph({ bullet: { level: 0 }, children: runs });
      return new Paragraph({ children: runs });
    });

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${r.name || "resume"}.docx`);
  } catch (e) {
    toast({
      title: "DOCX export failed",
      description: e instanceof Error ? e.message : "Couldn't generate the DOCX in your browser.",
      variant: "destructive",
    });
  }
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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
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
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

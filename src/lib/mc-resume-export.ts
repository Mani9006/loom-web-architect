// ─────────────────────────────────────────────────────────────────────────────
// mc-resume-export.ts — client-side PDF/DOCX export for My Collection's
// tailored resumes.
//
// Tailored resumes are stored as a single markdown string (mc_tailored_resumes
// .cv_md). There is no backend renderer for them, so export happens entirely
// in the browser using the `jspdf` and `docx` packages (already a project
// dependency, previously unused).
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "bullet"; text: string }
  | { type: "p"; text: string };

/** Minimal markdown line parser — headings, bullets, paragraphs. */
function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ type: "h1", text: line.slice(2) });
    else if (/^[-*]\s+/.test(line)) blocks.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "") });
    else blocks.push({ type: "p", text: line });
  }
  return blocks;
}

/** Splits "plain **bold** plain" into runs so bold survives into DOCX. */
function splitBoldRuns(text: string): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else {
      runs.push({ text: part, bold: false });
    }
  }
  return runs.length ? runs : [{ text, bold: false }];
}

function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

function sanitizeFilename(name: string): string {
  return (name.trim() || "resume").replace(/[\\/:*?"<>|]/g, "-");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportMarkdownToPdf(name: string, markdown: string) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54; // 0.75in
  const marginTop = 54;
  const marginBottom = 54;
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;

  function ensureSpace(lineHeight: number) {
    if (y + lineHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  }

  function writeLines(text: string, fontSize: number, bold: boolean, extraGapAfter = 4) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const lineHeight = fontSize * 1.28;
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += extraGapAfter;
  }

  for (const block of parseMarkdown(markdown)) {
    const clean = stripInlineMarkdown(block.text);
    if (block.type === "h1") writeLines(clean, 16, true, 8);
    else if (block.type === "h2") writeLines(clean, 12.5, true, 6);
    else if (block.type === "h3") writeLines(clean, 11, true, 4);
    else if (block.type === "bullet") writeLines(`•  ${clean}`, 10, false, 2);
    else writeLines(clean, 10, false, 6);
  }

  doc.save(`${sanitizeFilename(name)}.pdf`);
}

export async function exportMarkdownToDocx(name: string, markdown: string) {
  const paragraphs: Paragraph[] = [];

  for (const block of parseMarkdown(markdown)) {
    if (block.type === "h1") {
      paragraphs.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }));
    } else if (block.type === "h2") {
      paragraphs.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 }));
    } else if (block.type === "h3") {
      paragraphs.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 }));
    } else if (block.type === "bullet") {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: splitBoldRuns(block.text).map((r) => new TextRun({ text: r.text, bold: r.bold })),
        }),
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: splitBoldRuns(block.text).map((r) => new TextRun({ text: r.text, bold: r.bold })),
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${sanitizeFilename(name)}.docx`);
}

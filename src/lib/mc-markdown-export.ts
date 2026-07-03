// ─────────────────────────────────────────────────────────────────────────
// mc-markdown-export.ts — client-side PDF/DOCX export for My Collection's
// tailored resumes. Those are stored as plain markdown (cv_md), not the
// structured ResumeJSON the main Resume Builder works with, so they can't
// reuse useResumeExport. Runs entirely in the browser — no edge function
// round-trip, nothing to keep deployed in sync.
// ─────────────────────────────────────────────────────────────────────────

export interface MdSegment {
  text: string;
  bold: boolean;
}

/** Splits a line on `**bold**` markers into plain/bold segments. */
export function parseInlineBold(line: string): MdSegment[] {
  const segments: MdSegment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) segments.push({ text: line.slice(lastIndex, match.index), bold: false });
    segments.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) segments.push({ text: line.slice(lastIndex), bold: false });
  return segments.length ? segments : [{ text: line, bold: false }];
}

type MdLineKind = "title" | "heading" | "bullet" | "blank" | "text";

function classifyLine(raw: string): { kind: MdLineKind; text: string } {
  const line = raw.trimEnd();
  if (!line.trim()) return { kind: "blank", text: "" };
  if (line.startsWith("# ")) return { kind: "title", text: line.slice(2).trim() };
  if (line.startsWith("## ")) return { kind: "heading", text: line.slice(3).trim() };
  if (line.startsWith("- ") || line.startsWith("* ")) return { kind: "bullet", text: line.slice(2).trim() };
  return { kind: "text", text: line.trim() };
}

// ── PDF ─────────────────────────────────────────────────────────────────

const PAGE = { width: 8.5, height: 11, marginTop: 0.6, marginBottom: 0.6, marginLeft: 0.7, marginRight: 0.7 };
const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

export async function markdownToPdfBlob(markdown: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter" });
  let y = PAGE.marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE.height - PAGE.marginBottom) {
      doc.addPage();
      y = PAGE.marginTop;
    }
  };

  const drawWrapped = (
    text: string,
    x: number,
    maxWidth: number,
    size: number,
    bold: boolean,
    align: "left" | "center" = "left",
  ) => {
    const lineHeight = (size * 1.3) / 72;
    if (align === "center") {
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      ensureSpace(lineHeight);
      y += lineHeight;
      doc.text(text.replace(/\*\*/g, ""), x + maxWidth / 2, y, { align: "center" });
      return;
    }
    const segments = parseInlineBold(text);
    const words: { text: string; bold: boolean }[] = [];
    segments.forEach((seg) => {
      seg.text.split(/(\s+)/).filter(Boolean).forEach((p) => words.push({ text: p, bold: seg.bold || bold }));
    });
    ensureSpace(lineHeight);
    let curX = x;
    y += lineHeight;
    doc.setFontSize(size);
    for (const w of words) {
      const isSpace = /^\s+$/.test(w.text);
      if (isSpace && curX === x) continue;
      doc.setFont("helvetica", w.bold ? "bold" : "normal");
      const wWidth = (doc.getStringUnitWidth(w.text) * size) / 72;
      if (curX + wWidth > x + maxWidth && curX > x) {
        curX = x;
        ensureSpace(lineHeight);
        y += lineHeight;
        if (isSpace) continue;
      }
      if (!isSpace) doc.text(w.text, curX, y);
      curX += wWidth;
    }
  };

  const lines = markdown.split("\n");
  for (const raw of lines) {
    const { kind, text } = classifyLine(raw);
    switch (kind) {
      case "blank":
        y += 0.08;
        break;
      case "title":
        drawWrapped(text, PAGE.marginLeft, CONTENT_WIDTH, 18, true, "center");
        break;
      case "heading":
        y += 0.12;
        drawWrapped(text.toUpperCase(), PAGE.marginLeft, CONTENT_WIDTH, 11, true);
        ensureSpace(0.05);
        doc.setDrawColor(0);
        doc.setLineWidth(0.01);
        doc.line(PAGE.marginLeft, y + 0.03, PAGE.width - PAGE.marginRight, y + 0.03);
        y += 0.1;
        break;
      case "bullet":
        drawWrapped(`•  ${text}`, PAGE.marginLeft + 0.15, CONTENT_WIDTH - 0.15, 10, false);
        break;
      case "text":
      default:
        drawWrapped(text, PAGE.marginLeft, CONTENT_WIDTH, 10, false);
        break;
    }
  }

  return doc.output("blob");
}

export async function downloadMarkdownAsPdf(markdown: string, filename: string): Promise<void> {
  const blob = await markdownToPdfBlob(markdown);
  const { saveAs } = await import("file-saver");
  saveAs(blob, `${filename}.pdf`);
}

// ── DOCX ────────────────────────────────────────────────────────────────

export async function downloadMarkdownAsDocx(markdown: string, filename: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, BorderStyle, AlignmentType } = await import("docx");
  const { saveAs } = await import("file-saver");

  const runs = (text: string, size = 20) =>
    parseInlineBold(text)
      .filter((s) => s.text.length > 0)
      .map((s) => new TextRun({ text: s.text, bold: s.bold, size, font: "Calibri" }));

  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = markdown.split("\n");
  for (const raw of lines) {
    const { kind, text } = classifyLine(raw);
    switch (kind) {
      case "blank":
        continue;
      case "title":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: text.replace(/\*\*/g, ""), bold: true, size: 36, font: "Calibri" })],
          }),
        );
        break;
      case "heading":
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
            children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: "Calibri" })],
          }),
        );
        break;
      case "bullet":
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { before: 30 }, children: runs(text) }));
        break;
      case "text":
      default:
        children.push(new Paragraph({ spacing: { before: 40 }, children: runs(text) }));
        break;
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, right: 864, bottom: 720, left: 864 } } },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}

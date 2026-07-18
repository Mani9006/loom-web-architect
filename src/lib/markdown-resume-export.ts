// ─────────────────────────────────────────────────────────────────────────────
// markdown-resume-export.ts — client-side PDF/DOCX export for My Collection's
// tailored resumes.
//
// Tailored resumes in My Collection are stored as a single markdown string
// (`cv_md`), not the structured ResumeJSON the main Resume Builder uses (see
// src/hooks/use-resume-export.ts). This renders that markdown directly —
// entirely in the browser, using the same jsPDF/docx libraries already
// bundled for the Resume Builder — so "Download .pdf/.docx" doesn't depend
// on a backend render service.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = { width: 8.5, height: 11, marginX: 0.65, marginTop: 0.6, marginBottom: 0.6 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;

interface InlineSegment {
  text: string;
  bold: boolean;
}

/** Splits a line on `**bold**` markers into plain/bold segments. */
function parseInlineBold(line: string): InlineSegment[] {
  const parts: InlineSegment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ text: line.slice(lastIndex, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) parts.push({ text: line.slice(lastIndex), bold: false });
  return parts.length > 0 ? parts : [{ text: line, bold: false }];
}

type MdLine =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "bullet"; segments: InlineSegment[] }
  | { kind: "blank" }
  | { kind: "text"; segments: InlineSegment[] };

function parseMarkdown(md: string): MdLine[] {
  return md.split("\n").map((raw): MdLine => {
    const line = raw.trimEnd();
    if (line.trim() === "") return { kind: "blank" };
    if (line.startsWith("# ")) return { kind: "h1", text: line.slice(2).trim() };
    if (line.startsWith("## ")) return { kind: "h2", text: line.slice(3).trim() };
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return { kind: "bullet", segments: parseInlineBold(line.slice(2).trim()) };
    }
    return { kind: "text", segments: parseInlineBold(line.trim()) };
  });
}

export async function exportMarkdownResumeToPdf(fileName: string, md: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  let y = PAGE.marginTop;

  const lh = (size: number) => (size * 1.3) / 72;
  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE.height - PAGE.marginBottom) {
      doc.addPage();
      y = PAGE.marginTop;
    }
  };

  const drawWrappedSegments = (segments: InlineSegment[], x: number, maxWidth: number, size: number) => {
    doc.setFontSize(size);
    const plain = segments.map((s) => s.text).join("");
    const wrapped: string[] = doc.splitTextToSize(plain, maxWidth);
    // Bold styling is approximated at the whole-line level — good enough for
    // the common "**Role** — Company" / "**Label:** values" patterns this
    // markdown actually uses; a per-word bold reflow isn't worth the
    // complexity here.
    const allBold = segments.length > 0 && segments.every((s) => s.bold);
    for (const wline of wrapped) {
      ensureSpace(lh(size));
      y += lh(size);
      doc.setFont("helvetica", allBold ? "bold" : "normal");
      doc.text(wline, x, y);
    }
  };

  for (const line of parseMarkdown(md)) {
    switch (line.kind) {
      case "blank":
        y += lh(10) * 0.5;
        break;
      case "h1": {
        const size = 17;
        ensureSpace(lh(size) + 0.05);
        y += lh(size);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(size);
        doc.text(line.text, PAGE.width / 2, y, { align: "center" });
        y += 0.05;
        break;
      }
      case "h2": {
        const size = 12;
        ensureSpace(lh(size) + 0.2);
        y += 0.14;
        y += lh(size);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(size);
        doc.text(line.text.toUpperCase(), PAGE.marginX, y);
        y += 0.04;
        doc.setDrawColor(0);
        doc.setLineWidth(0.012);
        doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
        y += 0.1;
        break;
      }
      case "bullet": {
        const size = 10;
        ensureSpace(lh(size));
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        doc.text("•", PAGE.marginX, y + lh(size));
        drawWrappedSegments(line.segments, PAGE.marginX + 0.2, CONTENT_WIDTH - 0.2, size);
        break;
      }
      case "text": {
        const size = 10;
        drawWrappedSegments(line.segments, PAGE.marginX, CONTENT_WIDTH, size);
        break;
      }
    }
  }

  doc.save(`${fileName}.pdf`);
}

export async function exportMarkdownResumeToDocx(fileName: string, md: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import("docx");
  const { saveAs } = await import("file-saver");

  const toRuns = (segments: InlineSegment[]) =>
    segments
      .filter((s) => s.text.length > 0)
      .map((s) => new TextRun({ text: s.text, bold: s.bold, size: 20, font: "Calibri" }));

  const paragraphs = parseMarkdown(md).map((line) => {
    switch (line.kind) {
      case "blank":
        return new Paragraph({ text: "" });
      case "h1":
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: line.text, bold: true, size: 34, font: "Calibri" })],
        });
      case "h2":
        return new Paragraph({
          spacing: { before: 200, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
          children: [new TextRun({ text: line.text.toUpperCase(), bold: true, size: 22, font: "Calibri" })],
        });
      case "bullet":
        return new Paragraph({ bullet: { level: 0 }, spacing: { before: 40 }, children: toRuns(line.segments) });
      case "text":
        return new Paragraph({ spacing: { before: 40 }, children: toRuns(line.segments) });
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 936, bottom: 720, left: 936 } },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileName}.docx`);
}

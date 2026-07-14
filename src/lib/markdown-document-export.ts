// ─────────────────────────────────────────────────────────────────────────────
// markdown-document-export.ts — turns an AI-tailored resume's markdown
// (mc_tailored_resumes.cv_md) into a downloadable PDF or DOCX, entirely in
// the browser.
//
// The tailored resume has no structured ResumeJSON — it's free-form markdown
// written by the AI tailor (see BoardTab/DiscoverTab prompts: "Output ONLY
// the tailored resume in markdown"). So unlike use-resume-export.ts (which
// renders a structured ResumeJSON), this walks the markdown line-by-line and
// maps a small, deliberate subset of markdown to document formatting:
//   # / ##      -> heading (bold, larger)
//   - / *       -> bullet point
//   **bold**    -> bold run (inline, split per line)
//   blank line  -> paragraph spacing
// ─────────────────────────────────────────────────────────────────────────────

interface InlineSegment {
  text: string;
  bold: boolean;
}

/** Splits a line on `**bold**` markers into alternating plain/bold segments. */
export function parseInlineSegments(line: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const parts = line.split("**");
  parts.forEach((part, i) => {
    if (!part) return;
    segments.push({ text: part, bold: i % 2 === 1 });
  });
  return segments.length ? segments : [{ text: line, bold: false }];
}

export type LineKind = "h1" | "h2" | "h3" | "bullet" | "blank" | "text";

export interface ParsedLine {
  kind: LineKind;
  segments: InlineSegment[];
}

export function parseMarkdownLines(markdown: string): ParsedLine[] {
  return markdown.split("\n").map((raw) => {
    const line = raw.trimEnd();
    if (line.trim() === "") return { kind: "blank", segments: [] };
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) return { kind: "h1", segments: parseInlineSegments(h1[1]) };
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) return { kind: "h2", segments: parseInlineSegments(h2[1]) };
    const h3 = line.match(/^###\s+(.*)/);
    if (h3) return { kind: "h3", segments: parseInlineSegments(h3[1]) };
    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet) return { kind: "bullet", segments: parseInlineSegments(bullet[1]) };
    return { kind: "text", segments: parseInlineSegments(line.trim()) };
  });
}

const plainText = (segments: InlineSegment[]) => segments.map((s) => s.text).join("");

// ── PDF ──────────────────────────────────────────────────────────────────

const PAGE = { width: 8.5, height: 11, marginTop: 0.6, marginBottom: 0.6, marginLeft: 0.7, marginRight: 0.7 };
const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

export async function exportMarkdownToPdf(markdown: string, fileName: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  let y = PAGE.marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE.height - PAGE.marginBottom) {
      doc.addPage();
      y = PAGE.marginTop;
    }
  };

  const sizeFor = (kind: LineKind) =>
    kind === "h1" ? 17 : kind === "h2" ? 12.5 : kind === "h3" ? 11 : 10;
  const lineHeightIn = (pt: number) => (pt * 1.3) / 72;

  const drawWrapped = (segments: InlineSegment[], x: number, maxWidth: number, size: number, indent = 0) => {
    const plain = plainText(segments);
    const hasBold = segments.some((s) => s.bold);
    const lh = lineHeightIn(size);

    if (!hasBold) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(plain, maxWidth) as string[];
      for (const line of lines) {
        ensureSpace(lh);
        y += lh;
        doc.text(line, x, y);
      }
      return;
    }

    // Mixed bold/plain: fits on one line -> draw segments at measured offsets.
    doc.setFontSize(size);
    const totalWidth = segments.reduce((sum, seg) => {
      doc.setFont("helvetica", seg.bold ? "bold" : "normal");
      return sum + (doc.getStringUnitWidth(seg.text) * size) / 72;
    }, 0);

    if (totalWidth <= maxWidth) {
      ensureSpace(lh);
      y += lh;
      let cx = x;
      for (const seg of segments) {
        doc.setFont("helvetica", seg.bold ? "bold" : "normal");
        doc.text(seg.text, cx, y);
        cx += (doc.getStringUnitWidth(seg.text) * size) / 72;
      }
      return;
    }

    // Too long for one line — degrade to wrapped plain text.
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(plain, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(lh);
      y += lh;
      doc.text(line, x, y);
    }
    void indent;
  };

  const parsed = parseMarkdownLines(markdown);
  for (const line of parsed) {
    if (line.kind === "blank") {
      y += lineHeightIn(10) * 0.5;
      continue;
    }
    if (line.kind === "h1") {
      const size = sizeFor("h1");
      ensureSpace(lineHeightIn(size));
      y += lineHeightIn(size);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.text(plainText(line.segments), PAGE.width / 2, y, { align: "center" });
      continue;
    }
    if (line.kind === "h2" || line.kind === "h3") {
      const size = sizeFor(line.kind);
      y += lineHeightIn(size) * 0.4;
      ensureSpace(lineHeightIn(size));
      y += lineHeightIn(size);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.text(plainText(line.segments).toUpperCase(), PAGE.marginLeft, y);
      doc.setLineWidth(0.01);
      doc.line(PAGE.marginLeft, y + 0.03, PAGE.width - PAGE.marginRight, y + 0.03);
      y += 0.05;
      continue;
    }
    if (line.kind === "bullet") {
      const size = sizeFor("text");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const bulletIndent = 0.22;
      ensureSpace(lineHeightIn(size));
      doc.text("•", PAGE.marginLeft, y + lineHeightIn(size));
      drawWrapped(line.segments, PAGE.marginLeft + bulletIndent, CONTENT_WIDTH - bulletIndent, size);
      continue;
    }
    drawWrapped(line.segments, PAGE.marginLeft, CONTENT_WIDTH, sizeFor("text"));
  }

  doc.save(`${fileName}.pdf`);
}

// ── DOCX ─────────────────────────────────────────────────────────────────

export async function exportMarkdownToDocx(markdown: string, fileName: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("docx");
  const { saveAs } = await import("file-saver");

  const runsFor = (segments: InlineSegment[], size: number, extra: Record<string, unknown> = {}) =>
    segments.map(
      (seg) =>
        new TextRun({
          text: seg.text,
          bold: seg.bold,
          size,
          font: "Calibri",
          ...extra,
        }),
    );

  const children: InstanceType<typeof Paragraph>[] = [];
  const parsed = parseMarkdownLines(markdown);

  for (const line of parsed) {
    if (line.kind === "blank") continue;
    if (line.kind === "h1") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: runsFor(line.segments, 36, { bold: true }),
        }),
      );
      continue;
    }
    if (line.kind === "h2" || line.kind === "h3") {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          border: { bottom: { style: "single", size: 6, color: "000000" } },
          children: runsFor(
            [{ text: plainText(line.segments).toUpperCase(), bold: true }],
            line.kind === "h2" ? 22 : 20,
          ),
        }),
      );
      continue;
    }
    if (line.kind === "bullet") {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 30 },
          children: runsFor(line.segments, 20),
        }),
      );
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { before: 40 },
        children: runsFor(line.segments, 20),
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 864, bottom: 720, left: 864 } },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileName}.docx`);
}

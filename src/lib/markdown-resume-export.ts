// ─────────────────────────────────────────────────────────────────────────────
// Client-side PDF/DOCX export for My Collection tailored resumes.
//
// mc_tailored_resumes.cv_md stores plain markdown (not the structured
// ResumeJSON used by the main Resume Builder — see resumeRowToMarkdown in
// mc-ai-jobs.ts), so it needs its own lightweight renderer. This runs
// entirely in the browser — no edge function / server round-trip required.
// ─────────────────────────────────────────────────────────────────────────────

type BoldToken = { text: string; bold: boolean };
type BoldWord = { word: string; bold: boolean };

function tokenizeBold(text: string): BoldToken[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((p) => p.length > 0)
    .map((p) =>
      p.startsWith("**") && p.endsWith("**")
        ? { text: p.slice(2, -2), bold: true }
        : { text: p, bold: false },
    );
}

function tokensToWords(tokens: BoldToken[]): BoldWord[] {
  const words: BoldWord[] = [];
  for (const t of tokens) {
    for (const w of t.text.split(/\s+/)) {
      if (w) words.push({ word: w, bold: t.bold });
    }
  }
  return words;
}

// ── PDF ──────────────────────────────────────────────────────────────────

const PAGE = { width: 8.5, height: 11, marginX: 0.65, marginTop: 0.6, marginBottom: 0.6 };
const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;
const ptToIn = (pt: number) => pt / 72;

export async function renderMarkdownResumeToPdfBlob(markdown: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  let y = PAGE.marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE.height - PAGE.marginBottom) {
      doc.addPage();
      y = PAGE.marginTop;
    }
  };
  const lh = (size: number) => ptToIn(size * 1.32);

  function wrapWords(words: BoldWord[], size: number, maxWidth: number): BoldWord[][] {
    const lines: BoldWord[][] = [];
    let current: BoldWord[] = [];
    let currentWidth = 0;
    const widthOf = (w: string, bold: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      return (doc.getStringUnitWidth(w) * size) / 72;
    };
    const spaceW = widthOf(" ", false);
    for (const w of words) {
      const ww = widthOf(w.word, w.bold);
      const needed = current.length > 0 ? currentWidth + spaceW + ww : ww;
      if (needed > maxWidth && current.length > 0) {
        lines.push(current);
        current = [w];
        currentWidth = ww;
      } else {
        current.push(w);
        currentWidth = needed;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  }

  function drawWordLine(words: BoldWord[], x: number, drawY: number, size: number) {
    let curX = x;
    for (const w of words) {
      doc.setFont("helvetica", w.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.text(w.word, curX, drawY);
      curX += (doc.getStringUnitWidth(w.word) * size) / 72 + (doc.getStringUnitWidth(" ") * size) / 72;
    }
  }

  function writeParagraph(text: string, size: number, indent = 0, bulletMarker?: string) {
    const words = tokensToWords(tokenizeBold(text));
    if (words.length === 0) return;
    const x = PAGE.marginX + indent;
    const maxW = CONTENT_WIDTH - indent;
    const lines = wrapWords(words, size, maxW);
    const lineH = lh(size);
    lines.forEach((lineWords, i) => {
      ensureSpace(lineH);
      const drawY = y + lineH;
      if (bulletMarker && i === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        doc.text(bulletMarker, x - ptToIn(10), drawY);
      }
      drawWordLine(lineWords, x, drawY, size);
      y = drawY;
    });
  }

  function writeHeading(text: string) {
    y += ptToIn(8);
    ensureSpace(lh(12) + ptToIn(4));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const drawY = y + lh(12);
    doc.text(text.replace(/\*\*/g, "").toUpperCase(), PAGE.marginX, drawY);
    y = drawY + ptToIn(2);
    doc.setDrawColor(0);
    doc.setLineWidth(ptToIn(1));
    doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
    y += ptToIn(4);
  }

  function writeTitle(text: string) {
    ensureSpace(lh(17));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    const drawY = y + lh(17);
    doc.text(text.replace(/\*\*/g, ""), PAGE.width / 2, drawY, { align: "center" });
    y = drawY + ptToIn(4);
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let sawTitle = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      y += ptToIn(3);
      continue;
    }
    if (line.startsWith("# ")) {
      writeTitle(line.slice(2).trim());
      sawTitle = true;
    } else if (line.startsWith("## ")) {
      writeHeading(line.slice(3).trim());
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      writeParagraph(line.slice(2).trim(), 10, 0.2, "•");
    } else if (!sawTitle) {
      // Contact line right under the name, before any section heading.
      writeParagraph(line, 9.5, 0);
    } else {
      writeParagraph(line, 10, 0);
    }
  }

  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── DOCX ─────────────────────────────────────────────────────────────────

export async function renderMarkdownResumeToDocxBlob(markdown: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import("docx");

  const runsFor = (text: string, baseSize: number) =>
    tokenizeBold(text).map(
      (t) =>
        new TextRun({
          text: t.text,
          bold: t.bold,
          size: baseSize,
          font: "Calibri",
        }),
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let sawTitle = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({ text: line.slice(2).replace(/\*\*/g, "").trim(), bold: true, size: 34, font: "Calibri" }),
          ],
        }),
      );
      sawTitle = true;
    } else if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
          children: [
            new TextRun({
              text: line.slice(3).replace(/\*\*/g, "").trim().toUpperCase(),
              bold: true,
              size: 22,
              font: "Calibri",
            }),
          ],
        }),
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 30 },
          children: runsFor(line.slice(2).trim(), 20),
        }),
      );
    } else if (!sawTitle) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: runsFor(line, 19),
        }),
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { before: 40 },
          children: runsFor(line, 20),
        }),
      );
    }
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

  return Packer.toBlob(doc);
}

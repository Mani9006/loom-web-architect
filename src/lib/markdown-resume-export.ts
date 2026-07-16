// ─────────────────────────────────────────────────────────────────────────────
// markdown-resume-export.ts — client-side PDF/DOCX export for My Collection's
// tailored resumes, which are stored as a single markdown string (cv_md)
// rather than the structured ResumeJSON used by the main Resume Builder
// (see src/hooks/use-resume-export.ts for that renderer).
//
// Runs entirely in the browser via jsPDF / docx — no server round trip.
// ─────────────────────────────────────────────────────────────────────────────

type MdLine =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "blank" }
  | { kind: "p"; text: string };

function parseMarkdown(md: string): MdLine[] {
  return md.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line) return { kind: "blank" };
    if (line.startsWith("# ")) return { kind: "h1", text: line.slice(2).trim() };
    if (line.startsWith("## ")) return { kind: "h2", text: line.slice(3).trim() };
    if (/^[-*]\s+/.test(line)) return { kind: "bullet", text: line.replace(/^[-*]\s+/, "") };
    return { kind: "p", text: line };
  });
}

/** Strips markdown bold/italic markers for renderers that don't apply inline styling. */
function stripInlineMarkup(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
}

export async function exportMarkdownAsPdf(cvMd: string, fileName: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });

  const marginX = 0.6;
  const marginTop = 0.6;
  const marginBottom = 0.6;
  const pageWidth = 8.5;
  const pageHeight = 11;
  const contentWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const lines = parseMarkdown(cvMd);
  for (const line of lines) {
    if (line.kind === "blank") {
      y += 0.12;
      continue;
    }
    if (line.kind === "h1") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      ensureSpace(0.3);
      doc.text(stripInlineMarkup(line.text), pageWidth / 2, y + 0.22, { align: "center" });
      y += 0.34;
      continue;
    }
    if (line.kind === "h2") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      ensureSpace(0.35);
      y += 0.14;
      doc.text(stripInlineMarkup(line.text).toUpperCase(), marginX, y);
      y += 0.05;
      doc.setLineWidth(0.015);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 0.16;
      continue;
    }
    const text = stripInlineMarkup(line.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const prefix = line.kind === "bullet" ? "•  " : "";
    const wrapped = doc.splitTextToSize(prefix + text, contentWidth - (line.kind === "bullet" ? 0.15 : 0));
    for (const wLine of wrapped as string[]) {
      ensureSpace(0.17);
      doc.text(wLine, marginX + (line.kind === "bullet" ? 0.15 : 0), y + 0.13);
      y += 0.17;
    }
  }

  doc.save(`${fileName}.pdf`);
}

export async function exportMarkdownAsDocx(cvMd: string, fileName: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import("docx");
  const { saveAs } = await import("file-saver");

  const lines = parseMarkdown(cvMd);
  const children: InstanceType<typeof Paragraph>[] = [];

  for (const line of lines) {
    if (line.kind === "blank") continue;
    if (line.kind === "h1") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: stripInlineMarkup(line.text), bold: true, size: 36, font: "Calibri" })],
        })
      );
      continue;
    }
    if (line.kind === "h2") {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
          children: [
            new TextRun({ text: stripInlineMarkup(line.text).toUpperCase(), bold: true, size: 22, font: "Calibri" }),
          ],
        })
      );
      continue;
    }
    if (line.kind === "bullet") {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 30 },
          children: [new TextRun({ text: stripInlineMarkup(line.text), size: 20, font: "Calibri" })],
        })
      );
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: stripInlineMarkup(line.text), size: 20, font: "Calibri" })],
      })
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

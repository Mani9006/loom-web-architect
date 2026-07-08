// ─────────────────────────────────────────────────────────────────────────────
// markdown-resume-export.ts — client-side PDF/DOCX export for My Collection's
// AI-tailored resumes.
//
// mc_tailored_resumes.cv_md is freeform markdown (not the structured
// ResumeJSON the main Resume Builder uses), so it can't go through
// use-resume-export.ts's renderer. This is a lightweight markdown-aware
// renderer instead: it recognizes headings, bullets, bold/italic emphasis,
// and paragraphs, and lays them out directly — no backend round-trip needed.
// ─────────────────────────────────────────────────────────────────────────────

type Line =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "bullet"; text: string }
  | { type: "blank" }
  | { type: "para"; text: string };

function parseLines(markdown: string): Line[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (!line) return { type: "blank" } as Line;
      if (line.startsWith("# ")) return { type: "h1", text: stripEmphasis(line.slice(2)) };
      if (line.startsWith("## ")) return { type: "h2", text: stripEmphasis(line.slice(3)) };
      if (line.startsWith("### ")) return { type: "h2", text: stripEmphasis(line.slice(4)) };
      if (/^[-*]\s+/.test(line)) return { type: "bullet", text: stripEmphasis(line.replace(/^[-*]\s+/, "")) };
      return { type: "para", text: stripEmphasis(line) };
    });
}

// Strips markdown emphasis markers for renderers that don't do rich text
// runs (the PDF path). The DOCX path re-derives bold spans itself.
function stripEmphasis(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "$1");
}

// ── PDF ──────────────────────────────────────────────────────────────────

export async function exportMarkdownAsPdf(markdown: string, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });

  const marginX = 0.75;
  const marginTop = 0.75;
  const marginBottom = 0.75;
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

  const lines = parseLines(markdown);
  for (const line of lines) {
    if (line.type === "blank") {
      y += 0.08;
      continue;
    }
    if (line.type === "h1") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const wrapped = doc.splitTextToSize(line.text, contentWidth) as string[];
      for (const w of wrapped) {
        ensureSpace(0.28);
        doc.text(w, marginX, y + 0.2);
        y += 0.28;
      }
      y += 0.05;
      continue;
    }
    if (line.type === "h2") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      ensureSpace(0.24);
      doc.text(line.text, marginX, y + 0.16);
      y += 0.24;
      continue;
    }
    if (line.type === "bullet") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(line.text, contentWidth - 0.2) as string[];
      for (let i = 0; i < wrapped.length; i++) {
        ensureSpace(0.18);
        if (i === 0) doc.text("•", marginX, y + 0.13);
        doc.text(wrapped[i], marginX + 0.2, y + 0.13);
        y += 0.18;
      }
      continue;
    }
    // para
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(line.text, contentWidth) as string[];
    for (const w of wrapped) {
      ensureSpace(0.18);
      doc.text(w, marginX, y + 0.13);
      y += 0.18;
    }
  }

  doc.save(`${filename}.pdf`);
}

// ── DOCX ─────────────────────────────────────────────────────────────────

export async function exportMarkdownAsDocx(markdown: string, filename: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const { saveAs } = await import("file-saver");

  const lines = parseLines(markdown);
  const children = lines.map((line) => {
    if (line.type === "blank") return new Paragraph({ text: "" });
    if (line.type === "h1") {
      return new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_1 });
    }
    if (line.type === "h2") {
      return new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_2 });
    }
    if (line.type === "bullet") {
      return new Paragraph({ text: line.text, bullet: { level: 0 } });
    }
    return new Paragraph({
      children: [new TextRun({ text: line.text, size: 20, font: "Calibri" })],
    });
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// mc-resume-export.ts — client-side PDF/DOCX export for My Collection's
// tailored resumes.
//
// mc_tailored_resumes stores the resume as a single markdown blob (cv_md),
// not the structured ResumeJSON the main Resume Builder uses (see
// src/types/resume.ts + src/hooks/use-resume-export.ts). That renderer can't
// be reused here, so this renders the markdown directly with jsPDF/docx
// (both already app dependencies) instead of round-tripping through a
// server-side renderer.
// ─────────────────────────────────────────────────────────────────────────────

function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "$1");
}

export async function exportMarkdownToPdf(markdown: string, fileName: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter" });

  const marginX = 0.75;
  const pageWidth = 8.5;
  const pageBottom = 11 - 0.75;
  const maxWidth = pageWidth - marginX * 2;
  let y = 0.75;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) {
      doc.addPage();
      y = 0.75;
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      y += 0.12;
      continue;
    }

    if (line.startsWith("# ")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      ensureSpace(0.32);
      y += 0.28;
      doc.text(line.slice(2).trim(), marginX, y);
      y += 0.08;
      continue;
    }

    if (line.startsWith("## ")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      ensureSpace(0.4);
      y += 0.22;
      doc.text(line.slice(3).trim().toUpperCase(), marginX, y);
      y += 0.05;
      doc.setLineWidth(0.01);
      doc.line(marginX, y, marginX + maxWidth, y);
      y += 0.18;
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const text = stripInlineMarkdown(bulletMatch[1]);
      const wrapped: string[] = doc.splitTextToSize(text, maxWidth - 0.22);
      for (let i = 0; i < wrapped.length; i++) {
        ensureSpace(0.18);
        y += 0.18;
        if (i === 0) doc.text("•", marginX, y);
        doc.text(wrapped[i], marginX + 0.22, y);
      }
      continue;
    }

    const isBold = /^\*\*.*\*\*$/.test(line.trim());
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(10);
    const wrapped: string[] = doc.splitTextToSize(stripInlineMarkdown(line), maxWidth);
    for (const w of wrapped) {
      ensureSpace(0.18);
      y += 0.18;
      doc.text(w, marginX, y);
    }
  }

  doc.save(`${fileName}.pdf`);
}

export async function exportMarkdownToDocx(markdown: string, fileName: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const { saveAs } = await import("file-saver");

  const children = [];

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();

    if (!line) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    if (line.startsWith("# ")) {
      children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.TITLE }));
      continue;
    }

    if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: line.slice(3).trim().toUpperCase(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
        }),
      );
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      children.push(
        new Paragraph({ text: stripInlineMarkdown(bulletMatch[1]), bullet: { level: 0 } }),
      );
      continue;
    }

    const isBold = /^\*\*.*\*\*$/.test(line);
    children.push(
      new Paragraph({
        children: [new TextRun({ text: stripInlineMarkdown(line), bold: isBold })],
      }),
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileName}.docx`);
}

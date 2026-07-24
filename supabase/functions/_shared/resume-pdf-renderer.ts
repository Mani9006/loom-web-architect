import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

import {
  ATS_PDF_SPEC,
  blocksFromResumeLines,
  type LayoutBlock,
  paginateWithAutoFit,
} from "./resume-pdf-layout.ts";

function wrap(value: string, font: any, size: number, width: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const splitOversizeWord = (word: string): string[] => {
    const chunks: string[] = [];
    let chunk = "";
    for (const character of word) {
      const next = `${chunk}${character}`;
      if (chunk && font.widthOfTextAtSize(next, size) > width) {
        chunks.push(chunk);
        chunk = character;
      } else {
        chunk = next;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  };

  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      const chunks = splitOversizeWord(word);
      lines.push(...chunks.slice(0, -1));
      current = chunks.at(-1) || "";
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

const BODY_COLOR = rgb(0.12, 0.12, 0.12);
const HEADING_COLOR = rgb(0.12, 0.18, 0.25);
const RULE_COLOR = rgb(0.72, 0.75, 0.78);
const FOOTER_COLOR = rgb(0.5, 0.5, 0.5);

/**
 * Renders canonical resume lines into an ATS-friendly, selectable-text PDF.
 *
 * Entries never split across pages when they fit, headings stay with their
 * first item, bullets never split mid-line, and small one-page overflows
 * tighten spacing instead of creating an almost-empty extra page.
 */
export async function renderResumePdf(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // Fixed metadata keeps repeated renders of the same canonical document from
  // changing only because wall-clock timestamps differ.
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  pdf.setCreator("ResumePreps");
  pdf.setProducer("ResumePreps canonical resume renderer");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const spec = ATS_PDF_SPEC;
  const pageSize: [number, number] = [spec.pageWidthPt, spec.pageHeightPt];
  const margin = spec.marginPt;
  const width = spec.pageWidthPt - margin * 2;
  const lineHeight = (size: number) => size * spec.lineHeightScale;

  const blocks = blocksFromResumeLines(lines, {
    wrap: (value, size, style, indent = 0) =>
      wrap(value, style === "bold" ? bold : regular, size, width - indent),
  });
  const layout = paginateWithAutoFit(blocks, {
    usableHeight: spec.pageHeightPt - margin * 2,
    lineHeight,
  });
  const density = layout.density;

  const drawBlock = (page: any, block: LayoutBlock, yStart: number): number => {
    let y = yStart - block.gapBefore * density;
    if (block.kind === "heading" && y < pageSize[1] - margin - 20) {
      page.drawLine({
        start: { x: margin, y: y + 3 },
        end: { x: pageSize[0] - margin, y: y + 3 },
        thickness: 0.6,
        color: RULE_COLOR,
      });
    }
    for (const line of block.lines) {
      y -= lineHeight(line.size) * density;
      page.drawText(line.text, {
        x: margin + (line.indent ?? 0),
        y,
        size: line.size,
        font: line.style === "bold" ? bold : regular,
        color: block.kind === "heading" ? HEADING_COLOR : BODY_COLOR,
      });
    }
    return y;
  };

  const name = lines
    .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
    .find(Boolean) || "Resume";
  layout.pages.forEach((pageBlocks, pageIndex) => {
    const page = pdf.addPage(pageSize);
    let y = pageSize[1] - margin;
    for (const block of pageBlocks) y = drawBlock(page, block, y);
    if (layout.pages.length > 1) {
      const footer = `${name} - Page ${pageIndex + 1} of ${layout.pages.length}`;
      page.drawText(footer, {
        x: pageSize[0] / 2 - regular.widthOfTextAtSize(footer, 8) / 2,
        y: 18,
        size: 8,
        font: regular,
        color: FOOTER_COLOR,
      });
    }
  });

  return pdf.save();
}

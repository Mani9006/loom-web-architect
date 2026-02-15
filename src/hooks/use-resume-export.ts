import { useCallback, useState } from "react";
import { ResumeJSON, SKILL_CATEGORY_LABELS } from "@/types/resume";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════
// PDF Resume Renderer — jsPDF data-driven text rendering
// Produces real, selectable, ATS-parseable text (not canvas images).
//
// ATS-Optimized Layout:
// - Letter size (8.5 × 11 in)
// - 0.5in top/bottom, 0.6in left/right margins
// - Helvetica font (standard PDF font, universally ATS-compatible)
// - Consistent spacing: 10pt body, 11pt headings, 18pt name
// - Line height 1.35× for readability
// - Justified text for professional appearance
// ═══════════════════════════════════════════════════════════════════════

const PAGE = {
  width: 8.5,
  height: 11,
  marginTop: 0.5,
  marginBottom: 0.5,
  marginLeft: 0.6,
  marginRight: 0.6,
} as const;

const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight; // 7.3 in

// Font sizes in points — matches ResumeTemplate.tsx for WYSIWYG parity
const FS = {
  name: 18,
  title: 11,
  contact: 9.5,
  sectionHeading: 11,
  body: 10,
  small: 9.5,
} as const;

// Spacing constants in points — matches ResumeTemplate.tsx SPACING object
const SP = {
  sectionMarginTop: 10, // Space above each section heading
  sectionGapAfterRule: 4, // Space below section heading underline
  entryGap: 6, // Space between experience/project entries
  bulletAfter: 1.5, // Space after each bullet point
  compactEntryGap: 3, // For education/cert entries
  skillLineGap: 2, // Space between skill category lines
  headerBottomRule: 4, // Space after header bottom rule
} as const;

const LINE_HEIGHT = 1.35;
const ptToIn = (pt: number) => pt / 72;

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";
type JsPDFInstance = import("jspdf").jsPDF;

class PDFResumeRenderer {
  private doc!: JsPDFInstance;
  private y = 0;

  private ensureSpace(needed: number) {
    if (this.y + needed > PAGE.height - PAGE.marginBottom) {
      this.doc.addPage();
      this.y = PAGE.marginTop;
    }
  }

  private lh(fontSize: number) {
    return ptToIn(fontSize * LINE_HEIGHT);
  }

  private setFont(size: number, style: FontStyle = "normal") {
    this.doc.setFontSize(size);
    this.doc.setFont("helvetica", style);
  }

  private textWidth(text: string, size: number, style: FontStyle = "normal") {
    this.setFont(size, style);
    return (this.doc.getStringUnitWidth(text) * size) / 72;
  }

  private wrapText(text: string, maxWidth: number, size: number, style: FontStyle = "normal"): string[] {
    this.setFont(size, style);
    return this.doc.splitTextToSize(text, maxWidth) as string[];
  }

  private text(
    str: string,
    x: number,
    y: number,
    size: number,
    style: FontStyle = "normal",
    align: "left" | "center" | "right" = "left",
  ) {
    this.setFont(size, style);
    this.doc.text(str, x, y, { align });
  }

  /** Draws text as a clickable hyperlink in the PDF. Falls back to plain text if no URL. */
  private linkedText(
    str: string,
    url: string | undefined,
    x: number,
    y: number,
    size: number,
    style: FontStyle = "bold",
  ) {
    this.setFont(size, style);
    if (url) {
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;
      this.doc.textWithLink(str, x, y, { url: fullUrl });
    } else {
      this.doc.text(str, x, y);
    }
  }

  /**
   * Draws a single line of text justified across the full available width.
   * Words are spaced evenly so the text fills from left margin to right margin.
   * The last line of a paragraph should NOT be justified (passed as isLastLine).
   */
  private justifiedLine(
    words: string[],
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    style: FontStyle = "normal",
    isLastLine = false,
  ) {
    this.setFont(size, style);
    if (words.length === 0) return;

    // Last line or single word: just left-align
    if (isLastLine || words.length === 1) {
      this.doc.text(words.join(" "), x, y);
      return;
    }

    const totalTextWidth = words.reduce((sum, w) => sum + (this.doc.getStringUnitWidth(w) * size) / 72, 0);
    const totalGap = maxWidth - totalTextWidth;
    const gapPerSpace = totalGap / (words.length - 1);

    // Safety: don't over-stretch if gap is unreasonable (> 4× normal space)
    const normalSpaceW = (this.doc.getStringUnitWidth(" ") * size) / 72;
    if (gapPerSpace > normalSpaceW * 4) {
      this.doc.text(words.join(" "), x, y);
      return;
    }

    let curX = x;
    for (let i = 0; i < words.length; i++) {
      this.doc.text(words[i], curX, y);
      const wordW = (this.doc.getStringUnitWidth(words[i]) * size) / 72;
      curX += wordW + gapPerSpace;
    }
  }

  /**
   * Wraps text into lines and draws each line justified (full left-to-right fill).
   * The last line is left-aligned per standard typographic convention.
   */
  private justifiedBlock(text: string, x: number, maxWidth: number, size: number, style: FontStyle = "normal") {
    this.setFont(size, style);
    const allWords = text.split(/\s+/).filter((w) => w.length > 0);
    if (allWords.length === 0) return;

    const lineH = this.lh(size);
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentWidth = 0;
    const spaceWidth = (this.doc.getStringUnitWidth(" ") * size) / 72;

    for (const word of allWords) {
      const wordWidth = (this.doc.getStringUnitWidth(word) * size) / 72;
      const neededWidth = currentLine.length > 0 ? currentWidth + spaceWidth + wordWidth : wordWidth;

      if (neededWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [word];
        currentWidth = wordWidth;
      } else {
        currentLine.push(word);
        currentWidth = neededWidth;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(lineH);
      const drawY = this.y + lineH;
      const isLastLine = i === lines.length - 1;
      this.justifiedLine(lines[i], x, drawY, maxWidth, size, style, isLastLine);
      this.y = drawY;
    }
  }

  private hline(width: number = 1) {
    this.doc.setDrawColor(0);
    this.doc.setLineWidth(ptToIn(width));
    this.doc.line(PAGE.marginLeft, this.y, PAGE.width - PAGE.marginRight, this.y);
  }

  private flexRow(
    left: string,
    right: string,
    leftSize: number,
    leftStyle: FontStyle,
    rightSize: number,
    rightStyle: FontStyle = "normal",
  ) {
    const lineH = this.lh(Math.max(leftSize, rightSize));
    const rightW = right ? this.textWidth(right, rightSize, rightStyle) : 0;
    const gap = right ? ptToIn(8) : 0;
    const maxLeftW = CONTENT_WIDTH - rightW - gap;
    const leftLines = this.wrapText(left, maxLeftW, leftSize, leftStyle);

    for (let i = 0; i < leftLines.length; i++) {
      this.ensureSpace(lineH);
      const drawY = this.y + lineH;

      this.text(leftLines[i], PAGE.marginLeft, drawY, leftSize, leftStyle);

      // Right-aligned text only on the first line
      if (i === 0 && right) {
        this.text(right, PAGE.width - PAGE.marginRight, drawY, rightSize, rightStyle, "right");
      }

      this.y = drawY;
    }
  }

  private sectionHeading(title: string) {
    const headingH = ptToIn(SP.sectionMarginTop) + this.lh(FS.sectionHeading) + ptToIn(2) + ptToIn(1.5);
    const minBlock = headingH + this.lh(FS.body) * 2;
    this.ensureSpace(minBlock);

    this.y += ptToIn(SP.sectionMarginTop);
    this.text(title.toUpperCase(), PAGE.marginLeft, this.y + this.lh(FS.sectionHeading), FS.sectionHeading, "bold");
    this.y += this.lh(FS.sectionHeading) + ptToIn(2);
    this.hline(1.5);
    this.y += ptToIn(SP.sectionGapAfterRule);
  }

  private bulletPoint(text: string, indent = 0.19) {
    const bulletX = PAGE.marginLeft + indent - ptToIn(8);
    const textX = PAGE.marginLeft + indent;
    const maxW = CONTENT_WIDTH - indent;

    // Word-wrap manually for justified rendering
    this.setFont(FS.body, "normal");
    const allWords = text.split(/\s+/).filter((w) => w.length > 0);
    if (allWords.length === 0) return;

    const lineH = this.lh(FS.body);
    const spaceWidth = (this.doc.getStringUnitWidth(" ") * FS.body) / 72;
    const wordLines: string[][] = [];
    let currentLine: string[] = [];
    let currentWidth = 0;

    for (const word of allWords) {
      const wordWidth = (this.doc.getStringUnitWidth(word) * FS.body) / 72;
      const neededWidth = currentLine.length > 0 ? currentWidth + spaceWidth + wordWidth : wordWidth;

      if (neededWidth > maxW && currentLine.length > 0) {
        wordLines.push(currentLine);
        currentLine = [word];
        currentWidth = wordWidth;
      } else {
        currentLine.push(word);
        currentWidth = neededWidth;
      }
    }
    if (currentLine.length > 0) wordLines.push(currentLine);

    for (let i = 0; i < wordLines.length; i++) {
      this.ensureSpace(lineH);
      const drawY = this.y + lineH;

      // Draw bullet marker on the first line only
      if (i === 0) {
        this.text("\u2022", bulletX, drawY, FS.body);
      }

      const isLastLine = i === wordLines.length - 1;
      this.justifiedLine(wordLines[i], textX, drawY, maxW, FS.body, "normal", isLastLine);
      this.y = drawY;
    }
    this.y += ptToIn(SP.bulletAfter);
  }

  // ── Section renderers ──────────────────────────────────────────────

  private renderHeader(h: ResumeJSON["header"]) {
    const cx = PAGE.width / 2;
    const nameH = this.lh(FS.name);
    this.text(h.name || "Your Name", cx, this.y + nameH, FS.name, "bold", "center");
    this.y += nameH;

    if (h.title) {
      const titleH = this.lh(FS.title);
      this.y += ptToIn(2);
      this.text(h.title, cx, this.y + titleH, FS.title, "bold", "center");
      this.y += titleH;
    }

    const parts: string[] = [];
    if (h.location) parts.push(h.location);
    if (h.email) parts.push(h.email);
    if (h.phone) parts.push(h.phone);
    // Show actual LinkedIn URL for ATS parsing (not just "LinkedIn" text)
    if (h.linkedin) {
      const cleanUrl = h.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      parts.push(cleanUrl);
    }

    if (parts.length > 0) {
      const contactH = this.lh(FS.contact);
      this.y += ptToIn(3);
      const contactText = parts.join("  |  ");
      // Check if contact line needs wrapping
      const contactW = this.textWidth(contactText, FS.contact);
      if (contactW > CONTENT_WIDTH) {
        // Split into two lines if too wide
        const mid = Math.ceil(parts.length / 2);
        const line1 = parts.slice(0, mid).join("  |  ");
        const line2 = parts.slice(mid).join("  |  ");
        this.text(line1, cx, this.y + contactH, FS.contact, "normal", "center");
        this.y += contactH;
        this.text(line2, cx, this.y + contactH, FS.contact, "normal", "center");
        this.y += contactH;
      } else {
        this.text(contactText, cx, this.y + contactH, FS.contact, "normal", "center");
        this.y += contactH;
      }
    }

    // Add LinkedIn URL as clickable link in PDF metadata
    if (h.linkedin) {
      const url = h.linkedin.startsWith("http") ? h.linkedin : `https://${h.linkedin}`;
      // jsPDF textWithLink isn't reliable, but the URL text is there for ATS
      void url; // URL is already in the text above for ATS parsing
    }

    this.y += ptToIn(5);
    this.hline(2);
    this.y += ptToIn(SP.headerBottomRule);
  }

  private renderSummary(summary: string) {
    this.sectionHeading("Professional Summary");
    this.justifiedBlock(summary, PAGE.marginLeft, CONTENT_WIDTH, FS.body);
  }

  private renderExperience(experience: ResumeJSON["experience"]) {
    const valid = experience.filter((e) => e.company_or_client);
    if (valid.length === 0) return;
    this.sectionHeading("Professional Experience");
    valid.forEach((exp, idx) => {
      this.flexRow(
        exp.role || "Role",
        `${exp.start_date || "Start"} \u2014 ${exp.end_date || "Present"}`,
        FS.body,
        "bold",
        FS.small,
      );
      this.flexRow(exp.company_or_client, exp.location || "", FS.body, "italic", FS.small);
      exp.bullets.forEach((b) => this.bulletPoint(b));
      if (idx < valid.length - 1) this.y += ptToIn(SP.entryGap);
    });
  }

  private renderEducation(education: ResumeJSON["education"]) {
    const valid = education.filter((e) => e.institution);
    if (valid.length === 0) return;
    this.sectionHeading("Education");
    valid.forEach((edu) => {
      // Use "in" between degree and field (e.g., "B.S. in Computer Science")
      const deg = edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree";
      let left = deg;
      if (edu.institution) left += ` \u2014 ${edu.institution}`;
      if (edu.gpa) left += ` (GPA: ${edu.gpa})`;
      this.flexRow(left, edu.graduation_date || "", FS.body, "bold", FS.small);
      if (edu.location) {
        const locH = this.lh(FS.small);
        this.ensureSpace(locH);
        this.text(edu.location, PAGE.marginLeft, this.y + locH, FS.small, "italic");
        this.y += locH;
      }
      this.y += ptToIn(SP.compactEntryGap);
    });
  }

  private renderSkills(skills: ResumeJSON["skills"]) {
    const cats = Object.entries(skills)
      .filter(([_, s]) => s.length > 0)
      .map(([key, s]) => ({
        label: SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        skills: s,
      }));
    if (cats.length === 0) return;
    this.sectionHeading("Technical Skills");
    cats.forEach((cat) => {
      const prefix = `${cat.label}: `;
      const prefixW = this.textWidth(prefix, FS.body, "bold");
      const fullText = prefix + cat.skills.join(", ");
      const lines = this.wrapText(fullText, CONTENT_WIDTH, FS.body);
      const lineH = this.lh(FS.body);
      for (let i = 0; i < lines.length; i++) {
        this.ensureSpace(lineH);
        const drawY = this.y + lineH;
        if (i === 0) {
          this.text(prefix, PAGE.marginLeft, drawY, FS.body, "bold");
          const rest = lines[0].substring(prefix.length);
          if (rest) this.text(rest, PAGE.marginLeft + prefixW, drawY, FS.body);
        } else {
          this.text(lines[i], PAGE.marginLeft, drawY, FS.body);
        }
        this.y = drawY;
      }
      this.y += ptToIn(SP.skillLineGap);
    });
  }

  private renderCertifications(certs: ResumeJSON["certifications"]) {
    const valid = certs.filter((c) => c.name);
    if (valid.length === 0) return;
    this.sectionHeading("Certifications");
    valid.forEach((cert) => {
      // Name bold (hyperlinked if URL provided), issuer normal weight with em-dash separator
      const nameW = this.textWidth(cert.name, FS.body, "bold");
      const lineH = this.lh(FS.body);
      const rightText = cert.date || "";

      this.ensureSpace(lineH);
      const drawY = this.y + lineH;

      // Bold name — hyperlinked if cert.url is provided
      this.linkedText(cert.name, cert.url, PAGE.marginLeft, drawY, FS.body, "bold");

      // Normal weight issuer after em-dash
      if (cert.issuer) {
        const separator = " \u2014 ";
        const sepW = this.textWidth(separator, FS.body);
        this.text(separator, PAGE.marginLeft + nameW, drawY, FS.body);
        this.text(cert.issuer, PAGE.marginLeft + nameW + sepW, drawY, FS.body);
      }

      // Right-aligned date
      if (rightText) {
        this.text(rightText, PAGE.width - PAGE.marginRight, drawY, FS.small, "normal", "right");
      }

      this.y = drawY + ptToIn(SP.compactEntryGap);
    });
  }

  private renderProjects(projects?: ResumeJSON["projects"]) {
    const valid = (projects || []).filter((p) => p.title);
    if (valid.length === 0) return;
    this.sectionHeading("Projects");
    valid.forEach((proj, idx) => {
      const rightParts: string[] = [];
      if (proj.organization) rightParts.push(proj.organization);
      if (proj.date) rightParts.push(proj.date);
      const rightText = rightParts.join(" \u2014 ");

      // If project has a URL, render the title as a hyperlink; otherwise use flexRow
      if (proj.url) {
        const lineH = this.lh(FS.body);
        const rightW = rightText ? this.textWidth(rightText, FS.small, "italic") : 0;
        const gap = rightText ? ptToIn(8) : 0;

        this.ensureSpace(lineH);
        const drawY = this.y + lineH;

        this.linkedText(proj.title, proj.url, PAGE.marginLeft, drawY, FS.body, "bold");

        if (rightText) {
          this.text(rightText, PAGE.width - PAGE.marginRight, drawY, FS.small, "italic", "right");
        }
        this.y = drawY;
      } else {
        this.flexRow(proj.title, rightText, FS.body, "bold", FS.small, "italic");
      }

      proj.bullets.forEach((b) => this.bulletPoint(b));
      if (idx < valid.length - 1) this.y += ptToIn(SP.entryGap);
    });
  }

  private renderLanguages(languages?: ResumeJSON["languages"]) {
    const valid = (languages || []).filter((l) => l.language);
    if (valid.length === 0) return;
    this.sectionHeading("Languages");
    const text = valid.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`).join("  |  ");
    const lines = this.wrapText(text, CONTENT_WIDTH, FS.body);
    for (const line of lines) {
      const lineH = this.lh(FS.body);
      this.ensureSpace(lineH);
      this.text(line, PAGE.marginLeft, this.y + lineH, FS.body);
      this.y += lineH;
    }
  }

  private renderVolunteer(volunteer?: ResumeJSON["volunteer"]) {
    const valid = (volunteer || []).filter((v) => v.organization);
    if (valid.length === 0) return;
    this.sectionHeading("Volunteer Experience");
    valid.forEach((vol, idx) => {
      this.flexRow(vol.role || "Volunteer", vol.date || "", FS.body, "bold", FS.small);
      const orgH = this.lh(FS.body);
      this.ensureSpace(orgH);
      this.text(vol.organization, PAGE.marginLeft, this.y + orgH, FS.body, "italic");
      this.y += orgH;
      vol.bullets.forEach((b) => this.bulletPoint(b));
      if (idx < valid.length - 1) this.y += ptToIn(SP.entryGap);
    });
  }

  private renderAwards(awards?: ResumeJSON["awards"]) {
    const valid = (awards || []).filter((a) => a.title);
    if (valid.length === 0) return;
    this.sectionHeading("Awards & Publications");
    valid.forEach((award) => {
      // Title bold (hyperlinked if URL provided), issuer normal with em-dash
      const nameW = this.textWidth(award.title, FS.body, "bold");
      const lineH = this.lh(FS.body);

      this.ensureSpace(lineH);
      const drawY = this.y + lineH;

      // Bold title — hyperlinked if award.url is provided
      this.linkedText(award.title, award.url, PAGE.marginLeft, drawY, FS.body, "bold");

      if (award.issuer) {
        const separator = " \u2014 ";
        const sepW = this.textWidth(separator, FS.body);
        this.text(separator, PAGE.marginLeft + nameW, drawY, FS.body);
        this.text(award.issuer, PAGE.marginLeft + nameW + sepW, drawY, FS.body);
      }
      if (award.date) {
        this.text(award.date, PAGE.width - PAGE.marginRight, drawY, FS.small, "normal", "right");
      }

      this.y = drawY + ptToIn(SP.compactEntryGap);
    });
  }

  private renderCustomSections(sections?: ResumeJSON["customSections"]) {
    const valid = (sections || []).filter((cs) => cs.entries.some((e) => e.title));
    if (valid.length === 0) return;
    valid.forEach((cs) => {
      this.sectionHeading(cs.name);
      const entries = cs.entries.filter((e) => e.title);
      entries.forEach((entry, idx) => {
        // If entry has a URL, render title as hyperlink; otherwise use flexRow
        if (entry.url) {
          const lineH = this.lh(FS.body);
          this.ensureSpace(lineH);
          const drawY = this.y + lineH;
          this.linkedText(entry.title, entry.url, PAGE.marginLeft, drawY, FS.body, "bold");
          if (entry.date) {
            this.text(entry.date, PAGE.width - PAGE.marginRight, drawY, FS.small, "normal", "right");
          }
          this.y = drawY;
        } else {
          this.flexRow(entry.title, entry.date || "", FS.body, "bold", FS.small);
        }
        if (entry.subtitle) {
          const subH = this.lh(FS.body);
          this.ensureSpace(subH);
          this.text(entry.subtitle, PAGE.marginLeft, this.y + subH, FS.body, "italic");
          this.y += subH;
        }
        entry.bullets.forEach((b) => this.bulletPoint(b));
        if (idx < entries.length - 1) this.y += ptToIn(SP.entryGap);
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────

  public async render(data: ResumeJSON): Promise<JsPDFInstance> {
    const { jsPDF } = await import("jspdf");
    this.doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
    this.y = PAGE.marginTop;
    this.doc.setTextColor(0, 0, 0);

    // Set PDF metadata for ATS
    this.doc.setProperties({
      title: `${data.header.name || "Resume"} - Resume`,
      subject: data.header.title || "Professional Resume",
      author: data.header.name || "",
      creator: "Resume Builder",
    });

    this.renderHeader(data.header);
    if (data.summary) this.renderSummary(data.summary);
    this.renderExperience(data.experience);
    this.renderEducation(data.education);
    this.renderSkills(data.skills);
    this.renderCertifications(data.certifications);
    this.renderProjects(data.projects);
    this.renderLanguages(data.languages);
    this.renderVolunteer(data.volunteer);
    this.renderAwards(data.awards);
    this.renderCustomSections(data.customSections);

    // Add page numbers for multi-page resumes
    const totalPages = this.doc.getNumberOfPages();
    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        this.doc.setPage(i);
        this.setFont(8, "normal");
        this.doc.setTextColor(128, 128, 128);
        this.doc.text(
          `${data.header.name || "Resume"} — Page ${i} of ${totalPages}`,
          PAGE.width / 2,
          PAGE.height - 0.25,
          { align: "center" },
        );
        this.doc.setTextColor(0, 0, 0);
      }
    }

    return this.doc;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// React Hook
// ═══════════════════════════════════════════════════════════════════════

export function useResumeExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = useCallback(async (data: ResumeJSON, fileName: string) => {
    setIsExporting(true);
    try {
      const renderer = new PDFResumeRenderer();
      const doc = await renderer.render(data);
      doc.save(`${fileName}.pdf`);
      toast.success("Resume exported as PDF!");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportToWord = useCallback(async (data: ResumeJSON, fileName: string) => {
    setIsExporting(true);
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, ExternalHyperlink } =
        await import("docx");
      const { saveAs } = await import("file-saver");

      const children: any[] = [];

      // ── Header - Name ──────────────────────────────────────────────
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: data.header.name || "Your Name",
              bold: true,
              size: 36, // 18pt (matching PDF/template)
              font: "Calibri",
            }),
          ],
        }),
      );

      // ── Title ───────────────────────────────────────────────────────
      if (data.header.title) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40 },
            children: [
              new TextRun({
                text: data.header.title,
                bold: true,
                size: 22, // 11pt
                font: "Calibri",
              }),
            ],
          }),
        );
      }

      // ── Contact info ────────────────────────────────────────────────
      const contactParts: string[] = [];
      if (data.header.location) contactParts.push(data.header.location);
      if (data.header.email) contactParts.push(data.header.email);
      if (data.header.phone) contactParts.push(data.header.phone);
      if (data.header.linkedin) {
        const cleanUrl = data.header.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
        contactParts.push(cleanUrl);
      }

      if (contactParts.length > 0) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
            },
            children: [
              new TextRun({
                text: contactParts.join("  |  "),
                size: 19, // 9.5pt
                font: "Calibri",
              }),
            ],
          }),
        );
      }

      // Helper for section headings (consistent across all sections)
      const sectionHeading = (title: string) =>
        new Paragraph({
          spacing: { before: 200, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
          },
          children: [
            new TextRun({
              text: title.toUpperCase(),
              bold: true,
              size: 22, // 11pt
              font: "Calibri",
              characterSpacing: 30,
            }),
          ],
        });

      // ── Summary ─────────────────────────────────────────────────────
      if (data.summary) {
        children.push(sectionHeading("Professional Summary"));
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: data.summary,
                size: 20, // 10pt
                font: "Calibri",
              }),
            ],
          }),
        );
      }

      // ── Experience ──────────────────────────────────────────────────
      const validExperience = data.experience.filter((e) => e.company_or_client);
      if (validExperience.length > 0) {
        children.push(sectionHeading("Professional Experience"));

        validExperience.forEach((exp) => {
          // Role + Dates
          children.push(
            new Paragraph({
              spacing: { before: 120 },
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                new TextRun({
                  text: exp.role || "Role",
                  bold: true,
                  size: 20,
                  font: "Calibri",
                }),
                new TextRun({
                  text: `\t${exp.start_date || "Start"} \u2014 ${exp.end_date || "Present"}`,
                  size: 19,
                  font: "Calibri",
                }),
              ],
            }),
          );

          // Company + Location
          children.push(
            new Paragraph({
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                new TextRun({
                  text: exp.company_or_client,
                  italics: true,
                  size: 20,
                  font: "Calibri",
                }),
                exp.location
                  ? new TextRun({
                      text: `\t${exp.location}`,
                      size: 19,
                      font: "Calibri",
                    })
                  : new TextRun({ text: "" }),
              ],
            }),
          );

          // Bullets
          exp.bullets.forEach((bullet) => {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 30 },
                children: [
                  new TextRun({
                    text: bullet,
                    size: 20,
                    font: "Calibri",
                  }),
                ],
              }),
            );
          });
        });
      }

      // ── Education ───────────────────────────────────────────────────
      const validEducation = data.education.filter((e) => e.institution);
      if (validEducation.length > 0) {
        children.push(sectionHeading("Education"));

        validEducation.forEach((edu) => {
          const degreeText =
            edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree";

          children.push(
            new Paragraph({
              spacing: { before: 80 },
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                new TextRun({
                  text: degreeText,
                  bold: true,
                  size: 20,
                  font: "Calibri",
                }),
                edu.institution
                  ? new TextRun({
                      text: ` \u2014 ${edu.institution}`,
                      size: 20,
                      font: "Calibri",
                    })
                  : new TextRun({ text: "" }),
                edu.gpa
                  ? new TextRun({
                      text: ` (GPA: ${edu.gpa})`,
                      size: 20,
                      font: "Calibri",
                    })
                  : new TextRun({ text: "" }),
                new TextRun({
                  text: `\t${edu.graduation_date || ""}`,
                  size: 19,
                  font: "Calibri",
                }),
              ],
            }),
          );

          if (edu.location) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: edu.location,
                    italics: true,
                    size: 19,
                    font: "Calibri",
                  }),
                ],
              }),
            );
          }
        });
      }

      // ── Skills ──────────────────────────────────────────────────────
      const skillCategories = Object.entries(data.skills)
        .filter(([_, skills]) => skills.length > 0)
        .map(([key, skills]) => ({
          category: SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          skills,
        }));

      if (skillCategories.length > 0) {
        children.push(sectionHeading("Technical Skills"));

        skillCategories.forEach((sc) => {
          children.push(
            new Paragraph({
              spacing: { before: 40 },
              children: [
                new TextRun({
                  text: `${sc.category}: `,
                  bold: true,
                  size: 20,
                  font: "Calibri",
                }),
                new TextRun({
                  text: sc.skills.join(", "),
                  size: 20,
                  font: "Calibri",
                }),
              ],
            }),
          );
        });
      }

      // ── Certifications ──────────────────────────────────────────────
      const validCerts = data.certifications.filter((c) => c.name);
      if (validCerts.length > 0) {
        children.push(sectionHeading("Certifications"));

        validCerts.forEach((cert) => {
          const certNameChild = cert.url
            ? new ExternalHyperlink({
                link: cert.url.startsWith("http") ? cert.url : `https://${cert.url}`,
                children: [
                  new TextRun({
                    text: cert.name,
                    bold: true,
                    size: 20,
                    font: "Calibri",
                    color: "000000",
                  }),
                ],
              })
            : new TextRun({
                text: cert.name,
                bold: true,
                size: 20,
                font: "Calibri",
              });

          children.push(
            new Paragraph({
              spacing: { before: 40 },
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                certNameChild,
                cert.issuer
                  ? new TextRun({
                      text: ` \u2014 ${cert.issuer}`,
                      size: 20,
                      font: "Calibri",
                    })
                  : new TextRun({ text: "" }),
                new TextRun({
                  text: `\t${cert.date || ""}`,
                  size: 19,
                  font: "Calibri",
                }),
              ],
            }),
          );
        });
      }

      // ── Projects ────────────────────────────────────────────────────
      const validProjects = data.projects?.filter((p) => p.title) || [];
      if (validProjects.length > 0) {
        children.push(sectionHeading("Projects"));

        validProjects.forEach((project) => {
          const projTitleChild = project.url
            ? new ExternalHyperlink({
                link: project.url.startsWith("http") ? project.url : `https://${project.url}`,
                children: [
                  new TextRun({
                    text: project.title,
                    bold: true,
                    size: 20,
                    font: "Calibri",
                    color: "000000",
                  }),
                ],
              })
            : new TextRun({
                text: project.title,
                bold: true,
                size: 20,
                font: "Calibri",
              });

          children.push(
            new Paragraph({
              spacing: { before: 100 },
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                projTitleChild,
                project.date || project.organization
                  ? new TextRun({
                      text: `\t${project.organization ? `${project.organization} \u2014 ` : ""}${project.date || ""}`,
                      italics: true,
                      size: 19,
                      font: "Calibri",
                    })
                  : new TextRun({ text: "" }),
              ],
            }),
          );

          project.bullets.forEach((bullet) => {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 30 },
                children: [
                  new TextRun({
                    text: bullet,
                    size: 20,
                    font: "Calibri",
                  }),
                ],
              }),
            );
          });
        });
      }

      // ── Languages ───────────────────────────────────────────────────
      const validLanguages = (data.languages || []).filter((l) => l.language);
      if (validLanguages.length > 0) {
        children.push(sectionHeading("Languages"));
        const langText = validLanguages
          .map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`)
          .join("  |  ");
        children.push(
          new Paragraph({
            spacing: { before: 40 },
            children: [
              new TextRun({
                text: langText,
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
        );
      }

      // ── Volunteer ───────────────────────────────────────────────────
      const validVolunteer = (data.volunteer || []).filter((v) => v.organization);
      if (validVolunteer.length > 0) {
        children.push(sectionHeading("Volunteer Experience"));

        validVolunteer.forEach((vol) => {
          children.push(
            new Paragraph({
              spacing: { before: 100 },
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                new TextRun({
                  text: vol.role || "Volunteer",
                  bold: true,
                  size: 20,
                  font: "Calibri",
                }),
                vol.date
                  ? new TextRun({ text: `\t${vol.date}`, size: 19, font: "Calibri" })
                  : new TextRun({ text: "" }),
              ],
            }),
          );
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: vol.organization,
                  italics: true,
                  size: 20,
                  font: "Calibri",
                }),
              ],
            }),
          );
          vol.bullets.forEach((bullet) => {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 30 },
                children: [new TextRun({ text: bullet, size: 20, font: "Calibri" })],
              }),
            );
          });
        });
      }

      // ── Awards ──────────────────────────────────────────────────────
      const validAwards = (data.awards || []).filter((a) => a.title);
      if (validAwards.length > 0) {
        children.push(sectionHeading("Awards & Publications"));

        validAwards.forEach((award) => {
          const awardTitleChild = award.url
            ? new ExternalHyperlink({
                link: award.url.startsWith("http") ? award.url : `https://${award.url}`,
                children: [
                  new TextRun({
                    text: award.title,
                    bold: true,
                    size: 20,
                    font: "Calibri",
                    color: "000000",
                  }),
                ],
              })
            : new TextRun({
                text: award.title,
                bold: true,
                size: 20,
                font: "Calibri",
              });

          children.push(
            new Paragraph({
              spacing: { before: 40 },
              tabStops: [{ type: "right" as any, position: 9360 }],
              children: [
                awardTitleChild,
                award.issuer
                  ? new TextRun({ text: ` \u2014 ${award.issuer}`, size: 20, font: "Calibri" })
                  : new TextRun({ text: "" }),
                award.date
                  ? new TextRun({ text: `\t${award.date}`, size: 19, font: "Calibri" })
                  : new TextRun({ text: "" }),
              ],
            }),
          );
        });
      }

      // ── Custom Sections ─────────────────────────────────────────────
      const validCustom = (data.customSections || []).filter((cs) => cs.entries.some((e) => e.title));
      validCustom.forEach((cs) => {
        children.push(sectionHeading(cs.name));
        cs.entries
          .filter((e) => e.title)
          .forEach((entry) => {
            const entryTitleChild = entry.url
              ? new ExternalHyperlink({
                  link: entry.url.startsWith("http") ? entry.url : `https://${entry.url}`,
                  children: [
                    new TextRun({ text: entry.title, bold: true, size: 20, font: "Calibri", color: "000000" }),
                  ],
                })
              : new TextRun({ text: entry.title, bold: true, size: 20, font: "Calibri" });

            children.push(
              new Paragraph({
                spacing: { before: 100 },
                tabStops: [{ type: "right" as any, position: 9360 }],
                children: [
                  entryTitleChild,
                  entry.date
                    ? new TextRun({ text: `\t${entry.date}`, size: 19, font: "Calibri" })
                    : new TextRun({ text: "" }),
                ],
              }),
            );
            if (entry.subtitle) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: entry.subtitle, italics: true, size: 20, font: "Calibri" })],
                }),
              );
            }
            entry.bullets.forEach((bullet) => {
              children.push(
                new Paragraph({
                  bullet: { level: 0 },
                  spacing: { before: 30 },
                  children: [new TextRun({ text: bullet, size: 20, font: "Calibri" })],
                }),
              );
            });
          });
      });

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720, // 0.5 inch (720 twips)
                  right: 864, // 0.6 inch (matching PDF/template)
                  bottom: 720,
                  left: 864,
                },
              },
            },
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${fileName}.docx`);
      toast.success("Resume exported as Word document!");
    } catch (error) {
      console.error("Word export error:", error);
      toast.error("Failed to export Word document. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportToPDF, exportToWord, isExporting };
}

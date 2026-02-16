/**
 * PDF Resume Renderer — jsPDF data-driven text rendering
 *
 * Produces real, selectable, ATS-parseable text in the PDF
 * (replaces the old html2pdf.js image-based approach).
 *
 * Architecture mirrors the existing `exportToWord` in use-resume-export.ts:
 * iterate ResumeJSON fields → emit structured content with jsPDF calls.
 */

import type { ResumeJSON } from "@/types/resume";
import { getSkillCategoryLabel } from "@/types/resume";

// ─── Page & layout constants (match ResumeTemplate.tsx) ──────────────
const PAGE = {
  width: 8.5,
  height: 11,
  marginTop: 0.5,
  marginBottom: 0.5,
  marginLeft: 0.6,
  marginRight: 0.6,
} as const;

const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight; // 7.3 in

// Font sizes in points
const FS = {
  name: 18,
  title: 11,
  contact: 9.5,
  sectionHeading: 11,
  body: 10,
  small: 9.5,
} as const;

const LINE_HEIGHT = 1.35; // multiplier applied to font size

// Convert pt → inches for vertical spacing
const ptToIn = (pt: number) => pt / 72;

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

// ─── Renderer class ──────────────────────────────────────────────────
export class PDFResumeRenderer {
  private doc!: import("jspdf").jsPDF;
  private y = 0; // current Y cursor in inches

  // ── helpers ────────────────────────────────────────────────────────

  /** Ensure enough room; if not, start a new page. */
  private ensureSpace(needed: number) {
    if (this.y + needed > PAGE.height - PAGE.marginBottom) {
      this.doc.addPage();
      this.y = PAGE.marginTop;
    }
  }

  /** Line height in inches for a given font size. */
  private lh(fontSize: number) {
    return ptToIn(fontSize * LINE_HEIGHT);
  }

  /** Set font shorthand. */
  private setFont(size: number, style: FontStyle = "normal") {
    this.doc.setFontSize(size);
    this.doc.setFont("helvetica", style);
  }

  /** Measure text width in inches. */
  private textWidth(text: string, size: number, style: FontStyle = "normal") {
    this.setFont(size, style);
    return (this.doc.getStringUnitWidth(text) * size) / 72;
  }

  /** Wrap text to fit within maxWidth (inches). Returns array of lines. */
  private wrapText(text: string, maxWidth: number, size: number, style: FontStyle = "normal"): string[] {
    this.setFont(size, style);
    // splitTextToSize expects width in current doc units (inches)
    return this.doc.splitTextToSize(text, maxWidth) as string[];
  }

  /** Draw a single line of text. Does NOT advance Y. */
  private text(str: string, x: number, y: number, size: number, style: FontStyle = "normal", align: "left" | "center" | "right" = "left") {
    this.setFont(size, style);
    this.doc.text(str, x, y, { align });
  }

  /** Draw a horizontal rule at the current Y. */
  private hline(width: number = 1) {
    this.doc.setDrawColor(0);
    this.doc.setLineWidth(ptToIn(width));
    this.doc.line(PAGE.marginLeft, this.y, PAGE.width - PAGE.marginRight, this.y);
  }

  // ── layout primitives ──────────────────────────────────────────────

  /** Left-aligned text + right-aligned text on the same baseline. */
  private flexRow(
    left: string,
    right: string,
    leftSize: number,
    leftStyle: FontStyle,
    rightSize: number,
    rightStyle: FontStyle = "normal",
  ) {
    const lineH = this.lh(Math.max(leftSize, rightSize));
    this.ensureSpace(lineH);

    // Determine max width for left text (leave room for right text + gap)
    const rightW = right ? this.textWidth(right, rightSize, rightStyle) : 0;
    const gap = right ? ptToIn(8) : 0; // 8pt gap matches the template's marginLeft: "8pt"
    const maxLeftW = CONTENT_WIDTH - rightW - gap;

    // Wrap left text if it's too wide
    const leftLines = this.wrapText(left, maxLeftW, leftSize, leftStyle);

    // Draw first line with the right text aligned
    const baseY = this.y + lineH;
    this.text(leftLines[0], PAGE.marginLeft, baseY, leftSize, leftStyle);
    if (right) {
      this.text(right, PAGE.width - PAGE.marginRight, baseY, rightSize, rightStyle, "right");
    }
    this.y = baseY;

    // If left text wrapped to additional lines, draw them
    for (let i = 1; i < leftLines.length; i++) {
      this.y += this.lh(leftSize);
      this.ensureSpace(this.lh(leftSize));
      this.text(leftLines[i], PAGE.marginLeft, this.y, leftSize, leftStyle);
    }
  }

  /** Section heading: UPPERCASE BOLD with underline. */
  private sectionHeading(title: string) {
    const headingH = ptToIn(8) + this.lh(FS.sectionHeading) + ptToIn(2) + ptToIn(1.5);
    // Ensure heading + at least one line of content fits on the page
    const minBlock = headingH + this.lh(FS.body) * 2;
    this.ensureSpace(minBlock);

    this.y += ptToIn(8); // marginTop: 8pt
    this.text(
      title.toUpperCase(),
      PAGE.marginLeft,
      this.y + this.lh(FS.sectionHeading),
      FS.sectionHeading,
      "bold",
    );
    this.y += this.lh(FS.sectionHeading) + ptToIn(2); // paddingBottom: 2pt
    this.hline(1.5);
    this.y += ptToIn(5); // marginBottom: 5pt
  }

  /** Bullet point with wrapped text. */
  private bulletPoint(text: string, indent = 0.19) {
    const bulletX = PAGE.marginLeft + indent - ptToIn(8); // position the bullet marker
    const textX = PAGE.marginLeft + indent;
    const maxW = CONTENT_WIDTH - indent;
    const lines = this.wrapText(text, maxW, FS.body);

    const firstLineH = this.lh(FS.body);
    this.ensureSpace(firstLineH);

    // Draw bullet disc character
    const bulletY = this.y + firstLineH;
    this.text("\u2022", bulletX, bulletY, FS.body);

    // Draw each line of wrapped text
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        this.y += this.lh(FS.body);
        this.ensureSpace(this.lh(FS.body));
      }
      this.text(lines[i], textX, this.y + firstLineH * (i === 0 ? 1 : 0), FS.body);
    }
    // Advance past the text block
    this.y += firstLineH + this.lh(FS.body) * (lines.length - 1) + ptToIn(1); // 1pt marginBottom
  }

  // ── section renderers ──────────────────────────────────────────────

  private renderHeader(h: ResumeJSON["header"]) {
    const centerX = PAGE.width / 2;

    // Name
    const nameH = this.lh(FS.name);
    this.text(h.name || "Your Name", centerX, this.y + nameH, FS.name, "bold", "center");
    this.y += nameH;

    // Title
    if (h.title) {
      const titleH = this.lh(FS.title);
      this.y += ptToIn(2); // margin
      this.text(h.title, centerX, this.y + titleH, FS.title, "bold", "center");
      this.y += titleH;
    }

    // Contact line
    const parts: string[] = [];
    if (h.location) parts.push(h.location);
    if (h.email) parts.push(h.email);
    if (h.phone) parts.push(h.phone);
    if (h.linkedin) parts.push("LinkedIn");

    if (parts.length > 0) {
      const contactStr = parts.join("  |  ");
      const contactH = this.lh(FS.contact);
      this.y += ptToIn(3);
      this.text(contactStr, centerX, this.y + contactH, FS.contact, "normal", "center");
      this.y += contactH;
    }

    // Bottom border
    this.y += ptToIn(5); // paddingBottom: 5pt
    this.hline(2);
    this.y += ptToIn(4); // marginBottom: 4pt
  }

  private renderSummary(summary: string) {
    this.sectionHeading("Summary");
    const lines = this.wrapText(summary, CONTENT_WIDTH, FS.body);
    for (let i = 0; i < lines.length; i++) {
      const lineH = this.lh(FS.body);
      this.ensureSpace(lineH);
      this.text(lines[i], PAGE.marginLeft, this.y + lineH, FS.body);
      this.y += lineH;
    }
    this.y += ptToIn(4); // section marginBottom
  }

  private renderExperience(experience: ResumeJSON["experience"]) {
    const valid = experience.filter((e) => e.company_or_client);
    if (valid.length === 0) return;

    this.sectionHeading("Professional Experience");

    valid.forEach((exp, idx) => {
      // Role — dates
      const dateStr = `${exp.start_date || "Start"} \u2014 ${exp.end_date || "Present"}`;
      this.flexRow(exp.role || "Role", dateStr, FS.body, "bold", FS.small);

      // Company — location
      this.flexRow(exp.company_or_client, exp.location || "", FS.body, "italic", FS.small);

      // Bullets
      exp.bullets.forEach((b) => this.bulletPoint(b));

      // Spacing between entries
      if (idx < valid.length - 1) this.y += ptToIn(4);
    });

    this.y += ptToIn(4);
  }

  private renderEducation(education: ResumeJSON["education"]) {
    const valid = education.filter((e) => e.institution);
    if (valid.length === 0) return;

    this.sectionHeading("Education");

    valid.forEach((edu) => {
      const degreeText =
        edu.degree && edu.field
          ? `${edu.degree}, ${edu.field}`
          : edu.degree || edu.field || "Degree";

      let leftText = degreeText;
      if (edu.institution) leftText += `, ${edu.institution}`;
      if (edu.gpa) leftText += ` (GPA: ${edu.gpa})`;

      this.flexRow(leftText, edu.graduation_date || "", FS.body, "bold", FS.small);

      if (edu.location) {
        const locH = this.lh(FS.small);
        this.ensureSpace(locH);
        this.text(edu.location, PAGE.width - PAGE.marginRight, this.y + locH, FS.small, "normal", "right");
        this.y += locH;
      }

      this.y += ptToIn(3);
    });

    this.y += ptToIn(2);
  }

  private renderSkills(skills: ResumeJSON["skills"]) {
    const categories = Object.entries(skills)
      .filter(([_, s]) => s.length > 0)
      .map(([key, s]) => ({
        label:
          getSkillCategoryLabel(key),
        skills: s,
      }));
    if (categories.length === 0) return;

    this.sectionHeading("Technical Skills");

    categories.forEach((cat) => {
      const prefix = `${cat.label}: `;
      const prefixW = this.textWidth(prefix, FS.body, "bold");

      // Build the skills text and wrap it
      const skillsText = cat.skills.join(", ");
      const fullText = prefix + skillsText;
      const lines = this.wrapText(fullText, CONTENT_WIDTH, FS.body);

      for (let i = 0; i < lines.length; i++) {
        const lineH = this.lh(FS.body);
        this.ensureSpace(lineH);
        const ly = this.y + lineH;

        if (i === 0) {
          // First line: bold prefix + normal skills text
          this.text(prefix, PAGE.marginLeft, ly, FS.body, "bold");
          // The rest of the first line after the prefix
          const afterPrefix = lines[0].substring(prefix.length);
          if (afterPrefix) {
            this.text(afterPrefix, PAGE.marginLeft + prefixW, ly, FS.body);
          }
        } else {
          this.text(lines[i], PAGE.marginLeft, ly, FS.body);
        }
        this.y += lineH;
      }
      this.y += ptToIn(1);
    });

    this.y += ptToIn(3);
  }

  private renderCertifications(certs: ResumeJSON["certifications"]) {
    const valid = certs.filter((c) => c.name);
    if (valid.length === 0) return;

    this.sectionHeading("Certifications");

    valid.forEach((cert) => {
      let leftText = cert.name;
      if (cert.issuer) leftText += `, ${cert.issuer}`;
      this.flexRow(leftText, cert.date || "", FS.body, "bold", FS.small);
      this.y += ptToIn(2);
    });

    this.y += ptToIn(2);
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

      this.flexRow(proj.title, rightText, FS.body, "bold", FS.small, "italic");

      proj.bullets.forEach((b) => this.bulletPoint(b));

      if (idx < valid.length - 1) this.y += ptToIn(3);
    });

    this.y += ptToIn(4);
  }

  private renderLanguages(languages?: ResumeJSON["languages"]) {
    const valid = (languages || []).filter((l) => l.language);
    if (valid.length === 0) return;

    this.sectionHeading("Languages");

    const parts = valid.map(
      (l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`,
    );
    const text = parts.join("  |  ");
    const lines = this.wrapText(text, CONTENT_WIDTH, FS.body);
    for (const line of lines) {
      const lineH = this.lh(FS.body);
      this.ensureSpace(lineH);
      this.text(line, PAGE.marginLeft, this.y + lineH, FS.body);
      this.y += lineH;
    }
    this.y += ptToIn(4);
  }

  private renderVolunteer(volunteer?: ResumeJSON["volunteer"]) {
    const valid = (volunteer || []).filter((v) => v.organization);
    if (valid.length === 0) return;

    this.sectionHeading("Volunteer Experience");

    valid.forEach((vol, idx) => {
      this.flexRow(vol.role || "Volunteer", vol.date || "", FS.body, "bold", FS.small);

      // Organization
      const orgH = this.lh(FS.body);
      this.ensureSpace(orgH);
      this.text(vol.organization, PAGE.marginLeft, this.y + orgH, FS.body, "italic");
      this.y += orgH;

      vol.bullets.forEach((b) => this.bulletPoint(b));

      if (idx < valid.length - 1) this.y += ptToIn(3);
    });

    this.y += ptToIn(4);
  }

  private renderAwards(awards?: ResumeJSON["awards"]) {
    const valid = (awards || []).filter((a) => a.title);
    if (valid.length === 0) return;

    this.sectionHeading("Awards & Publications");

    valid.forEach((award) => {
      let leftText = award.title;
      if (award.issuer) leftText += `, ${award.issuer}`;
      this.flexRow(leftText, award.date || "", FS.body, "bold", FS.small);
      this.y += ptToIn(2);
    });

    this.y += ptToIn(2);
  }

  private renderCustomSections(sections?: ResumeJSON["customSections"]) {
    const valid = (sections || []).filter((cs) =>
      cs.entries.some((e) => e.title),
    );
    if (valid.length === 0) return;

    valid.forEach((cs) => {
      this.sectionHeading(cs.name);

      cs.entries
        .filter((e) => e.title)
        .forEach((entry, idx) => {
          this.flexRow(entry.title, entry.date || "", FS.body, "bold", FS.small);

          if (entry.subtitle) {
            const subH = this.lh(FS.body);
            this.ensureSpace(subH);
            this.text(entry.subtitle, PAGE.marginLeft, this.y + subH, FS.body, "italic");
            this.y += subH;
          }

          entry.bullets.forEach((b) => this.bulletPoint(b));

          if (idx < cs.entries.filter((e) => e.title).length - 1) {
            this.y += ptToIn(3);
          }
        });

      this.y += ptToIn(4);
    });
  }

  // ── public API ─────────────────────────────────────────────────────

  public async render(data: ResumeJSON): Promise<import("jspdf").jsPDF> {
    const { jsPDF } = await import("jspdf");
    this.doc = new jsPDF({
      unit: "in",
      format: "letter",
      orientation: "portrait",
    });

    // Start at top margin
    this.y = PAGE.marginTop;

    // Set default text color
    this.doc.setTextColor(0, 0, 0);

    // Render all sections in the same order as ResumeTemplate.tsx
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

    return this.doc;
  }
}

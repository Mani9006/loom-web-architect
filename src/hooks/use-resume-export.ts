import { useCallback, useState } from "react";
import { ResumeJSON, SKILL_CATEGORY_LABELS } from "@/types/resume";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════
// PDF Resume Renderer — jsPDF data-driven text rendering
// Produces real, selectable, ATS-parseable text (not canvas images).
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

const FS = {
  name: 18,
  title: 11,
  contact: 9.5,
  sectionHeading: 11,
  body: 10,
  small: 9.5,
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

  private text(str: string, x: number, y: number, size: number, style: FontStyle = "normal", align: "left" | "center" | "right" = "left") {
    this.setFont(size, style);
    this.doc.text(str, x, y, { align });
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
    const headingH = ptToIn(8) + this.lh(FS.sectionHeading) + ptToIn(2) + ptToIn(1.5);
    const minBlock = headingH + this.lh(FS.body) * 2;
    this.ensureSpace(minBlock);

    this.y += ptToIn(8);
    this.text(title.toUpperCase(), PAGE.marginLeft, this.y + this.lh(FS.sectionHeading), FS.sectionHeading, "bold");
    this.y += this.lh(FS.sectionHeading) + ptToIn(2);
    this.hline(1.5);
    this.y += ptToIn(5);
  }

  private bulletPoint(text: string, indent = 0.19) {
    const bulletX = PAGE.marginLeft + indent - ptToIn(8);
    const textX = PAGE.marginLeft + indent;
    const maxW = CONTENT_WIDTH - indent;
    const lines = this.wrapText(text, maxW, FS.body);
    const lineH = this.lh(FS.body);

    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(lineH);
      const drawY = this.y + lineH;

      // Draw bullet marker on the first line only
      if (i === 0) {
        this.text("\u2022", bulletX, drawY, FS.body);
      }

      this.text(lines[i], textX, drawY, FS.body);
      this.y = drawY;
    }
    this.y += ptToIn(1); // 1pt spacing after bullet
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
    if (h.linkedin) parts.push("LinkedIn");

    if (parts.length > 0) {
      const contactH = this.lh(FS.contact);
      this.y += ptToIn(3);
      this.text(parts.join("  |  "), cx, this.y + contactH, FS.contact, "normal", "center");
      this.y += contactH;
    }

    this.y += ptToIn(5);
    this.hline(2);
    this.y += ptToIn(4);
  }

  private renderSummary(summary: string) {
    this.sectionHeading("Summary");
    const lines = this.wrapText(summary, CONTENT_WIDTH, FS.body);
    const lineH = this.lh(FS.body);
    for (const line of lines) {
      this.ensureSpace(lineH);
      const drawY = this.y + lineH;
      this.text(line, PAGE.marginLeft, drawY, FS.body);
      this.y = drawY;
    }
    this.y += ptToIn(4);
  }

  private renderExperience(experience: ResumeJSON["experience"]) {
    const valid = experience.filter((e) => e.company_or_client);
    if (valid.length === 0) return;
    this.sectionHeading("Professional Experience");
    valid.forEach((exp, idx) => {
      this.flexRow(exp.role || "Role", `${exp.start_date || "Start"} \u2014 ${exp.end_date || "Present"}`, FS.body, "bold", FS.small);
      this.flexRow(exp.company_or_client, exp.location || "", FS.body, "italic", FS.small);
      exp.bullets.forEach((b) => this.bulletPoint(b));
      if (idx < valid.length - 1) this.y += ptToIn(4);
    });
    this.y += ptToIn(4);
  }

  private renderEducation(education: ResumeJSON["education"]) {
    const valid = education.filter((e) => e.institution);
    if (valid.length === 0) return;
    this.sectionHeading("Education");
    valid.forEach((edu) => {
      const deg = edu.degree && edu.field ? `${edu.degree}, ${edu.field}` : edu.degree || edu.field || "Degree";
      let left = deg;
      if (edu.institution) left += `, ${edu.institution}`;
      if (edu.gpa) left += ` (GPA: ${edu.gpa})`;
      this.flexRow(left, edu.graduation_date || "", FS.body, "bold", FS.small);
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
      this.y += ptToIn(1);
    });
    this.y += ptToIn(3);
  }

  private renderCertifications(certs: ResumeJSON["certifications"]) {
    const valid = certs.filter((c) => c.name);
    if (valid.length === 0) return;
    this.sectionHeading("Certifications");
    valid.forEach((cert) => {
      let left = cert.name;
      if (cert.issuer) left += `, ${cert.issuer}`;
      this.flexRow(left, cert.date || "", FS.body, "bold", FS.small);
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
      this.flexRow(proj.title, rightParts.join(" \u2014 "), FS.body, "bold", FS.small, "italic");
      proj.bullets.forEach((b) => this.bulletPoint(b));
      if (idx < valid.length - 1) this.y += ptToIn(3);
    });
    this.y += ptToIn(4);
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
    this.y += ptToIn(4);
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
      if (idx < valid.length - 1) this.y += ptToIn(3);
    });
    this.y += ptToIn(4);
  }

  private renderAwards(awards?: ResumeJSON["awards"]) {
    const valid = (awards || []).filter((a) => a.title);
    if (valid.length === 0) return;
    this.sectionHeading("Awards & Publications");
    valid.forEach((award) => {
      let left = award.title;
      if (award.issuer) left += `, ${award.issuer}`;
      this.flexRow(left, award.date || "", FS.body, "bold", FS.small);
      this.y += ptToIn(2);
    });
    this.y += ptToIn(2);
  }

  private renderCustomSections(sections?: ResumeJSON["customSections"]) {
    const valid = (sections || []).filter((cs) => cs.entries.some((e) => e.title));
    if (valid.length === 0) return;
    valid.forEach((cs) => {
      this.sectionHeading(cs.name);
      const entries = cs.entries.filter((e) => e.title);
      entries.forEach((entry, idx) => {
        this.flexRow(entry.title, entry.date || "", FS.body, "bold", FS.small);
        if (entry.subtitle) {
          const subH = this.lh(FS.body);
          this.ensureSpace(subH);
          this.text(entry.subtitle, PAGE.marginLeft, this.y + subH, FS.body, "italic");
          this.y += subH;
        }
        entry.bullets.forEach((b) => this.bulletPoint(b));
        if (idx < entries.length - 1) this.y += ptToIn(3);
      });
      this.y += ptToIn(4);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────

  public async render(data: ResumeJSON): Promise<JsPDFInstance> {
    const { jsPDF } = await import("jspdf");
    this.doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
    this.y = PAGE.marginTop;
    this.doc.setTextColor(0, 0, 0);

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
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = await import("docx");
      const { saveAs } = await import("file-saver");

      const children: any[] = [];

      // Header - Name
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: data.header.name || "Your Name",
              bold: true,
              size: 38, // 19pt
              font: "Georgia",
            }),
          ],
        })
      );

      // Title
      if (data.header.title) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [
              new TextRun({
                text: data.header.title,
                bold: true,
                size: 23, // 11.5pt
                font: "Georgia",
              }),
            ],
          })
        );
      }

      // Contact info
      const contactParts: string[] = [];
      if (data.header.location) contactParts.push(data.header.location);
      if (data.header.email) contactParts.push(data.header.email);
      if (data.header.phone) contactParts.push(data.header.phone);
      if (data.header.linkedin) contactParts.push(data.header.linkedin);

      if (contactParts.length > 0) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: contactParts.join(" | "),
                size: 20,
                font: "Georgia",
              }),
            ],
          })
        );
      }

      // Summary Section
      if (data.summary) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: "SUMMARY",
                bold: true,
                size: 22,
                font: "Georgia",
              }),
            ],
          })
        );
        children.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: data.summary,
                size: 20,
                font: "Georgia",
              }),
            ],
          })
        );
      }

      // Experience Section
      const validExperience = data.experience.filter(e => e.company_or_client);
      if (validExperience.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: "EXPERIENCE",
                bold: true,
                size: 22,
                font: "Georgia",
              }),
            ],
          })
        );

        validExperience.forEach((exp) => {
          children.push(
            new Paragraph({
              spacing: { before: 150 },
              children: [
                new TextRun({
                  text: exp.role || "Role",
                  bold: true,
                  size: 20,
                  font: "Georgia",
                }),
                new TextRun({
                  text: `\t${exp.start_date || "Start"} -- ${exp.end_date || "End"}`,
                  size: 20,
                  font: "Georgia",
                }),
              ],
            })
          );

          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: exp.company_or_client,
                  italics: true,
                  size: 20,
                  font: "Georgia",
                }),
                exp.location ? new TextRun({
                  text: `\t${exp.location}`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
              ],
            })
          );

          exp.bullets.forEach((bullet) => {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 50 },
                children: [
                  new TextRun({
                    text: bullet,
                    size: 20,
                    font: "Georgia",
                  }),
                ],
              })
            );
          });
        });
      }

      // Education Section
      const validEducation = data.education.filter(e => e.institution);
      if (validEducation.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: "EDUCATION",
                bold: true,
                size: 22,
                font: "Georgia",
              }),
            ],
          })
        );

        validEducation.forEach((edu) => {
          const degreeText = edu.degree && edu.field
            ? `${edu.degree} in ${edu.field}`
            : edu.degree || edu.field || "Degree";

          children.push(
            new Paragraph({
              spacing: { before: 100 },
              children: [
                new TextRun({
                  text: degreeText,
                  bold: true,
                  size: 20,
                  font: "Georgia",
                }),
                edu.institution ? new TextRun({
                  text: `, ${edu.institution}`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
                edu.gpa ? new TextRun({
                  text: ` (GPA: ${edu.gpa})`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
                new TextRun({
                  text: `\t${edu.graduation_date || ""}`,
                  size: 20,
                  font: "Georgia",
                }),
              ],
            })
          );
        });
      }

      // Certifications Section
      const validCerts = data.certifications.filter(c => c.name);
      if (validCerts.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: "CERTIFICATIONS",
                bold: true,
                size: 22,
                font: "Georgia",
              }),
            ],
          })
        );

        validCerts.forEach((cert) => {
          children.push(
            new Paragraph({
              spacing: { before: 50 },
              children: [
                new TextRun({
                  text: cert.name,
                  bold: true,
                  size: 20,
                  font: "Georgia",
                }),
                cert.issuer ? new TextRun({
                  text: `, ${cert.issuer}`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
                new TextRun({
                  text: `\t${cert.date || ""}`,
                  size: 20,
                  font: "Georgia",
                }),
              ],
            })
          );
        });
      }

      // Skills Section
      const skillCategories = Object.entries(data.skills)
        .filter(([_, skills]) => skills.length > 0)
        .map(([key, skills]) => ({
          category: SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          skills,
        }));

      if (skillCategories.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: "SKILLS",
                bold: true,
                size: 22,
                font: "Georgia",
              }),
            ],
          })
        );

        skillCategories.forEach((sc) => {
          children.push(
            new Paragraph({
              spacing: { before: 50 },
              children: [
                new TextRun({
                  text: `${sc.category}: `,
                  bold: true,
                  size: 20,
                  font: "Georgia",
                }),
                new TextRun({
                  text: sc.skills.join(", "),
                  size: 20,
                  font: "Georgia",
                }),
              ],
            })
          );
        });
      }

      // Projects Section
      const validProjects = data.projects?.filter(p => p.title) || [];
      if (validProjects.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
            },
            children: [
              new TextRun({
                text: "PROJECTS",
                bold: true,
                size: 22,
                font: "Georgia",
              }),
            ],
          })
        );

        validProjects.forEach((project) => {
          children.push(
            new Paragraph({
              spacing: { before: 100 },
              children: [
                new TextRun({
                  text: project.title,
                  bold: true,
                  size: 20,
                  font: "Georgia",
                }),
                project.date ? new TextRun({
                  text: `\t${project.organization ? `${project.organization} — ` : ""}${project.date}`,
                  italics: true,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
              ],
            })
          );

          project.bullets.forEach((bullet) => {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 50 },
                children: [
                  new TextRun({
                    text: bullet,
                    size: 20,
                    font: "Georgia",
                  }),
                ],
              })
            );
          });
        });
      }

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 720, // 0.5 inch
                right: 1080, // 0.75 inch
                bottom: 720,
                left: 1080,
              },
            },
          },
          children,
        }],
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

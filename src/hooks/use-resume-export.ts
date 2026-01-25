import { useCallback, useState } from "react";
import { ResumeData } from "@/types/resume";
import { toast } from "sonner";

export function useResumeExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = useCallback(async (resumeElement: HTMLElement, fileName: string) => {
    setIsExporting(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      
      const opt = {
        margin: 0,
        filename: `${fileName}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
        },
        jsPDF: { 
          unit: "in" as const, 
          format: "letter" as const, 
          orientation: "portrait" as const,
        },
      };

      await html2pdf().set(opt).from(resumeElement).save();
      toast.success("Resume exported as PDF!");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportToWord = useCallback(async (data: ResumeData, fileName: string) => {
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
              text: data.personalInfo.fullName || "Your Name",
              bold: true,
              size: 38, // 19pt
              font: "Georgia",
            }),
          ],
        })
      );

      // Title
      if (data.personalInfo.title || data.targetRole) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [
              new TextRun({
                text: data.personalInfo.title || data.targetRole || "",
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
      if (data.personalInfo.location) contactParts.push(data.personalInfo.location);
      if (data.personalInfo.email) contactParts.push(data.personalInfo.email);
      if (data.personalInfo.phone) contactParts.push(data.personalInfo.phone);
      if (data.personalInfo.linkedin) contactParts.push(data.personalInfo.linkedin);

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
      const validClients = data.clients.filter(c => c.name);
      if (validClients.length > 0) {
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

        validClients.forEach((client) => {
          const selectedProject = client.projects.find(p => p.isSelected);
          
          // Role and dates
          children.push(
            new Paragraph({
              spacing: { before: 150 },
              children: [
                new TextRun({
                  text: client.role || "Role",
                  bold: true,
                  size: 20,
                  font: "Georgia",
                }),
                new TextRun({
                  text: `\t${client.startDate || "Start"} -- ${client.isCurrent ? "Present" : client.endDate || "End"}`,
                  size: 20,
                  font: "Georgia",
                }),
              ],
            })
          );

          // Company and location
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: client.name,
                  italics: true,
                  size: 20,
                  font: "Georgia",
                }),
                client.location ? new TextRun({
                  text: `\t${client.location}`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
              ],
            })
          );

          // Bullets
          const bullets = selectedProject?.bullets || 
            (client.responsibilities ? client.responsibilities.split('\n').filter(Boolean).map(line => line.replace(/^[-•]\s*/, '')) : []);
          
          bullets.forEach((bullet) => {
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
      const validEducation = data.education.filter(e => e.school);
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
                edu.school ? new TextRun({
                  text: `, ${edu.school}`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
                edu.gpa ? new TextRun({
                  text: ` (GPA: ${edu.gpa})`,
                  size: 20,
                  font: "Georgia",
                }) : new TextRun({ text: "" }),
                new TextRun({
                  text: `\t${edu.graduationDate || ""}`,
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
      const validSkills = data.skillCategories.filter(sc => sc.skills.length > 0);
      if (validSkills.length > 0) {
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

        validSkills.forEach((sc) => {
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
      const validProjects = data.projects?.filter(p => p.name) || [];
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
                  text: project.name,
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

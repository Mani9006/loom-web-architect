import { useRef } from "react";
import { ResumeJSON, getSkillCategoryLabel, DEFAULT_SECTION_ORDER } from "@/types/resume";
import { Loader2, FileDown, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResumeExport } from "@/hooks/use-resume-export";

interface ResumePreviewProps {
  data: ResumeJSON;
  isGenerating?: boolean;
}

export function ResumePreview({ data, isGenerating }: ResumePreviewProps) {
  const resumeRef = useRef<HTMLDivElement>(null);
  const { exportToPDF, exportToWord, isExporting } = useResumeExport();

  // Check if we have substantial content (for multi-page indication)
  const hasSubstantialContent = 
    data.experience.filter(e => e.company_or_client).length >= 2 ||
    (data.experience.filter(e => e.company_or_client).length >= 1 && Object.values(data.skills).some(s => s.length > 0));

  const fileName = data.header.name 
    ? `${data.header.name.replace(/\s+/g, '_')}_Resume`
    : "Resume";

  const handleExportPDF = () => {
    exportToPDF(data, fileName);
  };

  const handleExportWord = () => {
    exportToWord(data, fileName);
  };

  const handlePrintView = () => {
    // Store resume data in localStorage for the print page to access
    localStorage.setItem("printResumeData", JSON.stringify(data));
    // Open print view in new tab
    window.open("/print-resume", "_blank");
  };

  // Get non-empty skill categories
  const skillCategories = Object.entries(data.skills)
    .filter(([_, skills]) => skills.length > 0)
    .map(([key, skills]) => ({
      category: getSkillCategoryLabel(key),
      skills,
    }));

  return (
    <div className="h-full overflow-auto p-4 bg-muted/30">
      {/* Export Buttons */}
      <div className="flex justify-center gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          disabled={isExporting || isGenerating}
          className="gap-2"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Export PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportWord}
          disabled={isExporting || isGenerating}
          className="gap-2"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Export Word
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrintView}
          disabled={isGenerating}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Print View
        </Button>
      </div>

      {/* Resume Document */}
      <div 
        ref={resumeRef}
        className="bg-white text-black shadow-xl mx-auto relative mb-8"
        style={{ 
          width: "8.5in",
          minHeight: "11in",
          padding: "1.8cm 2cm 2cm 2cm",
          fontFamily: "'Charter', 'Georgia', serif",
          fontSize: "10pt",
          lineHeight: "1.4",
        }}
      >
        {/* Header - Centered */}
        <header className="text-center pb-3 border-b border-black mb-4">
          <h1 
            className="font-bold tracking-wide"
            style={{ fontSize: "19pt" }}
          >
            {data.header.name || "Your Name"}
          </h1>
          
          {data.header.title && (
            <p className="mt-1 font-bold" style={{ fontSize: "11.5pt" }}>
              {data.header.title}
            </p>
          )}
          
          <div className="flex flex-wrap justify-center items-center gap-x-2 mt-2 text-sm">
            {data.header.location && (
              <>
                <span>📍 {data.header.location}</span>
                <span className="text-muted-foreground">|</span>
              </>
            )}
            {data.header.email && (
              <>
                <a href={`mailto:${data.header.email}`} className="text-black hover:underline">
                  ✉️ {data.header.email}
                </a>
                <span className="text-muted-foreground">|</span>
              </>
            )}
            {data.header.phone && (
              <>
                <span>📞 {data.header.phone}</span>
                {data.header.linkedin && <span className="text-muted-foreground">|</span>}
              </>
            )}
            {data.header.linkedin && (
              <a 
                href={data.header.linkedin.startsWith("http") ? data.header.linkedin : `https://${data.header.linkedin}`}
                className="text-black hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                🔗 LinkedIn
              </a>
            )}
          </div>
        </header>

        {/* Dynamic section rendering based on section_order */}
        {(data.section_order || DEFAULT_SECTION_ORDER).map((sectionId) => {
          switch (sectionId) {
            case "summary":
              return data.summary ? (
                <section key="summary" className="mb-4">
                  <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">SUMMARY</h2>
                  <p className="text-justify leading-relaxed" style={{ fontSize: "10pt" }}>{data.summary}</p>
                </section>
              ) : null;

            case "experience":
              return data.experience.length > 0 && data.experience.some(e => e.company_or_client) ? (
                <section key="experience" className="mb-4">
                  <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-3">EXPERIENCE</h2>
                  <div className="space-y-5">
                    {data.experience.filter(e => e.company_or_client).map((exp) => (
                      <div key={exp.id}>
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold" style={{ fontSize: "10pt" }}>{exp.role || "Role"}</span>
                          <span className="text-sm">{exp.start_date || "Start"} -- {exp.end_date || "End"}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="italic" style={{ fontSize: "10pt" }}>{exp.company_or_client}</span>
                          {exp.location && <span className="text-sm">{exp.location}</span>}
                        </div>
                        {exp.bullets.length > 0 && (
                          <ul className="mt-2 ml-6 space-y-1 list-disc" style={{ fontSize: "10pt" }}>
                            {exp.bullets.map((bullet, idx) => (<li key={idx} className="pl-1">{bullet}</li>))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null;

            case "education":
              return data.education.length > 0 && data.education.some(e => e.institution) ? (
                <section key="education" className="mb-4">
                  <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">EDUCATION</h2>
                  <div className="space-y-2">
                    {data.education.filter(e => e.institution).map((edu) => (
                      <div key={edu.id}>
                        <div className="flex justify-between items-baseline">
                          <span style={{ fontSize: "10pt" }}>
                            <span className="font-bold">{edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree"}</span>
                            {edu.institution && <span>, {edu.institution}</span>}
                            {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                          </span>
                          <span className="text-sm">{edu.graduation_date}</span>
                        </div>
                        {edu.location && <div className="text-right text-sm">{edu.location}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null;

            case "certifications":
              return data.certifications.length > 0 && data.certifications.some(c => c.name) ? (
                <section key="certifications" className="mb-4">
                  <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">CERTIFICATIONS</h2>
                  <table className="w-full" style={{ fontSize: "10pt" }}>
                    <tbody>
                      {data.certifications.filter(c => c.name).map((cert) => (
                        <tr key={cert.id}>
                          <td className="py-0.5"><span className="text-primary font-bold">{cert.name}</span>{cert.issuer && <span>, {cert.issuer}</span>}</td>
                          <td className="text-right py-0.5">{cert.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null;

            case "skills":
              return skillCategories.length > 0 ? (
                <section key="skills" className="mb-4">
                  <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">SKILLS</h2>
                  <div className="space-y-1" style={{ fontSize: "10pt" }}>
                    {skillCategories.map((sc, idx) => (
                      <p key={idx}><span className="font-bold">{sc.category}:</span> <span>{sc.skills.join(", ")}</span></p>
                    ))}
                  </div>
                </section>
              ) : null;

            case "projects":
              return data.projects && data.projects.length > 0 && data.projects.some(p => p.title) ? (
                <section key="projects" className="mb-4">
                  <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-3">PROJECTS</h2>
                  <div className="space-y-3">
                    {data.projects.filter(p => p.title).map((project) => (
                      <div key={project.id}>
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold" style={{ fontSize: "10pt" }}>{project.title}</span>
                          {project.date && <span className="italic text-sm">{project.organization && `${project.organization} — `}{project.date}</span>}
                        </div>
                        {project.bullets.length > 0 && (
                          <ul className="mt-1 ml-6 space-y-1 list-disc" style={{ fontSize: "10pt" }}>
                            {project.bullets.map((bullet, idx) => (<li key={idx} className="pl-1">{bullet}</li>))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null;

            default:
              return null;
          }
        })}

        {/* Generating Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Generating content...</span>
            </div>
          </div>
        )}
      </div>

      {/* Page indicator */}
      {hasSubstantialContent && (
        <div className="text-center text-xs text-muted-foreground pb-4">
          ↑ Scroll up to see full resume
        </div>
      )}
    </div>
  );
}

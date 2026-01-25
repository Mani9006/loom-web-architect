import { useRef } from "react";
import { ResumeData } from "@/types/resume";
import { Loader2, FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResumeExport } from "@/hooks/use-resume-export";

interface ResumePreviewProps {
  data: ResumeData;
  isGenerating?: boolean;
}

export function ResumePreview({ data, isGenerating }: ResumePreviewProps) {
  const resumeRef = useRef<HTMLDivElement>(null);
  const { exportToPDF, exportToWord, isExporting } = useResumeExport();

  // Check if we have substantial content (for multi-page indication)
  const hasSubstantialContent = 
    data.clients.filter(c => c.name).length >= 2 ||
    (data.clients.filter(c => c.name).length >= 1 && data.skillCategories.length >= 3);

  const fileName = data.personalInfo.fullName 
    ? `${data.personalInfo.fullName.replace(/\s+/g, '_')}_Resume`
    : "Resume";

  const handleExportPDF = () => {
    if (resumeRef.current) {
      exportToPDF(resumeRef.current, fileName);
    }
  };

  const handleExportWord = () => {
    exportToWord(data, fileName);
  };

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
            {data.personalInfo.fullName || "Your Name"}
          </h1>
          
          {(data.personalInfo.title || data.targetRole) && (
            <p className="mt-1 font-bold" style={{ fontSize: "11.5pt" }}>
              {data.personalInfo.title || data.targetRole}
            </p>
          )}
          
          <div className="flex flex-wrap justify-center items-center gap-x-2 mt-2 text-sm">
            {data.personalInfo.location && (
              <>
                <span>📍 {data.personalInfo.location}</span>
                <span className="text-muted-foreground">|</span>
              </>
            )}
            {data.personalInfo.email && (
              <>
                <a href={`mailto:${data.personalInfo.email}`} className="text-black hover:underline">
                  ✉️ {data.personalInfo.email}
                </a>
                <span className="text-muted-foreground">|</span>
              </>
            )}
            {data.personalInfo.phone && (
              <>
                <span>📞 {data.personalInfo.phone}</span>
                {data.personalInfo.linkedin && <span className="text-muted-foreground">|</span>}
              </>
            )}
            {data.personalInfo.linkedin && (
              <a 
                href={data.personalInfo.linkedin.startsWith("http") ? data.personalInfo.linkedin : `https://${data.personalInfo.linkedin}`}
                className="text-black hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                🔗 LinkedIn
              </a>
            )}
          </div>
        </header>

        {/* Summary Section */}
        {data.summary && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              SUMMARY
            </h2>
            <p className="text-justify leading-relaxed" style={{ fontSize: "10pt" }}>
              {data.summary}
            </p>
          </section>
        )}

        {/* Experience Section */}
        {data.clients.length > 0 && data.clients.some(c => c.name) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-3">
              EXPERIENCE
            </h2>
            <div className="space-y-5">
              {data.clients.filter(c => c.name).map((client) => {
                const selectedProject = client.projects.find(p => p.isSelected);
                return (
                  <div key={client.id}>
                    {/* Role and Dates on same line */}
                    <div className="flex justify-between items-baseline">
                      <span className="font-bold" style={{ fontSize: "10pt" }}>
                        {client.role || "Role"}
                      </span>
                      <span className="text-sm">
                        {client.startDate || "Start"} -- {client.isCurrent ? "Present" : client.endDate || "End"}
                      </span>
                    </div>
                    
                    {/* Company and Location */}
                    <div className="flex justify-between items-baseline">
                      <span className="italic" style={{ fontSize: "10pt" }}>
                        {client.name}
                      </span>
                      {client.location && (
                        <span className="text-sm">{client.location}</span>
                      )}
                    </div>
                    
                    {/* Bullet Points */}
                    {selectedProject && selectedProject.bullets.length > 0 && (
                      <ul className="mt-2 ml-6 space-y-1 list-disc" style={{ fontSize: "10pt" }}>
                        {selectedProject.bullets.map((bullet, idx) => (
                          <li key={idx} className="pl-1">{bullet}</li>
                        ))}
                      </ul>
                    )}
                    {!selectedProject && client.responsibilities && (
                      <ul className="mt-2 ml-6 space-y-1 list-disc" style={{ fontSize: "10pt" }}>
                        {client.responsibilities.split('\n').filter(Boolean).map((line, idx) => (
                          <li key={idx} className="pl-1">{line.replace(/^[-•]\s*/, '')}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Education Section */}
        {data.education.length > 0 && data.education.some(e => e.school) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              EDUCATION
            </h2>
            <div className="space-y-2">
              {data.education.filter(e => e.school).map((edu) => (
                <div key={edu.id}>
                  <div className="flex justify-between items-baseline">
                    <span style={{ fontSize: "10pt" }}>
                      <span className="font-bold">
                        {edu.degree && edu.field 
                          ? `${edu.degree} in ${edu.field}` 
                          : edu.degree || edu.field || "Degree"}
                      </span>
                      {edu.school && <span>, {edu.school}</span>}
                      {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                    </span>
                    <span className="text-sm">{edu.graduationDate}</span>
                  </div>
                  {edu.location && (
                    <div className="text-right text-sm">{edu.location}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Certifications Section */}
        {data.certifications.length > 0 && data.certifications.some(c => c.name) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              CERTIFICATIONS
            </h2>
            <table className="w-full" style={{ fontSize: "10pt" }}>
              <tbody>
                {data.certifications.filter(c => c.name).map((cert) => (
                  <tr key={cert.id}>
                    <td className="py-0.5">
                      {cert.link ? (
                        <a href={cert.link} className="text-primary font-bold hover:underline" target="_blank" rel="noopener noreferrer">
                          {cert.name}
                        </a>
                      ) : (
                        <span className="text-primary font-bold">{cert.name}</span>
                      )}
                      {cert.issuer && <span>, {cert.issuer}</span>}
                    </td>
                    <td className="text-right py-0.5">{cert.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Skills Section */}
        {data.skillCategories.length > 0 && data.skillCategories.some(sc => sc.skills.length > 0) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              SKILLS
            </h2>
            <div className="space-y-1" style={{ fontSize: "10pt" }}>
              {data.skillCategories.filter(sc => sc.skills.length > 0).map((sc, idx) => (
                <p key={idx}>
                  <span className="font-bold">{sc.category}:</span>{" "}
                  <span>{sc.skills.join(", ")}</span>
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Projects Section */}
        {data.projects && data.projects.length > 0 && data.projects.some(p => p.name) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-3">
              PROJECTS
            </h2>
            <div className="space-y-3">
              {data.projects.filter(p => p.name).map((project) => (
                <div key={project.id}>
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold" style={{ fontSize: "10pt" }}>
                      {project.name}
                    </span>
                    {project.date && (
                      <span className="italic text-sm">{project.organization && `${project.organization} — `}{project.date}</span>
                    )}
                  </div>
                  {project.bullets.length > 0 && (
                    <ul className="mt-1 ml-6 space-y-1 list-disc" style={{ fontSize: "10pt" }}>
                      {project.bullets.map((bullet, idx) => (
                        <li key={idx} className="pl-1">{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

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

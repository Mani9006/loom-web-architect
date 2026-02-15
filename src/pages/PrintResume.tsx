import { useEffect, useState } from "react";
import { ResumeJSON, SKILL_CATEGORY_LABELS } from "@/types/resume";

export default function PrintResume() {
  const [data, setData] = useState<ResumeJSON | null>(null);

  useEffect(() => {
    // Get resume data from localStorage (passed from main app)
    const storedData = localStorage.getItem("printResumeData");
    if (storedData) {
      setData(JSON.parse(storedData));
      // Clean up after reading
      localStorage.removeItem("printResumeData");
    }

    // Auto-trigger print dialog after a short delay
    const timer = setTimeout(() => {
      window.print();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading resume...</p>
      </div>
    );
  }

  // Get non-empty skill categories
  const skillCategories = Object.entries(data.skills)
    .filter(([_, skills]) => skills.length > 0)
    .map(([key, skills]) => ({
      category: SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      skills,
    }));

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in 0.6in;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-no-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          h2 {
            page-break-after: avoid;
            break-after: avoid;
          }
        }
        @media screen {
          .print-container {
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.5in 0.6in;
            background: white;
            min-height: 100vh;
          }
        }
      `}</style>

      {/* Print instructions (hidden when printing) */}
      <div className="no-print bg-muted p-4 text-center border-b">
        <p className="text-sm text-muted-foreground">
          Press <kbd className="px-2 py-1 bg-background rounded border">Ctrl+P</kbd> or <kbd className="px-2 py-1 bg-background rounded border">⌘+P</kbd> to print. 
          Close this tab when done.
        </p>
      </div>

      {/* Resume Document */}
      <div
        className="print-container bg-white text-black"
        style={{
          fontFamily: "'Calibri', 'Arial', 'Helvetica Neue', sans-serif",
          fontSize: "10pt",
          lineHeight: "1.3",
        }}
      >
        {/* Header - Centered */}
        <header className="text-center pb-2 border-b-2 border-black mb-2 print-no-break">
          <h1
            className="font-bold tracking-wide"
            style={{ fontSize: "18pt" }}
          >
            {data.header.name || "Your Name"}
          </h1>

          {data.header.title && (
            <p className="font-semibold" style={{ fontSize: "11pt", marginTop: "2pt", color: "#333" }}>
              {data.header.title}
            </p>
          )}

          <div className="flex flex-wrap justify-center items-center mt-1" style={{ gap: "0 10pt", fontSize: "9.5pt" }}>
            {data.header.location && (
              <span>{data.header.location}</span>
            )}
            {data.header.location && (data.header.email || data.header.phone || data.header.linkedin) && (
              <span style={{ color: "#666" }}>|</span>
            )}
            {data.header.email && (
              <span>{data.header.email}</span>
            )}
            {data.header.email && (data.header.phone || data.header.linkedin) && (
              <span style={{ color: "#666" }}>|</span>
            )}
            {data.header.phone && (
              <span>{data.header.phone}</span>
            )}
            {data.header.phone && data.header.linkedin && (
              <span style={{ color: "#666" }}>|</span>
            )}
            {data.header.linkedin && (
              <span>LinkedIn</span>
            )}
          </div>
        </header>

        {/* Summary Section */}
        {data.summary && (
          <section className="mb-4 print-no-break">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              SUMMARY
            </h2>
            <p className="text-justify" style={{ fontSize: "10pt", lineHeight: "1.35" }}>
              {data.summary}
            </p>
          </section>
        )}

        {/* Experience Section */}
        {data.experience.length > 0 && data.experience.some(e => e.company_or_client) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-3">
              PROFESSIONAL EXPERIENCE
            </h2>
            <div className="space-y-4">
              {data.experience.filter(e => e.company_or_client).map((exp) => (
                <div key={exp.id} className="print-no-break">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold" style={{ fontSize: "10pt" }}>
                      {exp.role || "Role"}
                    </span>
                    <span className="text-sm whitespace-nowrap ml-2">
                      {exp.start_date || "Start"} — {exp.end_date || "End"}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="italic" style={{ fontSize: "10pt" }}>
                      {exp.company_or_client}
                    </span>
                    {exp.location && (
                      <span className="text-sm whitespace-nowrap ml-2">{exp.location}</span>
                    )}
                  </div>

                  {exp.bullets.length > 0 && (
                    <ul className="mt-1 ml-5 space-y-0.5 list-disc" style={{ fontSize: "10pt" }}>
                      {exp.bullets.map((bullet, idx) => (
                        <li key={idx} className="pl-1">{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Education Section */}
        {data.education.length > 0 && data.education.some(e => e.institution) && (
          <section className="mb-4 print-no-break">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              EDUCATION
            </h2>
            <div className="space-y-1">
              {data.education.filter(e => e.institution).map((edu) => (
                <div key={edu.id}>
                  <div className="flex justify-between items-baseline">
                    <span style={{ fontSize: "10pt" }}>
                      <span className="font-bold">
                        {edu.degree && edu.field
                          ? `${edu.degree}, ${edu.field}`
                          : edu.degree || edu.field || "Degree"}
                      </span>
                      {edu.institution && <span>, {edu.institution}</span>}
                      {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                    </span>
                    <span className="text-sm whitespace-nowrap ml-2">{edu.graduation_date}</span>
                  </div>
                  {edu.location && (
                    <div className="text-right text-sm">{edu.location}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skills Section */}
        {skillCategories.length > 0 && (
          <section className="mb-4 print-no-break">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              TECHNICAL SKILLS
            </h2>
            <div className="space-y-0.5" style={{ fontSize: "10pt" }}>
              {skillCategories.map((sc, idx) => (
                <p key={idx}>
                  <span className="font-bold">{sc.category}:</span>{" "}
                  <span>{sc.skills.join(", ")}</span>
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Certifications Section */}
        {data.certifications.length > 0 && data.certifications.some(c => c.name) && (
          <section className="mb-4 print-no-break">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              CERTIFICATIONS
            </h2>
            <div style={{ fontSize: "10pt" }}>
              {data.certifications.filter(c => c.name).map((cert) => (
                <div key={cert.id} className="flex justify-between items-baseline" style={{ marginBottom: "2pt" }}>
                  <span>
                    <span className="font-bold">{cert.name}</span>
                    {cert.issuer && <span>, {cert.issuer}</span>}
                  </span>
                  <span className="text-sm whitespace-nowrap ml-2">{cert.date}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects Section */}
        {data.projects && data.projects.length > 0 && data.projects.some(p => p.title) && (
          <section className="mb-4">
            <h2 className="font-bold uppercase tracking-wider text-sm border-b border-black pb-1 mb-2">
              PROJECTS
            </h2>
            <div className="space-y-2">
              {data.projects.filter(p => p.title).map((project) => (
                <div key={project.id} className="print-no-break">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold" style={{ fontSize: "10pt" }}>
                      {project.title}
                    </span>
                    {(project.organization || project.date) && (
                      <span className="italic text-sm whitespace-nowrap ml-2">
                        {project.organization && `${project.organization} — `}{project.date}
                      </span>
                    )}
                  </div>
                  {project.bullets.length > 0 && (
                    <ul className="mt-1 ml-5 space-y-0.5 list-disc" style={{ fontSize: "10pt" }}>
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
      </div>
    </>
  );
}

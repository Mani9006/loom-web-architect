import { forwardRef } from "react";
import { ResumeJSON, SKILL_CATEGORY_LABELS } from "@/types/resume";

interface ResumeTemplateProps {
  data: ResumeJSON;
  className?: string;
}

// ATS-compliant section heading style (consistent across all sections)
const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "11pt",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderBottom: "1.5px solid #000",
  paddingBottom: "2pt",
  marginTop: "8pt",
  marginBottom: "5pt",
  pageBreakAfter: "avoid",
  breakAfter: "avoid",
};

// Prevent page-break inside individual entries (each experience block, project, etc.)
const entryNoBreak: React.CSSProperties = {
  pageBreakInside: "avoid",
  breakInside: "avoid",
};

export const ResumeTemplate = forwardRef<HTMLDivElement, ResumeTemplateProps>(({ data, className }, ref) => {
  const skillCategories = Object.entries(data.skills)
    .filter(([_, skills]) => skills.length > 0)
    .map(([key, skills]) => ({
      category: SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      skills,
    }));

  const validExperience = data.experience.filter((e) => e.company_or_client);
  const validEducation = data.education.filter((e) => e.institution);
  const validCerts = data.certifications.filter((c) => c.name);
  const validProjects = (data.projects || []).filter((p) => p.title);
  const validLanguages = (data.languages || []).filter((l) => l.language);
  const validVolunteer = (data.volunteer || []).filter((v) => v.organization);
  const validAwards = (data.awards || []).filter((a) => a.title);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: "8.5in",
        minHeight: "11in",
        padding: "0.5in 0.6in",
        fontFamily: "'Calibri', 'Arial', 'Helvetica Neue', sans-serif",
        fontSize: "10pt",
        lineHeight: "1.3",
        color: "#000",
        backgroundColor: "#fff",
        boxSizing: "border-box",
      }}
    >
      {/* ===== HEADER ===== */}
      <header
        className="pdf-no-break"
        style={{
          textAlign: "center",
          paddingBottom: "5pt",
          borderBottom: "2px solid #000",
          marginBottom: "4pt",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        <h1 style={{ fontSize: "18pt", fontWeight: 700, letterSpacing: "0.03em", margin: 0 }}>
          {data.header.name || "Your Name"}
        </h1>
        {data.header.title && (
          <p style={{ fontSize: "11pt", fontWeight: 600, margin: "2pt 0 0 0", color: "#333" }}>{data.header.title}</p>
        )}
        {/* Contact info — plain text, no SVG icons for reliable PDF rendering */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "0 10pt",
            marginTop: "3pt",
            fontSize: "9.5pt",
          }}
        >
          {data.header.location && <span>{data.header.location}</span>}
          {data.header.location && (data.header.email || data.header.phone || data.header.linkedin) && (
            <span style={{ color: "#666" }}>|</span>
          )}
          {data.header.email && <span>{data.header.email}</span>}
          {data.header.email && (data.header.phone || data.header.linkedin) && <span style={{ color: "#666" }}>|</span>}
          {data.header.phone && <span>{data.header.phone}</span>}
          {data.header.phone && data.header.linkedin && <span style={{ color: "#666" }}>|</span>}
          {data.header.linkedin && (
            <a
              href={data.header.linkedin.startsWith("http") ? data.header.linkedin : `https://${data.header.linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#000", textDecoration: "none" }}
            >
              LinkedIn
            </a>
          )}
        </div>
      </header>

      {/* ===== SUMMARY ===== */}
      {data.summary && (
        <section
          className="pdf-no-break"
          style={{ marginBottom: "4pt", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2 style={sectionHeadingStyle}>Summary</h2>
          <p style={{ textAlign: "justify", lineHeight: "1.35", margin: 0, fontSize: "10pt" }}>{data.summary}</p>
        </section>
      )}

      {/* ===== EXPERIENCE ===== */}
      {validExperience.length > 0 && (
        <section style={{ marginBottom: "4pt" }}>
          <h2 style={sectionHeadingStyle}>Professional Experience</h2>
          {validExperience.map((exp) => (
            <div key={exp.id} className="pdf-no-break" style={{ ...entryNoBreak, marginBottom: "7pt" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: "10pt" }}>{exp.role}</span>
                <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                  {exp.start_date} — {exp.end_date}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{exp.company_or_client}</span>
                {exp.location && (
                  <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                    {exp.location}
                  </span>
                )}
              </div>
              {exp.bullets.length > 0 && (
                <ul style={{ margin: "2pt 0 0 14pt", padding: 0, listStyleType: "disc" }}>
                  {exp.bullets.map((bullet, idx) => (
                    <li
                      key={idx}
                      style={{ paddingLeft: "2pt", marginBottom: "1pt", fontSize: "10pt", lineHeight: "1.3" }}
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ===== EDUCATION ===== */}
      {validEducation.length > 0 && (
        <section
          className="pdf-no-break"
          style={{ marginBottom: "4pt", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2 style={sectionHeadingStyle}>Education</h2>
          {validEducation.map((edu) => (
            <div key={edu.id} style={{ marginBottom: "3pt" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "10pt" }}>
                  <strong>
                    {edu.degree && edu.field ? `${edu.degree}, ${edu.field}` : edu.degree || edu.field || "Degree"}
                  </strong>
                  {edu.institution && <span>, {edu.institution}</span>}
                  {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                </span>
                <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                  {edu.graduation_date}
                </span>
              </div>
              {edu.location && <div style={{ textAlign: "right", fontSize: "9.5pt" }}>{edu.location}</div>}
            </div>
          ))}
        </section>
      )}

      {/* ===== SKILLS ===== */}
      {skillCategories.length > 0 && (
        <section
          className="pdf-no-break"
          style={{ marginBottom: "4pt", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2 style={sectionHeadingStyle}>Technical Skills</h2>
          {skillCategories.map((sc, idx) => (
            <p key={idx} style={{ margin: "0 0 1pt 0", fontSize: "10pt", lineHeight: "1.3" }}>
              <strong>{sc.category}:</strong> {sc.skills.join(", ")}
            </p>
          ))}
        </section>
      )}

      {/* ===== CERTIFICATIONS ===== */}
      {validCerts.length > 0 && (
        <section
          className="pdf-no-break"
          style={{ marginBottom: "4pt", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2 style={sectionHeadingStyle}>Certifications</h2>
          {validCerts.map((cert) => (
            <div
              key={cert.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2pt" }}
            >
              <span style={{ fontSize: "10pt" }}>
                <strong>{cert.name}</strong>
                {cert.issuer && <span>, {cert.issuer}</span>}
              </span>
              <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                {cert.date}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ===== PROJECTS ===== */}
      {validProjects.length > 0 && (
        <section style={{ marginBottom: "4pt" }}>
          <h2 style={sectionHeadingStyle}>Projects</h2>
          {validProjects.map((project) => (
            <div key={project.id} className="pdf-no-break" style={{ ...entryNoBreak, marginBottom: "5pt" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: "10pt" }}>{project.title}</span>
                {(project.organization || project.date) && (
                  <span
                    style={{
                      fontStyle: "italic",
                      fontSize: "9.5pt",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      marginLeft: "8pt",
                    }}
                  >
                    {project.organization && `${project.organization} — `}
                    {project.date}
                  </span>
                )}
              </div>
              {project.bullets.length > 0 && (
                <ul style={{ margin: "2pt 0 0 14pt", padding: 0, listStyleType: "disc" }}>
                  {project.bullets.map((bullet, idx) => (
                    <li key={idx} style={{ paddingLeft: "2pt", fontSize: "10pt", lineHeight: "1.3" }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ===== LANGUAGES ===== */}
      {validLanguages.length > 0 && (
        <section
          className="pdf-no-break"
          style={{ marginBottom: "4pt", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2 style={sectionHeadingStyle}>Languages</h2>
          <p style={{ margin: 0, fontSize: "10pt" }}>
            {validLanguages.map((l, idx) => (
              <span key={l.id}>
                <strong>{l.language}</strong>
                {l.proficiency && ` (${l.proficiency})`}
                {idx < validLanguages.length - 1 && " | "}
              </span>
            ))}
          </p>
        </section>
      )}

      {/* ===== VOLUNTEER EXPERIENCE ===== */}
      {validVolunteer.length > 0 && (
        <section style={{ marginBottom: "4pt" }}>
          <h2 style={sectionHeadingStyle}>Volunteer Experience</h2>
          {validVolunteer.map((vol) => (
            <div key={vol.id} className="pdf-no-break" style={{ ...entryNoBreak, marginBottom: "5pt" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: "10pt" }}>{vol.role || "Volunteer"}</span>
                {vol.date && (
                  <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                    {vol.date}
                  </span>
                )}
              </div>
              <div>
                <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{vol.organization}</span>
              </div>
              {vol.bullets.length > 0 && (
                <ul style={{ margin: "2pt 0 0 14pt", padding: 0, listStyleType: "disc" }}>
                  {vol.bullets.map((bullet, idx) => (
                    <li key={idx} style={{ paddingLeft: "2pt", fontSize: "10pt", lineHeight: "1.3" }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ===== AWARDS & PUBLICATIONS ===== */}
      {validAwards.length > 0 && (
        <section
          className="pdf-no-break"
          style={{ marginBottom: "4pt", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2 style={sectionHeadingStyle}>Awards & Publications</h2>
          {validAwards.map((award) => (
            <div
              key={award.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2pt" }}
            >
              <span style={{ fontSize: "10pt" }}>
                <strong>{award.title}</strong>
                {award.issuer && <span>, {award.issuer}</span>}
              </span>
              <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                {award.date}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ===== CUSTOM SECTIONS ===== */}
      {(data.customSections || [])
        .filter((cs) => cs.entries.some((e) => e.title))
        .map((cs) => (
          <section key={cs.id} style={{ marginBottom: "4pt" }}>
            <h2 style={sectionHeadingStyle}>{cs.name}</h2>
            {cs.entries
              .filter((e) => e.title)
              .map((entry) => (
                <div key={entry.id} className="pdf-no-break" style={{ ...entryNoBreak, marginBottom: "5pt" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: "10pt" }}>{entry.title}</span>
                    {entry.date && (
                      <span style={{ fontSize: "9.5pt", flexShrink: 0, whiteSpace: "nowrap", marginLeft: "8pt" }}>
                        {entry.date}
                      </span>
                    )}
                  </div>
                  {entry.subtitle && (
                    <div>
                      <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{entry.subtitle}</span>
                    </div>
                  )}
                  {entry.bullets.length > 0 && (
                    <ul style={{ margin: "2pt 0 0 14pt", padding: 0, listStyleType: "disc" }}>
                      {entry.bullets.map((bullet, idx) => (
                        <li key={idx} style={{ paddingLeft: "2pt", fontSize: "10pt", lineHeight: "1.3" }}>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </section>
        ))}
    </div>
  );
});

ResumeTemplate.displayName = "ResumeTemplate";

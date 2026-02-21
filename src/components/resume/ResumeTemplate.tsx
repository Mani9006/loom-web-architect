import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ResumeJSON, getSkillCategoryLabel, DEFAULT_SECTION_ORDER, type ResumeSectionId } from "@/types/resume";
import { getTemplate } from "@/config/resume-templates";

interface ResumeTemplateProps {
  data: ResumeJSON;
  templateId?: string;
  className?: string;
}

// ── ATS-Optimized Spacing Constants ──────────────────────────────────────────
// All spacing in pt for precision

const SPACING = {
  sectionMarginTop: "10pt",     // Space above each section heading
  sectionMarginBottom: "4pt",   // Space below section heading underline
  entryMarginBottom: "6pt",     // Space between experience/project entries
  bulletMarginBottom: "1.5pt",  // Space between bullet points
  bulletListMarginTop: "2pt",   // Space above bullet list
  bulletIndent: "14pt",         // Left indent for bullet lists
  bulletPaddingLeft: "2pt",     // Extra padding on bullet text
  compactEntryMargin: "3pt",    // For education/cert entries (less vertical space)
  skillLineMargin: "2pt",       // Space between skill category lines
} as const;

// ── Template-aware style builders ────────────────────────────────────────────

function buildSectionHeadingStyle(templateId: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: "11pt",
    fontWeight: 700,
    letterSpacing: "0.05em",
    paddingBottom: "2pt",
    marginTop: SPACING.sectionMarginTop,
    marginBottom: SPACING.sectionMarginBottom,
  };

  switch (templateId) {
    case "modern":
      return {
        ...base,
        textTransform: "uppercase",
        borderBottom: "1.5px solid #2563eb",
        color: "#1e293b",
      };
    case "minimal":
      return {
        ...base,
        textTransform: "none",
        fontVariant: "small-caps",
        borderBottom: "none",
        marginBottom: "6pt",
        letterSpacing: "0.02em",
      };
    case "creative":
    case "professional":
    default:
      return {
        ...base,
        textTransform: "uppercase",
        borderBottom: "1.5px solid #000",
      };
  }
}

function buildHeaderBorderStyle(templateId: string): React.CSSProperties {
  switch (templateId) {
    case "modern":
      return { borderBottom: "2px solid #2563eb" };
    case "minimal":
      return { borderBottom: "1px solid #57534e" };
    case "creative":
    case "professional":
    default:
      return { borderBottom: "2px solid #000" };
  }
}

function buildTitleAccentColor(templateId: string): string {
  switch (templateId) {
    case "modern":
      return "#2563eb";
    case "minimal":
      return "#292524";
    default:
      return "#000";
  }
}

// Shared bullet list style — ensures consistent rendering across all sections
const bulletListStyle: React.CSSProperties = {
  margin: `${SPACING.bulletListMarginTop} 0 0 ${SPACING.bulletIndent}`,
  padding: 0,
  listStyleType: "disc",
};

// Shared flex row style (left content + right-aligned date/location)
const flexRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
};

// Right-aligned metadata style (dates, locations)
const rightMetaStyle: React.CSSProperties = {
  fontSize: "9.5pt",
  flexShrink: 0,
  whiteSpace: "nowrap",
  marginLeft: "8pt",
};

// Hyperlinked title style — looks identical to normal bold text for ATS/print,
// but is a real <a> tag so PDF/screen readers can follow the link
const linkedTitleStyle: React.CSSProperties = {
  color: "#000",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: "10pt",
};

// Page height constant for page break indicators (matches PDF: 11in letter)
const PAGE_HEIGHT_IN = 11;

export const ResumeTemplate = forwardRef<HTMLDivElement, ResumeTemplateProps>(({ data, templateId = "professional", className }, ref) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

  const template = useMemo(() => getTemplate(templateId), [templateId]);
  const sectionHeadingStyle = useMemo(() => buildSectionHeadingStyle(templateId), [templateId]);
  const headerBorderStyle = useMemo(() => buildHeaderBorderStyle(templateId), [templateId]);
  const titleAccentColor = useMemo(() => buildTitleAccentColor(templateId), [templateId]);

  // Build bullet item style from template config
  const bulletItemStyle: React.CSSProperties = useMemo(() => ({
    paddingLeft: SPACING.bulletPaddingLeft,
    marginBottom: SPACING.bulletMarginBottom,
    fontSize: template.layout.fontSize,
    lineHeight: String(template.layout.lineHeight),
    textAlign: "justify",
  }), [template]);

  // Calculate number of pages based on content height
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const heightIn = el.scrollHeight / 96; // 96 CSS px per inch
      setPageCount(Math.max(1, Math.ceil(heightIn / PAGE_HEIGHT_IN)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);

  const skillCategories = Object.entries(data.skills)
    .filter(([_, skills]) => skills.length > 0)
    .map(([key, skills]) => ({
      category: getSkillCategoryLabel(key),
      skills,
    }));

  const validExperience = data.experience.filter((e) => e.company_or_client);
  const validEducation = data.education.filter((e) => e.institution);
  const validCerts = data.certifications.filter((c) => c.name);
  const validProjects = (data.projects || []).filter((p) => p.title);
  const validLanguages = (data.languages || []).filter((l) => l.language);
  const validVolunteer = (data.volunteer || []).filter((v) => v.organization);
  const validAwards = (data.awards || []).filter((a) => a.title);

  // Format LinkedIn display: show clean URL for ATS parsing
  const linkedInDisplay = data.header.linkedin
    ? data.header.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
    : "";

  // Skills rendering varies by template
  const renderSkills = () => {
    if (skillCategories.length === 0) return null;

    // Modern template: inline tag/badge style
    if (templateId === "modern") {
      return (
        <section key="skills">
          <h2 style={sectionHeadingStyle}>Technical Skills</h2>
          {skillCategories.map((sc, idx) => (
            <div key={idx} style={{ marginBottom: SPACING.skillLineMargin }}>
              <span style={{ fontWeight: 700, fontSize: template.layout.fontSize }}>{sc.category}: </span>
              {sc.skills.map((skill, sIdx) => (
                <span
                  key={sIdx}
                  style={{
                    display: "inline-block",
                    fontSize: "9pt",
                    lineHeight: "1.2",
                    padding: "1pt 5pt",
                    margin: "1pt 2pt 1pt 0",
                    borderRadius: "3pt",
                    backgroundColor: "#eff6ff",
                    border: "0.5px solid #bfdbfe",
                    color: "#1e40af",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          ))}
        </section>
      );
    }

    // Default (professional, creative, minimal): comma-separated list
    return (
      <section key="skills">
        <h2 style={sectionHeadingStyle}>Technical Skills</h2>
        {skillCategories.map((sc, idx) => (
          <p key={idx} style={{ margin: `0 0 ${SPACING.skillLineMargin} 0`, fontSize: template.layout.fontSize, lineHeight: String(template.layout.lineHeight) }}>
            <strong>{sc.category}:</strong> {sc.skills.join(", ")}
          </p>
        ))}
      </section>
    );
  };

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      {/* Page break indicators -- dashed lines at every 11in boundary */}
      {pageCount > 1 &&
        Array.from({ length: pageCount - 1 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${(i + 1) * PAGE_HEIGHT_IN}in`,
              left: 0,
              right: 0,
              zIndex: 10,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0 8px",
            }}
          >
            <div
              style={{
                flex: 1,
                borderTop: "2px dashed #d1d5db",
              }}
            />
            <span
              style={{
                fontSize: "9px",
                color: "#9ca3af",
                fontFamily: "system-ui, sans-serif",
                whiteSpace: "nowrap",
                backgroundColor: "#f9fafb",
                padding: "1px 6px",
                borderRadius: "3px",
                border: "1px solid #e5e7eb",
              }}
            >
              Page {i + 2}
            </span>
            <div
              style={{
                flex: 1,
                borderTop: "2px dashed #d1d5db",
              }}
            />
          </div>
        ))}

      {/* Resume content */}
      <div
        ref={contentRef}
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: `${template.layout.marginTop} ${template.layout.marginRight} ${template.layout.marginBottom} ${template.layout.marginLeft}`,
          fontFamily: template.layout.fontFamily,
          fontSize: template.layout.fontSize,
          lineHeight: String(template.layout.lineHeight),
          color: "#000",
          backgroundColor: "#fff",
          boxSizing: "border-box",
        }}
      >
      {/* ===== HEADER ===== */}
      <header
        style={{
          textAlign: "center",
          paddingBottom: "5pt",
          marginBottom: "4pt",
          ...headerBorderStyle,
        }}
      >
        <h1 style={{ fontSize: template.layout.headerFontSize, fontWeight: 700, letterSpacing: "0.03em", margin: 0 }}>
          {data.header.name || "Your Name"}
        </h1>
        {data.header.title && (
          <p style={{ fontSize: template.layout.titleFontSize, fontWeight: 600, margin: "2pt 0 0 0", color: titleAccentColor }}>{data.header.title}</p>
        )}
        {/* Contact info -- plain text for ATS parsing, pipe-separated */}
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
            <span aria-hidden="true">|</span>
          )}
          {data.header.email && <span>{data.header.email}</span>}
          {data.header.email && (data.header.phone || data.header.linkedin) && <span aria-hidden="true">|</span>}
          {data.header.phone && <span>{data.header.phone}</span>}
          {data.header.phone && data.header.linkedin && <span aria-hidden="true">|</span>}
          {data.header.linkedin && (
            <a
              href={data.header.linkedin.startsWith("http") ? data.header.linkedin : `https://${data.header.linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#000", textDecoration: "none" }}
            >
              {linkedInDisplay}
            </a>
          )}
        </div>
      </header>

      {/* ===== DYNAMIC SECTION RENDERING (respects section_order) ===== */}
      {(data.section_order || DEFAULT_SECTION_ORDER).map((sectionId) => {
        switch (sectionId) {
          case "summary":
            return data.summary ? (
              <section key="summary">
                <h2 style={sectionHeadingStyle}>Professional Summary</h2>
                <p style={{ textAlign: "justify", lineHeight: String(template.layout.lineHeight), margin: 0, fontSize: template.layout.fontSize }}>{data.summary}</p>
              </section>
            ) : null;

          case "experience":
            return validExperience.length > 0 ? (
              <section key="experience">
                <h2 style={sectionHeadingStyle}>Professional Experience</h2>
                {validExperience.map((exp, idx) => (
                  <div key={exp.id} style={{ marginBottom: idx < validExperience.length - 1 ? SPACING.entryMarginBottom : 0 }}>
                    <div style={flexRowStyle}>
                      <span style={{ fontWeight: 700, fontSize: template.layout.fontSize }}>{exp.role}</span>
                      <span style={rightMetaStyle}>{exp.start_date} — {exp.end_date}</span>
                    </div>
                    <div style={flexRowStyle}>
                      <span style={{ fontStyle: "italic", fontSize: template.layout.fontSize }}>{exp.company_or_client}</span>
                      {exp.location && <span style={rightMetaStyle}>{exp.location}</span>}
                    </div>
                    {exp.bullets.length > 0 && (
                      <ul style={bulletListStyle}>
                        {exp.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} style={bulletItemStyle}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            ) : null;

          case "education":
            return validEducation.length > 0 ? (
              <section key="education">
                <h2 style={sectionHeadingStyle}>Education</h2>
                {validEducation.map((edu) => (
                  <div key={edu.id} style={{ marginBottom: SPACING.compactEntryMargin }}>
                    <div style={flexRowStyle}>
                      <span style={{ fontSize: template.layout.fontSize }}>
                        <strong>{edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree"}</strong>
                        {edu.institution && <span> — {edu.institution}</span>}
                        {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                      </span>
                      <span style={rightMetaStyle}>{edu.graduation_date}</span>
                    </div>
                    {edu.location && <div style={{ fontSize: "9.5pt", fontStyle: "italic" }}>{edu.location}</div>}
                  </div>
                ))}
              </section>
            ) : null;

          case "skills":
            return renderSkills();

          case "certifications":
            return validCerts.length > 0 ? (
              <section key="certifications">
                <h2 style={sectionHeadingStyle}>Certifications</h2>
                {validCerts.map((cert) => (
                  <div key={cert.id} style={{ ...flexRowStyle, marginBottom: SPACING.compactEntryMargin }}>
                    <span style={{ fontSize: template.layout.fontSize }}>
                      {cert.url ? (
                        <a href={cert.url.startsWith("http") ? cert.url : `https://${cert.url}`} target="_blank" rel="noopener noreferrer" style={linkedTitleStyle}>{cert.name}</a>
                      ) : (
                        <strong>{cert.name}</strong>
                      )}
                      {cert.issuer && <span> — {cert.issuer}</span>}
                    </span>
                    <span style={rightMetaStyle}>{cert.date}</span>
                  </div>
                ))}
              </section>
            ) : null;

          case "projects":
            return validProjects.length > 0 ? (
              <section key="projects">
                <h2 style={sectionHeadingStyle}>Projects</h2>
                {validProjects.map((project, idx) => (
                  <div key={project.id} style={{ marginBottom: idx < validProjects.length - 1 ? SPACING.entryMarginBottom : 0 }}>
                    <div style={flexRowStyle}>
                      {project.url ? (
                        <a href={project.url.startsWith("http") ? project.url : `https://${project.url}`} target="_blank" rel="noopener noreferrer" style={linkedTitleStyle}>{project.title}</a>
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: template.layout.fontSize }}>{project.title}</span>
                      )}
                      {(project.organization || project.date) && (
                        <span style={{ ...rightMetaStyle, fontStyle: "italic" }}>
                          {project.organization && `${project.organization} — `}{project.date}
                        </span>
                      )}
                    </div>
                    {project.bullets.length > 0 && (
                      <ul style={bulletListStyle}>
                        {project.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} style={bulletItemStyle}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            ) : null;

          case "languages":
            return validLanguages.length > 0 ? (
              <section key="languages">
                <h2 style={sectionHeadingStyle}>Languages</h2>
                <p style={{ margin: 0, fontSize: template.layout.fontSize, lineHeight: String(template.layout.lineHeight) }}>
                  {validLanguages.map((l, idx) => (
                    <span key={l.id}>
                      <strong>{l.language}</strong>
                      {l.proficiency && ` (${l.proficiency})`}
                      {idx < validLanguages.length - 1 && "  |  "}
                    </span>
                  ))}
                </p>
              </section>
            ) : null;

          case "volunteer":
            return validVolunteer.length > 0 ? (
              <section key="volunteer">
                <h2 style={sectionHeadingStyle}>Volunteer Experience</h2>
                {validVolunteer.map((vol, idx) => (
                  <div key={vol.id} style={{ marginBottom: idx < validVolunteer.length - 1 ? SPACING.entryMarginBottom : 0 }}>
                    <div style={flexRowStyle}>
                      <span style={{ fontWeight: 700, fontSize: template.layout.fontSize }}>{vol.role || "Volunteer"}</span>
                      {vol.date && <span style={rightMetaStyle}>{vol.date}</span>}
                    </div>
                    <div><span style={{ fontStyle: "italic", fontSize: template.layout.fontSize }}>{vol.organization}</span></div>
                    {vol.bullets.length > 0 && (
                      <ul style={bulletListStyle}>
                        {vol.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} style={bulletItemStyle}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            ) : null;

          case "awards":
            return validAwards.length > 0 ? (
              <section key="awards">
                <h2 style={sectionHeadingStyle}>Awards & Publications</h2>
                {validAwards.map((award) => (
                  <div key={award.id} style={{ ...flexRowStyle, marginBottom: SPACING.compactEntryMargin }}>
                    <span style={{ fontSize: template.layout.fontSize }}>
                      {award.url ? (
                        <a href={award.url.startsWith("http") ? award.url : `https://${award.url}`} target="_blank" rel="noopener noreferrer" style={linkedTitleStyle}>{award.title}</a>
                      ) : (
                        <strong>{award.title}</strong>
                      )}
                      {award.issuer && <span> — {award.issuer}</span>}
                    </span>
                    <span style={rightMetaStyle}>{award.date}</span>
                  </div>
                ))}
              </section>
            ) : null;

          default: {
            // Custom sections
            const cs = (data.customSections || []).find((s) => s.id === sectionId);
            if (!cs || !cs.entries.some((e) => e.title)) return null;
            return (
              <section key={cs.id}>
                <h2 style={sectionHeadingStyle}>{cs.name}</h2>
                {cs.entries
                  .filter((e) => e.title)
                  .map((entry, idx, arr) => (
                    <div key={entry.id} style={{ marginBottom: idx < arr.length - 1 ? SPACING.entryMarginBottom : 0 }}>
                      <div style={flexRowStyle}>
                        {entry.url ? (
                          <a href={entry.url.startsWith("http") ? entry.url : `https://${entry.url}`} target="_blank" rel="noopener noreferrer" style={linkedTitleStyle}>{entry.title}</a>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: template.layout.fontSize }}>{entry.title}</span>
                        )}
                        {entry.date && <span style={rightMetaStyle}>{entry.date}</span>}
                      </div>
                      {entry.subtitle && (
                        <div><span style={{ fontStyle: "italic", fontSize: template.layout.fontSize }}>{entry.subtitle}</span></div>
                      )}
                      {entry.bullets.length > 0 && (
                        <ul style={bulletListStyle}>
                          {entry.bullets.map((bullet, bIdx) => (
                            <li key={bIdx} style={bulletItemStyle}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
              </section>
            );
          }
        }
      })}
      </div>
    </div>
  );
});

ResumeTemplate.displayName = "ResumeTemplate";

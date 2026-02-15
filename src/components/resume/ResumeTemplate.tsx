import { forwardRef, useEffect, useRef, useState } from "react";
import { ResumeJSON, SKILL_CATEGORY_LABELS } from "@/types/resume";

interface ResumeTemplateProps {
  data: ResumeJSON;
  className?: string;
}

// ── ATS-Optimized Spacing Constants ──────────────────────────────────────────
// Industry standard: 0.5in top/bottom, 0.6in left/right margins on 8.5x11 letter
// Font: Calibri (most ATS-friendly sans-serif), fallback chain for web rendering
// All spacing in pt for precision; line-height 1.35 for readability + density balance

const SPACING = {
  sectionMarginTop: "10pt", // Space above each section heading
  sectionMarginBottom: "4pt", // Space below section heading underline
  entryMarginBottom: "6pt", // Space between experience/project entries
  bulletMarginBottom: "1.5pt", // Space between bullet points
  bulletListMarginTop: "2pt", // Space above bullet list
  bulletIndent: "14pt", // Left indent for bullet lists
  bulletPaddingLeft: "2pt", // Extra padding on bullet text
  compactEntryMargin: "3pt", // For education/cert entries (less vertical space)
  skillLineMargin: "2pt", // Space between skill category lines
} as const;

// ATS-compliant section heading style (consistent across all sections)
const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "11pt",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1.5px solid #000",
  paddingBottom: "2pt",
  marginTop: SPACING.sectionMarginTop,
  marginBottom: SPACING.sectionMarginBottom,
};

// Shared bullet list style — ensures consistent rendering across all sections
const bulletListStyle: React.CSSProperties = {
  margin: `${SPACING.bulletListMarginTop} 0 0 ${SPACING.bulletIndent}`,
  padding: 0,
  listStyleType: "disc",
};

// Shared bullet item style
const bulletItemStyle: React.CSSProperties = {
  paddingLeft: SPACING.bulletPaddingLeft,
  marginBottom: SPACING.bulletMarginBottom,
  fontSize: "10pt",
  lineHeight: "1.35",
  textAlign: "justify",
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

// Page height constant for page break indicators (matches PDF: 11in letter)
const PAGE_HEIGHT_IN = 11;

export const ResumeTemplate = forwardRef<HTMLDivElement, ResumeTemplateProps>(({ data, className }, ref) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

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

  // Format LinkedIn display: show clean URL for ATS parsing
  const linkedInDisplay = data.header.linkedin
    ? data.header.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
    : "";

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      {/* Page break indicators — dashed lines at every 11in boundary */}
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
          padding: "0.5in 0.6in",
          fontFamily: "'Calibri', 'Arial', 'Helvetica Neue', sans-serif",
          fontSize: "10pt",
          lineHeight: "1.35",
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
            borderBottom: "2px solid #000",
            marginBottom: "4pt",
          }}
        >
          <h1 style={{ fontSize: "18pt", fontWeight: 700, letterSpacing: "0.03em", margin: 0 }}>
            {data.header.name || "Your Name"}
          </h1>
          {data.header.title && (
            <p style={{ fontSize: "11pt", fontWeight: 600, margin: "2pt 0 0 0", color: "#000" }}>{data.header.title}</p>
          )}
          {/* Contact info — plain text for ATS parsing, pipe-separated */}
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
                href={
                  data.header.linkedin.startsWith("http") ? data.header.linkedin : `https://${data.header.linkedin}`
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#000", textDecoration: "none" }}
              >
                {linkedInDisplay}
              </a>
            )}
          </div>
        </header>

        {/* ===== SUMMARY ===== */}
        {data.summary && (
          <section>
            <h2 style={sectionHeadingStyle}>Professional Summary</h2>
            <p style={{ textAlign: "justify", lineHeight: "1.35", margin: 0, fontSize: "10pt" }}>{data.summary}</p>
          </section>
        )}

        {/* ===== EXPERIENCE ===== */}
        {validExperience.length > 0 && (
          <section>
            <h2 style={sectionHeadingStyle}>Professional Experience</h2>
            {validExperience.map((exp, idx) => (
              <div
                key={exp.id}
                style={{ marginBottom: idx < validExperience.length - 1 ? SPACING.entryMarginBottom : 0 }}
              >
                <div style={flexRowStyle}>
                  <span style={{ fontWeight: 700, fontSize: "10pt" }}>{exp.role}</span>
                  <span style={rightMetaStyle}>
                    {exp.start_date} — {exp.end_date}
                  </span>
                </div>
                <div style={flexRowStyle}>
                  <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{exp.company_or_client}</span>
                  {exp.location && <span style={rightMetaStyle}>{exp.location}</span>}
                </div>
                {exp.bullets.length > 0 && (
                  <ul style={bulletListStyle}>
                    {exp.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} style={bulletItemStyle}>
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
          <section>
            <h2 style={sectionHeadingStyle}>Education</h2>
            {validEducation.map((edu) => (
              <div key={edu.id} style={{ marginBottom: SPACING.compactEntryMargin }}>
                <div style={flexRowStyle}>
                  <span style={{ fontSize: "10pt" }}>
                    <strong>
                      {edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree"}
                    </strong>
                    {edu.institution && <span> — {edu.institution}</span>}
                    {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                  </span>
                  <span style={rightMetaStyle}>{edu.graduation_date}</span>
                </div>
                {edu.location && <div style={{ fontSize: "9.5pt", fontStyle: "italic" }}>{edu.location}</div>}
              </div>
            ))}
          </section>
        )}

        {/* ===== SKILLS ===== */}
        {skillCategories.length > 0 && (
          <section>
            <h2 style={sectionHeadingStyle}>Technical Skills</h2>
            {skillCategories.map((sc, idx) => (
              <p key={idx} style={{ margin: `0 0 ${SPACING.skillLineMargin} 0`, fontSize: "10pt", lineHeight: "1.35" }}>
                <strong>{sc.category}:</strong> {sc.skills.join(", ")}
              </p>
            ))}
          </section>
        )}

        {/* ===== CERTIFICATIONS ===== */}
        {validCerts.length > 0 && (
          <section>
            <h2 style={sectionHeadingStyle}>Certifications</h2>
            {validCerts.map((cert) => (
              <div key={cert.id} style={{ ...flexRowStyle, marginBottom: SPACING.compactEntryMargin }}>
                <span style={{ fontSize: "10pt" }}>
                  <strong>{cert.name}</strong>
                  {cert.issuer && <span> — {cert.issuer}</span>}
                </span>
                <span style={rightMetaStyle}>{cert.date}</span>
              </div>
            ))}
          </section>
        )}

        {/* ===== PROJECTS ===== */}
        {validProjects.length > 0 && (
          <section>
            <h2 style={sectionHeadingStyle}>Projects</h2>
            {validProjects.map((project, idx) => (
              <div
                key={project.id}
                style={{ marginBottom: idx < validProjects.length - 1 ? SPACING.entryMarginBottom : 0 }}
              >
                <div style={flexRowStyle}>
                  <span style={{ fontWeight: 700, fontSize: "10pt" }}>{project.title}</span>
                  {(project.organization || project.date) && (
                    <span style={{ ...rightMetaStyle, fontStyle: "italic" }}>
                      {project.organization && `${project.organization} — `}
                      {project.date}
                    </span>
                  )}
                </div>
                {project.bullets.length > 0 && (
                  <ul style={bulletListStyle}>
                    {project.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} style={bulletItemStyle}>
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
          <section>
            <h2 style={sectionHeadingStyle}>Languages</h2>
            <p style={{ margin: 0, fontSize: "10pt", lineHeight: "1.35" }}>
              {validLanguages.map((l, idx) => (
                <span key={l.id}>
                  <strong>{l.language}</strong>
                  {l.proficiency && ` (${l.proficiency})`}
                  {idx < validLanguages.length - 1 && "  |  "}
                </span>
              ))}
            </p>
          </section>
        )}

        {/* ===== VOLUNTEER EXPERIENCE ===== */}
        {validVolunteer.length > 0 && (
          <section>
            <h2 style={sectionHeadingStyle}>Volunteer Experience</h2>
            {validVolunteer.map((vol, idx) => (
              <div
                key={vol.id}
                style={{ marginBottom: idx < validVolunteer.length - 1 ? SPACING.entryMarginBottom : 0 }}
              >
                <div style={flexRowStyle}>
                  <span style={{ fontWeight: 700, fontSize: "10pt" }}>{vol.role || "Volunteer"}</span>
                  {vol.date && <span style={rightMetaStyle}>{vol.date}</span>}
                </div>
                <div>
                  <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{vol.organization}</span>
                </div>
                {vol.bullets.length > 0 && (
                  <ul style={bulletListStyle}>
                    {vol.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} style={bulletItemStyle}>
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
          <section>
            <h2 style={sectionHeadingStyle}>Awards & Publications</h2>
            {validAwards.map((award) => (
              <div key={award.id} style={{ ...flexRowStyle, marginBottom: SPACING.compactEntryMargin }}>
                <span style={{ fontSize: "10pt" }}>
                  <strong>{award.title}</strong>
                  {award.issuer && <span> — {award.issuer}</span>}
                </span>
                <span style={rightMetaStyle}>{award.date}</span>
              </div>
            ))}
          </section>
        )}

        {/* ===== CUSTOM SECTIONS ===== */}
        {(data.customSections || [])
          .filter((cs) => cs.entries.some((e) => e.title))
          .map((cs) => (
            <section key={cs.id}>
              <h2 style={sectionHeadingStyle}>{cs.name}</h2>
              {cs.entries
                .filter((e) => e.title)
                .map((entry, idx, arr) => (
                  <div key={entry.id} style={{ marginBottom: idx < arr.length - 1 ? SPACING.entryMarginBottom : 0 }}>
                    <div style={flexRowStyle}>
                      <span style={{ fontWeight: 700, fontSize: "10pt" }}>{entry.title}</span>
                      {entry.date && <span style={rightMetaStyle}>{entry.date}</span>}
                    </div>
                    {entry.subtitle && (
                      <div>
                        <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{entry.subtitle}</span>
                      </div>
                    )}
                    {entry.bullets.length > 0 && (
                      <ul style={bulletListStyle}>
                        {entry.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} style={bulletItemStyle}>
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
    </div>
  );
});

ResumeTemplate.displayName = "ResumeTemplate";

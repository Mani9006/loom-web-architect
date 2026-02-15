import { forwardRef } from "react";
import { ResumeJSON, SKILL_CATEGORY_LABELS } from "@/types/resume";
import { MapPin, Mail, Phone, Linkedin } from "lucide-react";

interface ResumeTemplateProps {
  data: ResumeJSON;
  className?: string;
}

export const ResumeTemplate = forwardRef<HTMLDivElement, ResumeTemplateProps>(
  ({ data, className }, ref) => {
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

    return (
      <div
        ref={ref}
        className={className}
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: "1.8cm 2cm 2cm 2cm",
          fontFamily: "'Charter', 'Bitstream Charter', 'Georgia', serif",
          fontSize: "10pt",
          lineHeight: "1.4",
          color: "#000",
          backgroundColor: "#fff",
        }}
      >
        {/* ===== HEADER ===== */}
        <header style={{ textAlign: "center", paddingBottom: "0.3cm", borderBottom: "1px solid #000", marginBottom: "0.4cm" }}>
          <h1 style={{ fontSize: "19pt", fontWeight: 700, letterSpacing: "0.02em", margin: 0 }}>
            {data.header.name || "Your Name"}
          </h1>
          {data.header.title && (
            <p style={{ fontSize: "11.5pt", fontWeight: 700, margin: "0.15cm 0 0 0" }}>
              {data.header.title}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "0 0.4cm", marginTop: "0.2cm", fontSize: "10pt" }}>
            {data.header.location && (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <MapPin size={11} strokeWidth={2} /> {data.header.location}
                </span>
                {(data.header.email || data.header.phone || data.header.linkedin) && <span style={{ color: "#666" }}>|</span>}
              </>
            )}
            {data.header.email && (
              <>
                <a href={`mailto:${data.header.email}`} style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#000", textDecoration: "none" }}>
                  <Mail size={11} strokeWidth={2} /> {data.header.email}
                </a>
                {(data.header.phone || data.header.linkedin) && <span style={{ color: "#666" }}>|</span>}
              </>
            )}
            {data.header.phone && (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <Phone size={11} strokeWidth={2} /> {data.header.phone}
                </span>
                {data.header.linkedin && <span style={{ color: "#666" }}>|</span>}
              </>
            )}
            {data.header.linkedin && (
              <a
                href={data.header.linkedin.startsWith("http") ? data.header.linkedin : `https://${data.header.linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#000", textDecoration: "none" }}
              >
                <Linkedin size={11} strokeWidth={2} /> LinkedIn
              </a>
            )}
          </div>
        </header>

        {/* ===== SUMMARY ===== */}
        {data.summary && (
          <section style={{ marginBottom: "0.4cm" }}>
            <h2 style={{ fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #000", paddingBottom: "0.1cm", marginTop: "0.3cm", marginBottom: "0.2cm" }}>
              Summary
            </h2>
            <p style={{ textAlign: "justify", lineHeight: "1.5", margin: 0 }}>{data.summary}</p>
          </section>
        )}

        {/* ===== EXPERIENCE ===== */}
        {validExperience.length > 0 && (
          <section style={{ marginBottom: "0.4cm" }}>
            <h2 style={{ fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #000", paddingBottom: "0.1cm", marginTop: "0.3cm", marginBottom: "0.2cm" }}>
              Experience
            </h2>
            {validExperience.map((exp) => (
              <div key={exp.id} style={{ marginBottom: "0.35cm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700, fontSize: "10pt" }}>{exp.role || "Role"}</span>
                  <span style={{ fontSize: "10pt", flexShrink: 0 }}>
                    {exp.start_date || "Start"} — {exp.end_date || "End"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontStyle: "italic", fontSize: "10pt" }}>{exp.company_or_client}</span>
                  {exp.location && <span style={{ fontSize: "10pt", flexShrink: 0 }}>{exp.location}</span>}
                </div>
                {exp.bullets.length > 0 && (
                  <ul style={{ margin: "0.1cm 0 0 15pt", padding: 0, listStyleType: "disc" }}>
                    {exp.bullets.map((bullet, idx) => (
                      <li key={idx} style={{ paddingLeft: "3pt", marginBottom: "1pt", fontSize: "10pt" }}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ===== EDUCATION ===== */}
        {validEducation.length > 0 && (
          <section style={{ marginBottom: "0.4cm" }}>
            <h2 style={{ fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #000", paddingBottom: "0.1cm", marginTop: "0.3cm", marginBottom: "0.2cm" }}>
              Education
            </h2>
            {validEducation.map((edu) => (
              <div key={edu.id} style={{ marginBottom: "0.15cm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "10pt" }}>
                    <strong>
                      {edu.degree && edu.field ? `${edu.degree} in ${edu.field}` : edu.degree || edu.field || "Degree"}
                    </strong>
                    {edu.institution && <span>, {edu.institution}</span>}
                    {edu.gpa && <span> (GPA: {edu.gpa})</span>}
                  </span>
                  <span style={{ fontSize: "10pt", flexShrink: 0 }}>{edu.graduation_date}</span>
                </div>
                {edu.location && (
                  <div style={{ textAlign: "right", fontSize: "10pt" }}>{edu.location}</div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ===== CERTIFICATIONS ===== */}
        {validCerts.length > 0 && (
          <section style={{ marginBottom: "0.4cm" }}>
            <h2 style={{ fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #000", paddingBottom: "0.1cm", marginTop: "0.3cm", marginBottom: "0.2cm" }}>
              Certifications
            </h2>
            {validCerts.map((cert) => (
              <div key={cert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2pt" }}>
                <span style={{ fontSize: "10pt" }}>
                  <span style={{ color: "#2563eb", fontWeight: 700 }}>{cert.name}</span>
                  {cert.issuer && <span>, {cert.issuer}</span>}
                </span>
                <span style={{ fontSize: "10pt", flexShrink: 0 }}>{cert.date}</span>
              </div>
            ))}
          </section>
        )}

        {/* ===== SKILLS ===== */}
        {skillCategories.length > 0 && (
          <section style={{ marginBottom: "0.4cm" }}>
            <h2 style={{ fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #000", paddingBottom: "0.1cm", marginTop: "0.3cm", marginBottom: "0.2cm" }}>
              Skills
            </h2>
            {skillCategories.map((sc, idx) => (
              <p key={idx} style={{ margin: "0 0 2pt 0", fontSize: "10pt" }}>
                <strong>{sc.category}:</strong> {sc.skills.join(", ")}
              </p>
            ))}
          </section>
        )}

        {/* ===== PROJECTS ===== */}
        {validProjects.length > 0 && (
          <section style={{ marginBottom: "0.4cm" }}>
            <h2 style={{ fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #000", paddingBottom: "0.1cm", marginTop: "0.3cm", marginBottom: "0.2cm" }}>
              Projects
            </h2>
            {validProjects.map((project) => (
              <div key={project.id} style={{ marginBottom: "0.25cm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700, fontSize: "10pt" }}>{project.title}</span>
                  {project.date && (
                    <span style={{ fontStyle: "italic", fontSize: "10pt", flexShrink: 0 }}>
                      {project.organization && `${project.organization} — `}{project.date}
                    </span>
                  )}
                </div>
                {project.bullets.length > 0 && (
                  <ul style={{ margin: "0.05cm 0 0 15pt", padding: 0, listStyleType: "disc" }}>
                    {project.bullets.map((bullet, idx) => (
                      <li key={idx} style={{ paddingLeft: "3pt", fontSize: "10pt" }}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }
);

ResumeTemplate.displayName = "ResumeTemplate";

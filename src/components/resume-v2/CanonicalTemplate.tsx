/**
 * The single canonical resume template (v2).
 *
 * Replaces the 4-variant template system with ONE clean, ATS-optimized layout.
 * Uses pt units for print fidelity. No template-id branching. No CSS hacks.
 *
 * Renders directly from ResumeJSON. Subscribes to the resume store for live
 * preview. Read-only — editing is done via the canvas wrapper.
 */
import { forwardRef } from "react";
import type { ResumeJSON, ResumeSectionId } from "@/types/resume";
import { DEFAULT_SECTION_ORDER, getSkillCategoryLabel } from "@/types/resume";

interface Props {
  data: ResumeJSON;
  hiddenSections?: Set<ResumeSectionId>;
  className?: string;
}

const fmtDate = (start: string, end: string) =>
  [start, end].filter(Boolean).join(" – ") || end || start;

export const CanonicalTemplate = forwardRef<HTMLDivElement, Props>(function CanonicalTemplate(
  { data, hiddenSections, className = "" },
  ref,
) {
  const order = data.section_order?.length ? data.section_order : DEFAULT_SECTION_ORDER;
  const skip = (id: ResumeSectionId) => hiddenSections?.has(id) ?? false;

  return (
    <div
      ref={ref}
      className={`canonical-resume bg-white text-black ${className}`}
      style={{
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: "10.5pt",
        lineHeight: 1.35,
        padding: "0.5in",
        width: "8.5in",
        minHeight: "11in",
        color: "#000",
      }}
    >
      <Header data={data.header} />

      {order.map((sectionId) => {
        if (skip(sectionId)) return null;
        switch (sectionId) {
          case "summary":
            return data.summary ? <Summary key="s" text={data.summary} /> : null;
          case "experience":
            return data.experience.length ? <Experience key="x" items={data.experience} /> : null;
          case "education":
            return data.education.length ? <Education key="e" items={data.education} /> : null;
          case "skills":
            return Object.keys(data.skills).length ? <Skills key="k" skills={data.skills} /> : null;
          case "projects":
            return data.projects.length ? <Projects key="p" items={data.projects} /> : null;
          case "certifications":
            return data.certifications.length ? <Certifications key="c" items={data.certifications} /> : null;
          case "languages":
            return data.languages?.length ? <Languages key="l" items={data.languages} /> : null;
          case "volunteer":
            return data.volunteer?.length ? <Volunteer key="v" items={data.volunteer} /> : null;
          case "awards":
            return data.awards?.length ? <Awards key="a" items={data.awards} /> : null;
          default: {
            const custom = data.customSections?.find((s) => s.id === sectionId);
            return custom ? <CustomBlock key={sectionId} section={custom} /> : null;
          }
        }
      })}
    </div>
  );
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "11pt",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        borderBottom: "1px solid #000",
        paddingBottom: "1pt",
        marginTop: "12pt",
        marginBottom: "5pt",
      }}
    >
      {children}
    </h2>
  );
}

function Header({ data }: { data: ResumeJSON["header"] }) {
  const contact = [data.location, data.email, data.phone, data.linkedin].filter(Boolean).join("  ·  ");
  return (
    <header style={{ textAlign: "center", marginBottom: "4pt" }}>
      <div style={{ fontSize: "20pt", fontWeight: 700, letterSpacing: "0.02em" }}>{data.name || "Your Name"}</div>
      {data.title && <div style={{ fontSize: "11pt", marginTop: "2pt" }}>{data.title}</div>}
      {contact && <div style={{ fontSize: "9.5pt", marginTop: "3pt", color: "#222" }}>{contact}</div>}
    </header>
  );
}

function Summary({ text }: { text: string }) {
  return (
    <section>
      <SectionTitle>Summary</SectionTitle>
      <p style={{ marginTop: 0, marginBottom: "6pt" }}>{text}</p>
    </section>
  );
}

function Experience({ items }: { items: ResumeJSON["experience"] }) {
  return (
    <section>
      <SectionTitle>Experience</SectionTitle>
      {items.map((e) => (
        <div key={e.id} style={{ marginBottom: "8pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div style={{ fontWeight: 700 }}>{e.role}</div>
            <div style={{ fontStyle: "italic" }}>{fmtDate(e.start_date, e.end_date)}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div>{e.company_or_client}</div>
            <div style={{ color: "#333" }}>{e.location}</div>
          </div>
          {e.bullets.length > 0 && (
            <ul style={{ margin: "3pt 0 0 16pt", padding: 0 }}>
              {e.bullets.map((b, i) => (
                <li key={i} style={{ marginBottom: "1.5pt" }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function Education({ items }: { items: ResumeJSON["education"] }) {
  return (
    <section>
      <SectionTitle>Education</SectionTitle>
      {items.map((e) => (
        <div key={e.id} style={{ marginBottom: "4pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div style={{ fontWeight: 700 }}>{e.institution}</div>
            <div style={{ fontStyle: "italic" }}>{e.graduation_date}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div>
              {e.degree}
              {e.field ? `, ${e.field}` : ""}
              {e.gpa ? ` · GPA ${e.gpa}` : ""}
            </div>
            <div style={{ color: "#333" }}>{e.location}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

function Skills({ skills }: { skills: ResumeJSON["skills"] }) {
  const entries = Object.entries(skills).filter(([, v]) => v.length > 0);
  if (!entries.length) return null;
  return (
    <section>
      <SectionTitle>Skills</SectionTitle>
      {entries.map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: "2pt" }}>
          <span style={{ fontWeight: 700 }}>{getSkillCategoryLabel(cat)}: </span>
          <span>{list.join(", ")}</span>
        </div>
      ))}
    </section>
  );
}

function Projects({ items }: { items: ResumeJSON["projects"] }) {
  return (
    <section>
      <SectionTitle>Projects</SectionTitle>
      {items.map((p) => (
        <div key={p.id} style={{ marginBottom: "6pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div style={{ fontWeight: 700 }}>
              {p.title}
              {p.organization && <span style={{ fontWeight: 400 }}> · {p.organization}</span>}
            </div>
            <div style={{ fontStyle: "italic" }}>{p.date}</div>
          </div>
          {p.bullets.length > 0 && (
            <ul style={{ margin: "2pt 0 0 16pt", padding: 0 }}>
              {p.bullets.map((b, i) => (
                <li key={i} style={{ marginBottom: "1.5pt" }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function Certifications({ items }: { items: ResumeJSON["certifications"] }) {
  return (
    <section>
      <SectionTitle>Certifications</SectionTitle>
      {items.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginBottom: "2pt" }}>
          <div>
            <span style={{ fontWeight: 700 }}>{c.name}</span>
            {c.issuer && <span> · {c.issuer}</span>}
          </div>
          <div style={{ fontStyle: "italic" }}>{c.date}</div>
        </div>
      ))}
    </section>
  );
}

function Languages({ items }: { items: NonNullable<ResumeJSON["languages"]> }) {
  return (
    <section>
      <SectionTitle>Languages</SectionTitle>
      <div>{items.map((l) => `${l.language} (${l.proficiency})`).join("  ·  ")}</div>
    </section>
  );
}

function Volunteer({ items }: { items: NonNullable<ResumeJSON["volunteer"]> }) {
  return (
    <section>
      <SectionTitle>Volunteer</SectionTitle>
      {items.map((v) => (
        <div key={v.id} style={{ marginBottom: "6pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div style={{ fontWeight: 700 }}>{v.role} · {v.organization}</div>
            <div style={{ fontStyle: "italic" }}>{v.date}</div>
          </div>
          {v.bullets.length > 0 && (
            <ul style={{ margin: "2pt 0 0 16pt", padding: 0 }}>
              {v.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function Awards({ items }: { items: NonNullable<ResumeJSON["awards"]> }) {
  return (
    <section>
      <SectionTitle>Awards & Publications</SectionTitle>
      {items.map((a) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginBottom: "2pt" }}>
          <div>
            <span style={{ fontWeight: 700 }}>{a.title}</span>
            {a.issuer && <span> · {a.issuer}</span>}
          </div>
          <div style={{ fontStyle: "italic" }}>{a.date}</div>
        </div>
      ))}
    </section>
  );
}

function CustomBlock({ section }: { section: NonNullable<ResumeJSON["customSections"]>[number] }) {
  return (
    <section>
      <SectionTitle>{section.name}</SectionTitle>
      {section.entries.map((e) => (
        <div key={e.id} style={{ marginBottom: "6pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt" }}>
            <div style={{ fontWeight: 700 }}>
              {e.title}
              {e.subtitle && <span style={{ fontWeight: 400 }}> · {e.subtitle}</span>}
            </div>
            <div style={{ fontStyle: "italic" }}>{e.date}</div>
          </div>
          {e.bullets.length > 0 && (
            <ul style={{ margin: "2pt 0 0 16pt", padding: 0 }}>
              {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

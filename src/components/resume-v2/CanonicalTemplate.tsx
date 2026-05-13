/**
 * The canonical resume template (v2 redesign).
 *
 * Typography choices target LaTeX-quality output:
 *   - Body:    "Source Serif 4" (Google Fonts) — modern descendant of
 *              Source Serif Pro, designed for long-form reading. Renders
 *              close to Computer Modern / Latin Modern but with better
 *              hinting in browsers.
 *   - Display: "EB Garamond" for the name + section headings — gives the
 *              page a printed-CV feel without screaming "Word document".
 *   - Mono:    "JetBrains Mono" reserved for date stamps and metrics so
 *              numbers align cleanly.
 *
 * Geometry follows LaTeX's `\documentclass{article}` defaults:
 *   - 8.5 × 11 inch (US Letter)
 *   - 0.75 inch margins
 *   - 10.5pt body, 1.35 line height
 *   - Section title 11.5pt small-caps with a hairline rule under it
 *
 * The template is purely a function of ResumeJSON. No template-id
 * branching. No CSS hacks. Editing happens elsewhere; this just renders.
 */
import { forwardRef, Fragment } from "react";
import type { ResumeJSON, ResumeSectionId } from "@/types/resume";
import { DEFAULT_SECTION_ORDER, getSkillCategoryLabel } from "@/types/resume";

interface Props {
  data: ResumeJSON;
  hiddenSections?: Set<ResumeSectionId>;
  className?: string;
}

const PAGE_STYLES: React.CSSProperties = {
  fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif',
  fontSize: "10.5pt",
  lineHeight: 1.35,
  color: "#0b0e14",
  width: "8.5in",
  minHeight: "11in",
  padding: "0.75in",
  background: "white",
  fontFeatureSettings: '"liga" 1, "kern" 1, "onum" 1',
  WebkitFontSmoothing: "antialiased",
  boxSizing: "border-box",
};

const fmtRange = (start: string, end: string) => {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (s && e) return `${s} – ${e}`;
  return e || s;
};

export const CanonicalTemplate = forwardRef<HTMLDivElement, Props>(function CanonicalTemplate(
  { data, hiddenSections, className = "" },
  ref,
) {
  const order = data.section_order?.length ? data.section_order : DEFAULT_SECTION_ORDER;
  const skip = (id: ResumeSectionId) => hiddenSections?.has(id) ?? false;

  return (
    <div ref={ref} className={`canonical-resume ${className}`} style={PAGE_STYLES}>
      <Header data={data.header} />

      {order.map((sectionId) => {
        if (skip(sectionId)) return null;
        switch (sectionId) {
          case "summary":
            return data.summary?.trim() ? <Summary key="s" text={data.summary} /> : null;
          case "experience":
            return data.experience.some((e) => e.role || e.company_or_client)
              ? <Experience key="x" items={data.experience} />
              : null;
          case "education":
            return data.education.some((e) => e.institution || e.degree)
              ? <Education key="e" items={data.education} />
              : null;
          case "skills":
            return Object.values(data.skills).some((s) => s.length)
              ? <Skills key="k" skills={data.skills} />
              : null;
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

// ─── Header ────────────────────────────────────────────────────────────────

function Header({ data }: { data: ResumeJSON["header"] }) {
  const contactParts = [data.location, data.email, data.phone, data.linkedin].filter(Boolean);
  const isEmpty = !data.name && !data.title && contactParts.length === 0;

  return (
    <header style={{ textAlign: "center", marginBottom: "10pt", paddingBottom: "10pt", borderBottom: "0.4pt solid #1a1f2c" }}>
      <div
        style={{
          fontFamily: '"EB Garamond", Georgia, serif',
          fontSize: "26pt",
          fontWeight: 600,
          letterSpacing: "0.015em",
          lineHeight: 1.05,
          color: "#0b0e14",
        }}
      >
        {data.name || <Placeholder>Your name</Placeholder>}
      </div>
      {data.title && (
        <div
          style={{
            fontSize: "11.5pt",
            fontStyle: "italic",
            color: "#39424f",
            marginTop: "3pt",
            letterSpacing: "0.01em",
          }}
        >
          {data.title}
        </div>
      )}
      {contactParts.length > 0 && (
        <div
          style={{
            fontSize: "9.5pt",
            marginTop: "6pt",
            color: "#2c333d",
            display: "flex",
            flexWrap: "wrap",
            gap: "0 14pt",
            justifyContent: "center",
          }}
        >
          {contactParts.map((p, i) => (
            <span key={i} style={i > 0 ? { borderLeft: "0.4pt solid #9099a3", paddingLeft: "14pt" } : undefined}>
              {p}
            </span>
          ))}
        </div>
      )}
      {isEmpty && (
        <div style={{ fontSize: "9.5pt", color: "#9099a3", marginTop: "6pt", fontStyle: "italic" }}>
          Fill in the Header section on the left to begin.
        </div>
      )}
    </header>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#c1c7d0", fontStyle: "italic" }}>{children}</span>;
}

// ─── Section heading (shared) ──────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: '"EB Garamond", Georgia, serif',
        fontSize: "11.5pt",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        color: "#0b0e14",
        margin: "14pt 0 4pt 0",
        paddingBottom: "2pt",
        borderBottom: "0.4pt solid #1a1f2c",
      }}
    >
      {children}
    </h2>
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────

function Summary({ text }: { text: string }) {
  return (
    <section>
      <SectionTitle>Summary</SectionTitle>
      <p style={{ margin: "4pt 0 0 0", textAlign: "justify", hyphens: "auto" }}>{text}</p>
    </section>
  );
}

// ─── Experience ────────────────────────────────────────────────────────────

const dateStyle: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: "9pt",
  color: "#39424f",
  whiteSpace: "nowrap",
  letterSpacing: "-0.01em",
};

function Experience({ items }: { items: ResumeJSON["experience"] }) {
  return (
    <section>
      <SectionTitle>Experience</SectionTitle>
      {items.map((e) => (
        <div key={e.id} style={{ marginTop: "7pt", marginBottom: "9pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
            <div style={{ fontSize: "11pt", fontWeight: 600 }}>
              {e.role || <Placeholder>Role</Placeholder>}
              {e.company_or_client && (
                <span style={{ fontWeight: 400, color: "#39424f" }}> · {e.company_or_client}</span>
              )}
            </div>
            <div style={dateStyle}>{fmtRange(e.start_date, e.end_date)}</div>
          </div>
          {e.location && (
            <div style={{ fontSize: "9.5pt", color: "#39424f", fontStyle: "italic", marginTop: "1pt" }}>
              {e.location}
            </div>
          )}
          {e.bullets.length > 0 && (
            <ul
              style={{
                margin: "3pt 0 0 0",
                paddingLeft: "14pt",
                listStyleType: "'\\2014  '",
              }}
            >
              {e.bullets.filter((b) => b.trim()).map((b, i) => (
                <li key={i} style={{ marginBottom: "1.5pt", textAlign: "justify", hyphens: "auto" }}>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

// ─── Education ─────────────────────────────────────────────────────────────

function Education({ items }: { items: ResumeJSON["education"] }) {
  return (
    <section>
      <SectionTitle>Education</SectionTitle>
      {items.map((e) => (
        <div key={e.id} style={{ marginTop: "5pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
            <div style={{ fontSize: "11pt", fontWeight: 600 }}>{e.institution || <Placeholder>Institution</Placeholder>}</div>
            <div style={dateStyle}>{e.graduation_date}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginTop: "1pt" }}>
            <div style={{ fontStyle: "italic" }}>
              {e.degree}
              {e.field ? `, ${e.field}` : ""}
              {e.gpa ? ` · GPA ${e.gpa}` : ""}
            </div>
            <div style={{ color: "#39424f", fontSize: "9.5pt" }}>{e.location}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

// ─── Skills ────────────────────────────────────────────────────────────────

function Skills({ skills }: { skills: ResumeJSON["skills"] }) {
  const entries = Object.entries(skills).filter(([, v]) => v.length > 0);
  if (!entries.length) return null;
  return (
    <section>
      <SectionTitle>Skills</SectionTitle>
      <div style={{ marginTop: "4pt", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "10pt", rowGap: "2pt" }}>
        {entries.map(([cat, list]) => (
          <Fragment key={cat}>
            <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{getSkillCategoryLabel(cat)}</div>
            <div>{list.join(" · ")}</div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

// ─── Projects ──────────────────────────────────────────────────────────────

function Projects({ items }: { items: ResumeJSON["projects"] }) {
  return (
    <section>
      <SectionTitle>Selected Projects</SectionTitle>
      {items.map((p) => (
        <div key={p.id} style={{ marginTop: "6pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
            <div style={{ fontSize: "11pt", fontWeight: 600 }}>
              {p.title || <Placeholder>Project</Placeholder>}
              {p.organization && <span style={{ fontWeight: 400, color: "#39424f" }}> · {p.organization}</span>}
            </div>
            <div style={dateStyle}>{p.date}</div>
          </div>
          {p.bullets.length > 0 && (
            <ul style={{ margin: "2pt 0 0 0", paddingLeft: "14pt", listStyleType: "'\\2014  '" }}>
              {p.bullets.filter((b) => b.trim()).map((b, i) => (
                <li key={i} style={{ marginBottom: "1.5pt", textAlign: "justify", hyphens: "auto" }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

// ─── Certifications ────────────────────────────────────────────────────────

function Certifications({ items }: { items: ResumeJSON["certifications"] }) {
  return (
    <section>
      <SectionTitle>Certifications</SectionTitle>
      <div style={{ marginTop: "3pt" }}>
        {items.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginBottom: "2pt" }}>
            <div>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.issuer && <span style={{ color: "#39424f" }}> · {c.issuer}</span>}
            </div>
            <div style={dateStyle}>{c.date}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Languages ─────────────────────────────────────────────────────────────

function Languages({ items }: { items: NonNullable<ResumeJSON["languages"]> }) {
  return (
    <section>
      <SectionTitle>Languages</SectionTitle>
      <div style={{ marginTop: "3pt" }}>
        {items.map((l, i) => (
          <span key={l.id}>
            {i > 0 && <span style={{ color: "#9099a3", margin: "0 6pt" }}>·</span>}
            <span style={{ fontWeight: 600 }}>{l.language}</span>
            <span style={{ color: "#39424f" }}> ({l.proficiency})</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Volunteer ─────────────────────────────────────────────────────────────

function Volunteer({ items }: { items: NonNullable<ResumeJSON["volunteer"]> }) {
  return (
    <section>
      <SectionTitle>Volunteer</SectionTitle>
      {items.map((v) => (
        <div key={v.id} style={{ marginTop: "5pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
            <div style={{ fontSize: "11pt", fontWeight: 600 }}>
              {v.role} <span style={{ fontWeight: 400, color: "#39424f" }}>· {v.organization}</span>
            </div>
            <div style={dateStyle}>{v.date}</div>
          </div>
          {v.bullets.length > 0 && (
            <ul style={{ margin: "2pt 0 0 0", paddingLeft: "14pt", listStyleType: "'\\2014  '" }}>
              {v.bullets.map((b, i) => <li key={i} style={{ marginBottom: "1.5pt" }}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

// ─── Awards ────────────────────────────────────────────────────────────────

function Awards({ items }: { items: NonNullable<ResumeJSON["awards"]> }) {
  return (
    <section>
      <SectionTitle>Awards & Publications</SectionTitle>
      <div style={{ marginTop: "3pt" }}>
        {items.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginBottom: "2pt" }}>
            <div>
              <span style={{ fontWeight: 600 }}>{a.title}</span>
              {a.issuer && <span style={{ color: "#39424f" }}> · {a.issuer}</span>}
            </div>
            <div style={dateStyle}>{a.date}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Custom Section ────────────────────────────────────────────────────────

function CustomBlock({ section }: { section: NonNullable<ResumeJSON["customSections"]>[number] }) {
  return (
    <section>
      <SectionTitle>{section.name}</SectionTitle>
      {section.entries.map((e) => (
        <div key={e.id} style={{ marginTop: "5pt" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
            <div style={{ fontSize: "11pt", fontWeight: 600 }}>
              {e.title}
              {e.subtitle && <span style={{ fontWeight: 400, color: "#39424f" }}> · {e.subtitle}</span>}
            </div>
            <div style={dateStyle}>{e.date}</div>
          </div>
          {e.bullets.length > 0 && (
            <ul style={{ margin: "2pt 0 0 0", paddingLeft: "14pt", listStyleType: "'\\2014  '" }}>
              {e.bullets.map((b, i) => <li key={i} style={{ marginBottom: "1.5pt" }}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}


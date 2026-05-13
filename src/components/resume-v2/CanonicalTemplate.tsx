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

const safeStr = (v: unknown): string => (typeof v === "string" ? v : "");
const safeStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const fmtRange = (start: unknown, end: unknown) => {
  const s = safeStr(start).trim();
  const e = safeStr(end).trim();
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
            return safeStr(data.summary).trim() ? <Summary key="s" text={safeStr(data.summary)} /> : null;
          case "experience":
            return (data.experience ?? []).some((e) => safeStr(e?.role) || safeStr(e?.company_or_client))
              ? <Experience key="x" items={data.experience ?? []} />
              : null;
          case "education":
            return (data.education ?? []).some((e) => safeStr(e?.institution) || safeStr(e?.degree))
              ? <Education key="e" items={data.education ?? []} />
              : null;
          case "skills":
            return Object.values(data.skills ?? {}).some((s) => Array.isArray(s) && s.length > 0)
              ? <Skills key="k" skills={data.skills ?? {}} />
              : null;
          case "projects":
            return (data.projects ?? []).length ? <Projects key="p" items={data.projects ?? []} /> : null;
          case "certifications":
            return (data.certifications ?? []).length ? <Certifications key="c" items={data.certifications ?? []} /> : null;
          case "languages":
            return (data.languages ?? []).length ? <Languages key="l" items={data.languages ?? []} /> : null;
          case "volunteer":
            return (data.volunteer ?? []).length ? <Volunteer key="v" items={data.volunteer ?? []} /> : null;
          case "awards":
            return (data.awards ?? []).length ? <Awards key="a" items={data.awards ?? []} /> : null;
          default: {
            const custom = data.customSections?.find((s) => s?.id === sectionId);
            return custom ? <CustomBlock key={sectionId} section={custom} /> : null;
          }
        }
      })}
    </div>
  );
});

// ─── Header ────────────────────────────────────────────────────────────────

function Header({ data }: { data: ResumeJSON["header"] }) {
  const d = data ?? ({} as ResumeJSON["header"]);
  const name = safeStr(d.name);
  const title = safeStr(d.title);
  const contactParts = [safeStr(d.location), safeStr(d.email), safeStr(d.phone), safeStr(d.linkedin)].filter((s) => s.trim());
  const isEmpty = !name && !title && contactParts.length === 0;

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
        {name || <Placeholder>Your name</Placeholder>}
      </div>
      {title && (
        <div
          style={{
            fontSize: "11.5pt",
            fontStyle: "italic",
            color: "#39424f",
            marginTop: "3pt",
            letterSpacing: "0.01em",
          }}
        >
          {title}
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
      {items.map((e, idx) => {
        const role = safeStr(e?.role);
        const company = safeStr(e?.company_or_client);
        const location = safeStr(e?.location);
        const bullets = safeStrArr(e?.bullets).filter((b) => b.trim());
        return (
          <div key={e?.id ?? idx} style={{ marginTop: "7pt", marginBottom: "9pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
              <div style={{ fontSize: "11pt", fontWeight: 600 }}>
                {role || <Placeholder>Role</Placeholder>}
                {company && (
                  <span style={{ fontWeight: 400, color: "#39424f" }}> · {company}</span>
                )}
              </div>
              <div style={dateStyle}>{fmtRange(e?.start_date, e?.end_date)}</div>
            </div>
            {location && (
              <div style={{ fontSize: "9.5pt", color: "#39424f", fontStyle: "italic", marginTop: "1pt" }}>
                {location}
              </div>
            )}
            {bullets.length > 0 && (
              <ul
                style={{
                  margin: "3pt 0 0 0",
                  paddingLeft: "14pt",
                  listStyleType: "'\\2014  '",
                }}
              >
                {bullets.map((b, i) => (
                  <li key={i} style={{ marginBottom: "1.5pt", textAlign: "justify", hyphens: "auto" }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─── Education ─────────────────────────────────────────────────────────────

function Education({ items }: { items: ResumeJSON["education"] }) {
  return (
    <section>
      <SectionTitle>Education</SectionTitle>
      {items.map((e, idx) => {
        const inst = safeStr(e?.institution);
        const grad = safeStr(e?.graduation_date);
        const degree = safeStr(e?.degree);
        const field = safeStr(e?.field);
        const gpa = safeStr(e?.gpa);
        const loc = safeStr(e?.location);
        return (
          <div key={e?.id ?? idx} style={{ marginTop: "5pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
              <div style={{ fontSize: "11pt", fontWeight: 600 }}>{inst || <Placeholder>Institution</Placeholder>}</div>
              <div style={dateStyle}>{grad}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginTop: "1pt" }}>
              <div style={{ fontStyle: "italic" }}>
                {degree}
                {field ? `, ${field}` : ""}
                {gpa ? ` · GPA ${gpa}` : ""}
              </div>
              <div style={{ color: "#39424f", fontSize: "9.5pt" }}>{loc}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─── Skills ────────────────────────────────────────────────────────────────

function Skills({ skills }: { skills: ResumeJSON["skills"] }) {
  const entries = Object.entries(skills ?? {}).flatMap(([cat, v]) => {
    const list = safeStrArr(v).filter((s) => s.trim());
    return list.length ? [[cat, list] as const] : [];
  });
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
      {items.map((p, idx) => {
        const title = safeStr(p?.title);
        const org = safeStr(p?.organization);
        const date = safeStr(p?.date);
        const bullets = safeStrArr(p?.bullets).filter((b) => b.trim());
        return (
          <div key={p?.id ?? idx} style={{ marginTop: "6pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
              <div style={{ fontSize: "11pt", fontWeight: 600 }}>
                {title || <Placeholder>Project</Placeholder>}
                {org && <span style={{ fontWeight: 400, color: "#39424f" }}> · {org}</span>}
              </div>
              <div style={dateStyle}>{date}</div>
            </div>
            {bullets.length > 0 && (
              <ul style={{ margin: "2pt 0 0 0", paddingLeft: "14pt", listStyleType: "'\\2014  '" }}>
                {bullets.map((b, i) => (
                  <li key={i} style={{ marginBottom: "1.5pt", textAlign: "justify", hyphens: "auto" }}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─── Certifications ────────────────────────────────────────────────────────

function Certifications({ items }: { items: ResumeJSON["certifications"] }) {
  return (
    <section>
      <SectionTitle>Certifications</SectionTitle>
      <div style={{ marginTop: "3pt" }}>
        {items.map((c, idx) => (
          <div key={c?.id ?? idx} style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginBottom: "2pt" }}>
            <div>
              <span style={{ fontWeight: 600 }}>{safeStr(c?.name)}</span>
              {safeStr(c?.issuer) && <span style={{ color: "#39424f" }}> · {safeStr(c?.issuer)}</span>}
            </div>
            <div style={dateStyle}>{safeStr(c?.date)}</div>
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
          <span key={l?.id ?? i}>
            {i > 0 && <span style={{ color: "#9099a3", margin: "0 6pt" }}>·</span>}
            <span style={{ fontWeight: 600 }}>{safeStr(l?.language)}</span>
            <span style={{ color: "#39424f" }}> ({safeStr(l?.proficiency)})</span>
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
      {items.map((v, idx) => {
        const bullets = safeStrArr(v?.bullets);
        return (
          <div key={v?.id ?? idx} style={{ marginTop: "5pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
              <div style={{ fontSize: "11pt", fontWeight: 600 }}>
                {safeStr(v?.role)} <span style={{ fontWeight: 400, color: "#39424f" }}>· {safeStr(v?.organization)}</span>
              </div>
              <div style={dateStyle}>{safeStr(v?.date)}</div>
            </div>
            {bullets.length > 0 && (
              <ul style={{ margin: "2pt 0 0 0", paddingLeft: "14pt", listStyleType: "'\\2014  '" }}>
                {bullets.map((b, i) => <li key={i} style={{ marginBottom: "1.5pt" }}>{b}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─── Awards ────────────────────────────────────────────────────────────────

function Awards({ items }: { items: NonNullable<ResumeJSON["awards"]> }) {
  return (
    <section>
      <SectionTitle>Awards & Publications</SectionTitle>
      <div style={{ marginTop: "3pt" }}>
        {items.map((a, idx) => (
          <div key={a?.id ?? idx} style={{ display: "flex", justifyContent: "space-between", gap: "12pt", marginBottom: "2pt" }}>
            <div>
              <span style={{ fontWeight: 600 }}>{safeStr(a?.title)}</span>
              {safeStr(a?.issuer) && <span style={{ color: "#39424f" }}> · {safeStr(a?.issuer)}</span>}
            </div>
            <div style={dateStyle}>{safeStr(a?.date)}</div>
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
      <SectionTitle>{safeStr(section?.name)}</SectionTitle>
      {(section?.entries ?? []).map((e, idx) => {
        const bullets = safeStrArr(e?.bullets);
        return (
          <div key={e?.id ?? idx} style={{ marginTop: "5pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12pt", alignItems: "baseline" }}>
              <div style={{ fontSize: "11pt", fontWeight: 600 }}>
                {safeStr(e?.title)}
                {safeStr(e?.subtitle) && <span style={{ fontWeight: 400, color: "#39424f" }}> · {safeStr(e?.subtitle)}</span>}
              </div>
              <div style={dateStyle}>{safeStr(e?.date)}</div>
            </div>
            {bullets.length > 0 && (
              <ul style={{ margin: "2pt 0 0 0", paddingLeft: "14pt", listStyleType: "'\\2014  '" }}>
                {bullets.map((b, i) => <li key={i} style={{ marginBottom: "1.5pt" }}>{b}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}


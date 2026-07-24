/**
 * Resume pagination & ATS-format tests.
 *
 * Covers the shared layout engine (supabase/functions/_shared/resume-pdf-layout.ts),
 * the pagination-risk estimator (ats-deterministic.ts), and the client jsPDF
 * renderer (src/hooks/use-resume-export.ts) end to end.
 *
 * Regression target: a resume whose content slightly exceeds one page used to
 * strand a single line on page 2 — it must now auto-tighten to fit one page,
 * and longer resumes must paginate at entry boundaries (never an orphan line,
 * never an entry split across pages, never a section heading left alone).
 */
import { describe, expect, it } from "vitest";
import {
  ATS_PDF_SPEC,
  blocksFromResumeLines,
  type LayoutBlock,
  type LayoutMetrics,
  paginate,
  paginateWithAutoFit,
} from "../../supabase/functions/_shared/resume-pdf-layout";
import { estimatePaginationRisk } from "../../supabase/functions/_shared/ats-deterministic";
import { PDFResumeRenderer } from "@/hooks/use-resume-export";
import type { ResumeJSON } from "@/types/resume";

// ─── Deterministic fake measurer (Helvetica avg glyph ≈ 0.5em) ──────────────

const CONTENT_WIDTH = ATS_PDF_SPEC.pageWidthPt - ATS_PDF_SPEC.marginPt * 2; // 504pt
const USABLE = ATS_PDF_SPEC.pageHeightPt - ATS_PDF_SPEC.marginPt * 2; // 684pt

function fakeWrap(text: string, size: number, _style: string, indentPt = 0): string[] {
  const maxWidth = CONTENT_WIDTH - indentPt;
  const charWidth = size * 0.5;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length * charWidth <= maxWidth || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

const baseMetrics: LayoutMetrics = {
  usableHeight: USABLE,
  lineHeight: (size) => size * ATS_PDF_SPEC.lineHeightScale,
};

function entry(lines: number, gapBefore = 5, units?: number[]): LayoutBlock {
  return {
    kind: "entry",
    lines: Array.from({ length: lines }, (_, i) => ({ text: `L${i}`, size: 10.5, style: "regular" as const })),
    gapBefore,
    units: units ?? [1, ...Array(lines - 1).fill(1)],
  };
}

// ─── ATS spec invariants ────────────────────────────────────────────────────

describe("ATS_PDF_SPEC", () => {
  it("stays within ATS guidelines", () => {
    expect(ATS_PDF_SPEC.bodySize).toBeGreaterThanOrEqual(10.5);
    expect(ATS_PDF_SPEC.bodySize).toBeLessThanOrEqual(11.5);
    expect(ATS_PDF_SPEC.nameSize).toBeGreaterThanOrEqual(12);
    expect(ATS_PDF_SPEC.nameSize).toBeLessThanOrEqual(14);
    expect(ATS_PDF_SPEC.marginPt).toBeGreaterThanOrEqual(36); // ≥ 0.5in
    expect(Math.min(...ATS_PDF_SPEC.densitySteps)).toBeGreaterThanOrEqual(0.8); // sane tighten bounds
    expect(ATS_PDF_SPEC.maxAutoFitOverflow).toBe(0.08);
  });
});

// ─── Keep-together / pagination rules ───────────────────────────────────────

describe("paginate keep-together rules", () => {
  const lh = () => 10;
  const metrics: LayoutMetrics = { usableHeight: 100, lineHeight: lh };

  it("moves a whole entry to the next page instead of splitting it", () => {
    const a = entry(8, 0); // 80
    const b = entry(4, 5); // 45 → 80+45 = 125 > 100
    const layout = paginate([a, b], metrics);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0]).toEqual([a]);
    expect(layout.pages[1]).toEqual([b]); // entry B unsplit
  });

  it("keeps a section heading with its first entry (no stranded heading)", () => {
    const heading: LayoutBlock = {
      kind: "heading",
      lines: [{ text: "EXPERIENCE", size: 11, style: "bold" }],
      gapBefore: 0,
      keepWithNext: true,
    };
    const a = entry(8, 5); // 85 → heading(10)+entry(85) = 95 > 100? no, fits
    const b = entry(3, 5); // 35 → page 1 would be 95+35 = 130 > 100
    const layout = paginate([heading, a, b], metrics);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0]).toEqual([heading, a]);
    expect(layout.pages[1]).toEqual([b]);
    // Heading is never the last block on a page
    for (const page of layout.pages.slice(0, -1)) {
      expect(page[page.length - 1].kind).not.toBe("heading");
    }
  });

  it("pulls a heading onto the next page when only the heading would fit", () => {
    const heading: LayoutBlock = {
      kind: "heading",
      lines: [{ text: "EDUCATION", size: 11, style: "bold" }],
      gapBefore: 5,
      keepWithNext: true,
    };
    const filler = entry(9, 0); // 90
    const edu = entry(2, 5); // 30 → heading(15)+edu(30) = 45 > 10 remaining
    const layout = paginate([filler, heading, edu], metrics);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[1][0]).toBe(heading); // heading moved with its entry
    expect(layout.pages[1]).toContain(edu);
  });

  it("splits an oversize entry only at unit boundaries, never mid-bullet", () => {
    // 30 lines > 100/10 = 10 lines per page; units of 3 lines each ("bullets").
    const big: LayoutBlock = {
      kind: "entry",
      lines: Array.from({ length: 30 }, (_, i) => ({ text: `b${i}`, size: 10.5, style: "regular" as const })),
      gapBefore: 0,
      units: Array(10).fill(3),
    };
    const layout = paginate([big], metrics);
    expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    for (const page of layout.pages) {
      const totalLines = page.reduce((sum, block) => sum + block.lines.length, 0);
      expect(totalLines % 3).toBe(0); // every page breaks at a unit boundary
    }
    // Reassemble → original line order preserved (no lines lost or duplicated)
    const reassembled = layout.pages.flatMap((page) => page.flatMap((block) => block.lines.map((l) => l.text)));
    expect(reassembled).toEqual(big.lines.map((l) => l.text));
  });
});

// ─── Auto-tighten: the reported bug ─────────────────────────────────────────

describe("paginateWithAutoFit", () => {
  it("fits a slightly-over-one-page resume onto one page (no orphan line)", () => {
    // 5 big entries (574.4pt) + one 6-line entry (88.2pt) fill page 1 to
    // 662.6pt; the final 3-line entry (46.6pt) spills ~6.8% of a page —
    // the "one line on page 2" bug shape. Must tighten to a single page.
    const blocks: LayoutBlock[] = [];
    for (let i = 0; i < 5; i++) blocks.push(entry(8, i === 0 ? 0 : 5));
    blocks.push(entry(6, 5));
    blocks.push(entry(3, 5));
    const base = paginate(blocks, baseMetrics);
    expect(base.pages).toHaveLength(2);
    expect(base.overflowFraction).toBeLessThanOrEqual(0.08);

    const layout = paginateWithAutoFit(blocks, baseMetrics);
    expect(layout.pages).toHaveLength(1);
    expect(layout.tightened).toBe(true);
    expect(layout.density).toBeLessThan(1);
  });

  it("does not tighten when the spill exceeds 8% — paginates at entry boundary", () => {
    // 5 entries fill page 1 (574.4pt, 109.6pt left); the 6th entry (115.9pt)
    // doesn't fit and spills ~17% of a page — over the auto-tighten limit.
    const blocks: LayoutBlock[] = [];
    for (let i = 0; i < 6; i++) blocks.push(entry(8, i === 0 ? 0 : 5));
    const layout = paginateWithAutoFit(blocks, baseMetrics);
    expect(layout.pages).toHaveLength(2);
    expect(layout.tightened).toBe(false);
    // Page 2 holds exactly the whole last entry — not a fragment.
    expect(layout.pages[1]).toHaveLength(1);
    expect(layout.pages[1][0].lines).toHaveLength(8);
  });
});

// ─── blocksFromResumeLines ──────────────────────────────────────────────────

describe("blocksFromResumeLines", () => {
  const wrap = (text: string, size: number, style: string, indent?: number) => fakeWrap(text, size, style, indent ?? 0);

  it("groups entry head + bullets into one atomic entry block", () => {
    const blocks = blocksFromResumeLines(
      [
        "Jane Doe",
        "jane@example.com · 555-0100",
        "",
        "EXPERIENCE",
        "Senior Engineer · Acme · (Jan 2020 – Present)",
        "• Led platform rebuild, cutting latency 40%",
        "• Mentored 5 engineers across 2 teams",
        "Staff Engineer · Beta · (2017 – 2020)",
        "• Shipped billing system processing $2M ARR",
      ],
      { wrap },
    );
    const heading = blocks.find((b) => b.kind === "heading");
    expect(heading?.keepWithNext).toBe(true);
    const entries = blocks.filter((b) => b.kind === "entry");
    expect(entries).toHaveLength(2);
    expect(entries[0].units).toEqual([1, 1, 1]); // head + 2 bullets
    expect(entries[1].units).toEqual([1, 1]);
    expect(entries[0].lines.map((l) => l.text).join(" ")).toContain("Senior Engineer");
  });

  it("normalizes markdown bullets and headings from cv_md content", () => {
    const blocks = blocksFromResumeLines(
      ["# Jane Doe", "", "## Experience", "Senior Engineer · Acme", "- Led migration to Kubernetes"],
      { wrap },
    );
    const entryBlock = blocks.find((b) => b.kind === "entry");
    expect(entryBlock).toBeDefined();
    expect(entryBlock!.lines.some((l) => l.text.startsWith("• Led migration"))).toBe(true);
  });
});

// ─── estimatePaginationRisk ─────────────────────────────────────────────────

describe("estimatePaginationRisk", () => {
  const bullet = (n: number) =>
    `Led initiative ${n} delivering measurable impact across the organization with cross-functional teams`;
  const makeResume = (entries: number, bulletsPerEntry: number) => ({
    summary: "Seasoned operator with a decade of experience shipping results.",
    personal_info: { fullName: "Jane Doe", email: "jane@example.com" },
    experience: Array.from({ length: entries }, (_, i) => ({
      role: `Role ${i}`,
      company_or_client: `Company ${i}`,
      start_date: "Jan 2020",
      end_date: "Present",
      bullets: Array.from({ length: bulletsPerEntry }, (_, j) => bullet(j)),
    })),
    education: [{ degree: "B.S.", school: "State University" }],
    skills: ["Leadership", "Strategy", "Operations"],
  });

  it("reports one-page for a short resume", () => {
    const risk = estimatePaginationRisk(makeResume(1, 3));
    expect(risk.risk).toBe("one-page");
    expect(risk.issues).toHaveLength(0);
  });

  it("flags a slight one-page spill as a tightening risk", () => {
    // Grow entries until we land in the ≤12% spill window (must exist because
    // entries add ~fixed increments and the window is wider than one entry).
    let found: string | null = null;
    for (let n = 1; n <= 12; n++) {
      const risk = estimatePaginationRisk(makeResume(n, 4));
      if (risk.risk === "spill") {
        found = risk.issues[0];
        expect(risk.estimatedPages).toBe(2);
        expect(risk.overflowFraction).toBeLessThanOrEqual(0.12);
        break;
      }
    }
    expect(found).toBeTruthy();
    expect(found).toMatch(/slightly exceeds one page/);
  });

  it("flags genuinely long resumes as multi-page", () => {
    const risk = estimatePaginationRisk(makeResume(12, 6));
    expect(risk.risk).toBe("multi-page");
    expect(risk.estimatedPages).toBeGreaterThanOrEqual(2);
    expect(risk.issues[0]).toMatch(/pages/);
  });

  it("flags a single entry taller than a page", () => {
    const risk = estimatePaginationRisk(makeResume(1, 40));
    expect(risk.risk).toBe("oversize-entry");
    expect(risk.issues[0]).toMatch(/taller than a full page/);
  });
});

// ─── Client jsPDF renderer end-to-end ───────────────────────────────────────

const LONG_BULLET =
  "Led cross-functional initiative to redesign the revenue operations pipeline, " +
  "automating manual reconciliation work and reducing reporting errors by 38% across regions";

function makeClientResume(bulletsInLastEntry: number): ResumeJSON {
  return {
    header: {
      name: "Alex Rivera",
      title: "Senior Operations Manager",
      email: "alex.rivera@example.com",
      phone: "555-0100",
      location: "Austin, TX",
      linkedin: "linkedin.com/in/alexrivera",
    },
    summary:
      "Senior operations leader with 12 years scaling revenue teams, building process automation, and coaching managers across three continents.",
    experience: [
      {
        role: "Director of Operations",
        company_or_client: "Northwind Traders",
        start_date: "Jan 2021",
        end_date: "Present",
        location: "Austin, TX",
        bullets: [LONG_BULLET, LONG_BULLET, LONG_BULLET, LONG_BULLET],
      },
      {
        role: "Operations Manager",
        company_or_client: "Contoso Ltd",
        start_date: "Mar 2017",
        end_date: "Dec 2020",
        location: "Dallas, TX",
        bullets: [LONG_BULLET, LONG_BULLET, LONG_BULLET, LONG_BULLET],
      },
      {
        role: "Operations Analyst",
        company_or_client: "Fabrikam Inc",
        start_date: "Jun 2013",
        end_date: "Feb 2017",
        location: "Houston, TX",
        bullets: Array.from({ length: bulletsInLastEntry }, () => LONG_BULLET),
      },
    ],
    education: [
      {
        degree: "B.B.A.",
        field: "Management",
        institution: "State University",
        gpa: "",
        graduation_date: "May 2013",
        location: "",
      },
    ],
    certifications: [],
    skills: {
      programming_languages: ["SQL", "Python"],
      frameworks: ["Salesforce", "Tableau"],
    },
    projects: [],
  } as unknown as ResumeJSON;
}

async function basePass(data: ResumeJSON) {
  const renderer = new PDFResumeRenderer();
  // renderPass is private; tests exercise it to measure the untightened layout.
  return (renderer as unknown as {
    renderPass: (d: ResumeJSON, density: number) => Promise<{
      pageCount: number;
      lastPageContentHeight: number;
    }>;
  }).renderPass(data, 1);
}

describe("PDFResumeRenderer pagination (jsPDF e2e)", () => {
  it("auto-tightens a resume that used to orphan lines on page 2", async () => {
    // Find a bullet count that spills ≤8% of a page onto page 2 at base density.
    let data: ResumeJSON | null = null;
    for (let n = 2; n <= 10; n++) {
      const candidate = makeClientResume(n);
      const base = await basePass(candidate);
      if (base.pageCount === 2) {
        const spill = base.lastPageContentHeight - 0.5;
        expect(spill).toBeLessThanOrEqual(0.08 * 10); // must be auto-tightenable
        data = candidate;
        break;
      }
    }
    expect(data).not.toBeNull();

    const doc = await new PDFResumeRenderer().render(data!);
    expect(doc.getNumberOfPages()).toBe(1);
  }, 60000);

  it("keeps every entry on one page for genuinely long resumes", async () => {
    const data = makeClientResume(14);
    const doc = await new PDFResumeRenderer().render(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);

    // jsPDF keeps each page's content stream accessible internally:
    // every entry's role must share a page with its first and last bullet words.
    const internal = (doc as unknown as { internal?: { pages?: unknown[] }; pages?: unknown[] });
    const rawPages = internal.internal?.pages ?? internal.pages ?? [];
    const pages: string[] = rawPages.filter((p) => Array.isArray(p)).map((ops) => (ops as string[]).join("\n"));
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const exp of data.experience) {
      const firstWord = exp.bullets[0].split(" ")[0];
      const lastBullet = exp.bullets[exp.bullets.length - 1];
      const lastWords = lastBullet.split(" ").slice(-2).join(" ");
      const pageWithRole = pages.findIndex((p) => p.includes(`(${exp.role})`));
      expect(pageWithRole).toBeGreaterThanOrEqual(0);
      expect(pages[pageWithRole]).toContain(`(${firstWord})`);
      expect(pages[pageWithRole]).toContain(lastWords.split(" ")[1] ?? lastWords);
    }
  }, 60000);
});

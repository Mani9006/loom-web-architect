/**
 * Shared resume PDF layout engine — pagination with keep-together rules.
 *
 * Pure TypeScript, no Deno/npm dependencies, so it is used by the server-side
 * pdf-lib renderer (mc-render-resume) and unit-tested from src/test via vitest.
 *
 * Rules implemented (ATS + typography):
 *  1. An experience/education/project ENTRY (title + company + dates + bullets)
 *     never splits across pages when it fits on a single page. An entry taller
 *     than a full page splits ONLY at unit boundaries (entry head / whole
 *     bullets) — a wrapped bullet never splits mid-bullet.
 *  2. A section HEADING always stays with at least its first item
 *     (keepWithNext), so a heading never lands alone at the bottom of a page.
 *  3. Small overflows (content spilling ≤ maxAutoFitOverflow of a page onto the
 *     last page) auto-tighten line-height/spacing within sane bounds to fit one
 *     page instead of spilling a line or two onto a nearly-empty page.
 *  4. Larger overflows paginate cleanly at entry boundaries — never a single
 *     orphan line on the next page.
 */

export type FontStyle = "regular" | "bold" | "italic";

export interface StyledLine {
  text: string;
  size: number;
  style: FontStyle;
  /** Left indent in points (e.g. bullet text). */
  indent?: number;
}

export type BlockKind = "name" | "contact" | "heading" | "entry" | "text";

export interface LayoutBlock {
  kind: BlockKind;
  lines: StyledLine[];
  /** Extra vertical space before this block, in points (scaled by density). */
  gapBefore: number;
  /** Keep this block on the same page as the next block (section headings). */
  keepWithNext?: boolean;
  /**
   * Atomic unit sizes (in lines). When a block is taller than one page and
   * must split, breaks happen only at these unit boundaries. Entry blocks use
   * [headLines, ...bulletLines]; text blocks default to 1 line per unit.
   */
  units?: number[];
}

export interface LayoutMetrics {
  /** Usable content height per page in points (page height minus margins). */
  usableHeight: number;
  /** Line height for a given font size, in points. */
  lineHeight: (size: number) => number;
  /** Scale applied to block gaps (density tightening). Defaults to 1. */
  gapScale?: number;
}

export interface PageLayout {
  pages: LayoutBlock[][];
  /** Height of the content on the last page, in points. */
  lastPageHeight: number;
  /**
   * Fraction of a page that spills onto the last page (0 when everything fits
   * on one page). A 2-page layout whose page 2 holds 5% of a page of content
   * has overflowFraction ≈ 0.05.
   */
  overflowFraction: number;
  /** Density scale applied to line-heights/gaps (1 = base layout). */
  density: number;
  /** True when auto-tightening was used to fit the content on fewer pages. */
  tightened: boolean;
}

/** ATS-guideline typographic spec shared by every resume PDF renderer. */
export const ATS_PDF_SPEC = {
  pageWidthPt: 612, // US Letter
  pageHeightPt: 792,
  marginPt: 54, // 0.75in on every side (ATS minimum is 0.5in)
  nameSize: 14, // 12–14pt name
  headingSize: 11,
  bodySize: 10.5, // 10.5–11.5pt body
  smallSize: 9.5, // contact line / dates
  lineHeightScale: 1.32,
  entryGapPt: 5,
  sectionGapPt: 10,
  maxAutoFitOverflow: 0.08,
  // A longer résumé may be correctly two pages yet strand a small skills or
  // education tail on page 3 because entries stay together. A slightly wider
  // threshold is safe here: we only tighten line-height/gaps, never font size.
  maxSparseTailOverflow: 0.18,
  densitySteps: [0.94, 0.88, 0.84],
} as const;

export function blockHeight(block: LayoutBlock, metrics: LayoutMetrics): number {
  const gapScale = metrics.gapScale ?? 1;
  const lines = block.lines.reduce((sum, line) => sum + metrics.lineHeight(line.size), 0);
  return block.gapBefore * gapScale + lines;
}

function groupHeight(group: LayoutBlock[], metrics: LayoutMetrics): number {
  return group.reduce((sum, block) => sum + blockHeight(block, metrics), 0);
}

interface Cursor {
  pages: LayoutBlock[][];
  y: number;
}

function newPage(cursor: Cursor): void {
  cursor.pages.push([]);
  cursor.y = 0;
}

function placeBlock(cursor: Cursor, block: LayoutBlock, metrics: LayoutMetrics): void {
  cursor.pages[cursor.pages.length - 1].push(block);
  cursor.y += blockHeight(block, metrics);
}

/**
 * Places a block that is taller than one page, splitting only at unit
 * boundaries so a wrapped bullet never splits mid-bullet. Widow/orphan
 * control: the first portion keeps at least two units when the block has more
 * than one (an entry head is never left alone), and the trailing portion is
 * never a single unit when it can be avoided.
 */
function placeOversizeBlock(cursor: Cursor, block: LayoutBlock, metrics: LayoutMetrics): void {
  const units = block.units && block.units.length > 0
    ? block.units
    : block.lines.map(() => 1);
  const totalUnits = units.length;

  // Pre-compute the height of each unit.
  const unitHeights: number[] = [];
  let lineIdx = 0;
  for (const count of units) {
    let h = 0;
    for (let i = 0; i < count && lineIdx + i < block.lines.length; i++) {
      h += metrics.lineHeight(block.lines[lineIdx + i].size);
    }
    unitHeights.push(h);
    lineIdx += count;
  }

  let start = 0; // first unplaced unit
  let firstPortion = true;
  let gapLeft = block.gapBefore * (metrics.gapScale ?? 1);
  const usable = metrics.usableHeight;

  while (start < totalUnits) {
    let remaining = usable - cursor.y - gapLeft;
    gapLeft = 0; // gap applies once, before the first portion
    let fit = 0;
    let h = 0;
    while (start + fit < totalUnits && h + unitHeights[start + fit] <= remaining + 1e-6) {
      h += unitHeights[start + fit];
      fit += 1;
    }

    const left = totalUnits - start;
    if (firstPortion && cursor.y > 0 && fit === 1 && left > 1) {
      // Only the entry head would fit — move the whole block to a fresh page.
      fit = 0;
    }
    // Widow control: never leave a single-unit tail when we can pull one back.
    if (fit >= 2 && left - fit === 1) fit -= 1;

    if (fit === 0) {
      if (cursor.y === 0) {
        // A single unit taller than a full page (pathological). Place it
        // anyway so we never loop forever; it slightly overflows the margin.
        fit = 1;
      } else {
        newPage(cursor);
        continue;
      }
    }

    const lineStart = units.slice(0, start).reduce((a, b) => a + b, 0);
    const lineCount = units.slice(start, start + fit).reduce((a, b) => a + b, 0);
    const portion: LayoutBlock = {
      ...block,
      lines: block.lines.slice(lineStart, lineStart + lineCount),
      gapBefore: firstPortion ? block.gapBefore : 0,
      units: units.slice(start, start + fit),
    };
    placeBlock(cursor, portion, metrics);
    start += fit;
    firstPortion = false;
    if (start < totalUnits) newPage(cursor);
  }
}

/** Height of the tail's smallest sensible first portion (head + first item). */
function firstPortionHeight(block: LayoutBlock, metrics: LayoutMetrics): number {
  const units = block.units && block.units.length > 0 ? block.units : [block.lines.length];
  const take = units.length > 1 ? units[0] + units[1] : units[0];
  return block.lines.slice(0, take).reduce((sum, line) => sum + metrics.lineHeight(line.size), 0);
}

/** Paginates blocks with keep-together + entry-boundary rules. */
export function paginate(blocks: LayoutBlock[], metrics: LayoutMetrics): PageLayout {
  const cursor: Cursor = { pages: [[]], y: 0 };
  const usable = metrics.usableHeight;

  let i = 0;
  while (i < blocks.length) {
    // Build a keep-with-next group (section heading + its first entry, etc).
    const group: LayoutBlock[] = [blocks[i]];
    while (blocks[i].keepWithNext && i + 1 < blocks.length) {
      i += 1;
      group.push(blocks[i]);
    }
    i += 1;

    const height = groupHeight(group, metrics);
    const pageHasContent = cursor.pages[cursor.pages.length - 1].length > 0;

    if (height <= usable) {
      if (cursor.y + height > usable + 1e-6 && pageHasContent) newPage(cursor);
      for (const block of group) placeBlock(cursor, block, metrics);
    } else {
      // The group is taller than one page. Leaders (keep-with-next blocks
      // such as the section heading) must stay attached to the first portion
      // of the tail block; the tail splits only at unit boundaries.
      const leaders = group.slice(0, -1);
      const tail = group[group.length - 1];
      const leaderH = groupHeight(leaders, metrics);
      const tailH = blockHeight(tail, metrics);
      const minStart = leaderH + Math.min(tailH, firstPortionHeight(tail, metrics));

      if (cursor.y + minStart > usable + 1e-6 && pageHasContent) newPage(cursor);
      for (const leader of leaders) placeBlock(cursor, leader, metrics);
      if (cursor.y + tailH <= usable + 1e-6) {
        placeBlock(cursor, tail, metrics);
      } else {
        placeOversizeBlock(cursor, tail, metrics);
      }
    }
  }

  const lastPage = cursor.pages[cursor.pages.length - 1];
  const lastPageHeight = lastPage.reduce((sum, block) => sum + blockHeight(block, metrics), 0);
  const pages = cursor.pages.filter((page, idx) => page.length > 0 || idx === 0);
  return {
    pages,
    lastPageHeight,
    overflowFraction: pages.length > 1 ? lastPageHeight / usable : 0,
    density: metrics.gapScale ?? 1,
    tightened: false,
  };
}

export interface AutoFitOptions {
  /** Maximum last-page spill (fraction of a page) eligible for tightening. */
  maxOverflowFraction?: number;
  /** Density steps tried in order (line-height and gap scale). */
  densitySteps?: number[];
}

/**
 * Paginates at the base density, then — when content spills only slightly
 * onto one extra page — retries with tightened line-height/spacing. This
 * handles both the one-line second-page case and a sparse third page after an
 * otherwise valid two-page résumé. Font sizes never change.
 */
export function paginateWithAutoFit(
  blocks: LayoutBlock[],
  metrics: LayoutMetrics,
  options: AutoFitOptions = {},
): PageLayout {
  const maxOverflow = options.maxOverflowFraction ?? ATS_PDF_SPEC.maxAutoFitOverflow;
  const steps = options.densitySteps ?? [...ATS_PDF_SPEC.densitySteps];

  const base = paginate(blocks, metrics);
  const eligibleOverflow = base.pages.length === 2
    ? maxOverflow
    : ATS_PDF_SPEC.maxSparseTailOverflow;
  if (base.pages.length > 1 && base.overflowFraction <= eligibleOverflow) {
    for (const density of steps) {
      const scaled: LayoutMetrics = {
        usableHeight: metrics.usableHeight,
        lineHeight: (size) => metrics.lineHeight(size) * density,
        gapScale: density,
      };
      const attempt = paginate(blocks, scaled);
      if (attempt.pages.length < base.pages.length) {
        return { ...attempt, density, tightened: true };
      }
    }
  }
  return base;
}

// ─── Flat resume lines → layout blocks ──────────────────────────────────────

const HEADING_RX = /^(PROFESSIONAL |TECHNICAL |WORK )?(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|PROJECT|CERTIFICATIONS|LANGUAGES|PROFILE|VOLUNTEER( EXPERIENCE)?|AWARDS?( & PUBLICATIONS)?|PUBLICATIONS|WORK HISTORY|EMPLOYMENT HISTORY|REFERENCES)$/i;

const ENTRY_SECTION_RX = /(EXPERIENCE|EDUCATION|PROJECT|CERTIFICATION|VOLUNTEER|AWARDS|PUBLICATION|EMPLOYMENT|WORK HISTORY)/i;

const BULLET_RX = /^\s*(?:[•\u2022\u25CF\u25AA\-*]|\d+[.)])\s+/;
const NON_ENTRY_SECTION_RX = /(SUMMARY|SKILLS|LANGUAGES|PROFILE|REFERENCES)/i;

export interface BlockBuilderOptions {
  /** Wraps text into lines fitting the content width minus the given indent. */
  wrap: (text: string, size: number, style: FontStyle, indentPt?: number) => string[];
  nameSize?: number;
  headingSize?: number;
  bodySize?: number;
  smallSize?: number;
  entryGapPt?: number;
  sectionGapPt?: number;
  bulletIndentPt?: number;
}

function cleanLine(raw: string): string {
  return raw
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\s+$/, "");
}

/**
 * Converts the flat line conventions produced by the resume adapters
 * (CAPS headings, "• "-prefixed bullets, blank-line separators) into atomic
 * layout blocks with keep-together metadata.
 */
export function blocksFromResumeLines(lines: string[], options: BlockBuilderOptions): LayoutBlock[] {
  const {
    wrap,
    nameSize = ATS_PDF_SPEC.nameSize,
    headingSize = ATS_PDF_SPEC.headingSize,
    bodySize = ATS_PDF_SPEC.bodySize,
    smallSize = ATS_PDF_SPEC.smallSize,
    entryGapPt = ATS_PDF_SPEC.entryGapPt,
    sectionGapPt = ATS_PDF_SPEC.sectionGapPt,
    bulletIndentPt = 12,
  } = options;

  const blocks: LayoutBlock[] = [];
  let seenHeading = false;
  let seenName = false;
  let seenContact = false;
  let inEntrySection = false;
  let openEntry: LayoutBlock | null = null;
  let pendingGap = 0;

  const closeEntry = () => {
    if (openEntry && openEntry.lines.length > 0) blocks.push(openEntry);
    openEntry = null;
  };

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line.trim()) {
      pendingGap = Math.min(pendingGap + 6, 12);
      continue;
    }

    // Canonical artifact lines use Markdown headings so arbitrary user-named
    // custom sections are recognized as real headings instead of body text.
    const markdownHeading = /^#{2,6}\s+\S/.test(raw.trim());
    if (markdownHeading || HEADING_RX.test(line.trim())) {
      closeEntry();
      seenHeading = true;
      inEntrySection = markdownHeading
        ? !NON_ENTRY_SECTION_RX.test(line)
        : ENTRY_SECTION_RX.test(line);
      blocks.push({
        kind: "heading",
        lines: [{ text: line.trim().toUpperCase(), size: headingSize, style: "bold" }],
        gapBefore: (seenName ? sectionGapPt : 0) + pendingGap,
        keepWithNext: true,
      });
      pendingGap = 0;
      continue;
    }

    if (!seenName) {
      seenName = true;
      blocks.push({
        kind: "name",
        lines: [{ text: line.trim(), size: nameSize, style: "bold" }],
        gapBefore: 0,
        keepWithNext: true,
      });
      pendingGap = 0;
      continue;
    }

    if (!seenHeading && !seenContact) {
      seenContact = true;
      blocks.push({
        kind: "contact",
        lines: wrap(line.trim(), smallSize, "regular").map((text) => ({ text, size: smallSize, style: "regular" as FontStyle })),
        gapBefore: 2,
      });
      pendingGap = 0;
      continue;
    }

    const bulletMatch = line.match(BULLET_RX);
    if (inEntrySection) {
      if (bulletMatch) {
        // A bullet belongs to the currently open entry (or starts one).
        const text = `• ${line.replace(BULLET_RX, "").trim()}`;
        const wrapped = wrap(text, bodySize, "regular", bulletIndentPt).map((t) => ({
          text: t,
          size: bodySize,
          style: "regular" as FontStyle,
          indent: bulletIndentPt,
        }));
        if (!openEntry) {
          openEntry = { kind: "entry", lines: [], gapBefore: pendingGap, units: [] };
        }
        openEntry.lines.push(...wrapped);
        openEntry.units!.push(wrapped.length);
        pendingGap = 0;
      } else {
        // A new entry head (role · company · dates, degree · school, ...).
        closeEntry();
        const wrapped = wrap(line.trim(), bodySize, "bold").map((t) => ({
          text: t,
          size: bodySize,
          style: "bold" as FontStyle,
        }));
        openEntry = {
          kind: "entry",
          lines: [...wrapped],
          gapBefore: pendingGap,
          units: [wrapped.length],
        };
        pendingGap = 0;
      }
      continue;
    }

    // Free text (summary paragraph, skills line, languages, ...). Bullets in
    // non-entry sections stay atomic too — one text block per source line.
    closeEntry();
    const text = bulletMatch ? `• ${line.replace(BULLET_RX, "").trim()}` : line.trim();
    const wrapped = wrap(text, bodySize, "regular", bulletMatch ? bulletIndentPt : 0).map((t) => ({
      text: t,
      size: bodySize,
      style: "regular" as FontStyle,
      indent: bulletMatch ? bulletIndentPt : 0,
    }));
    blocks.push({
      kind: "text",
      lines: wrapped,
      gapBefore: pendingGap,
      units: wrapped.map(() => 1),
    });
    pendingGap = 0;
  }

  closeEntry();
  return blocks;
}

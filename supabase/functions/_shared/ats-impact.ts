/**
 * Impact (quantified achievement) scoring shared by ATS functions.
 *
 * Root-cause notes (QA 2026-07): the previous inline implementation in
 * career-ops-ats mapped the RAW ratio of digit-containing experience bullets
 * straight onto 0-100. That had two failure modes:
 *   1. Calibration — the product's own guidance (ats-score-v2 issue "x5")
 *      treats >=40% quantified bullets as healthy, yet a resume at exactly
 *      that bar scored dim_impact = 40 and anything below cratered the
 *      composite. A strong resume whose metrics sit in a handful of bullets
 *      could legitimately show single-digit impact.
 *   2. Extraction — only `experience[].bullets` string arrays were counted.
 *      Bullets stored as objects ({ text }), multi-line `description` /
 *      `responsibilities` blocks, and the entire `projects` section (where
 *      ML/consulting resumes often keep their quantified work) were either
 *      dropped or counted as unquantified noise in the denominator.
 *
 * This module fixes both: it extracts bullets defensively from every
 * achievement-bearing section and grants full credit once the quantified
 * ratio reaches IMPACT_FULL_CREDIT_RATIO, scaling linearly below it.
 */

/** Ratio of quantified bullets that earns a 100 impact score. Mirrors the
 * ">= 40% of bullets should carry a metric" rule used by ats-score-v2. */
export const IMPACT_FULL_CREDIT_RATIO = 0.4;

/** Digits cover %, $, counts, and magnitudes ("10M+", "5k"). The spelled
 * forms catch bullets whose numbers were written out. */
const METRIC_RX = new RegExp(
  [
    "\\d",
    "\\b(?:million|billion|thousand)s?\\b",
    "\\b(?:tens|hundreds|thousands|millions|billions)\\b",
    "\\b(?:doubled|tripled|quadrupled|halved)\\b",
  ].join("|"),
  "i",
);

export function isQuantifiedBullet(bullet: string): boolean {
  return METRIC_RX.test(bullet);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Bullets may be plain strings or editor objects ({ text: "..." }). */
function toBulletText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const record = asRecord(value);
  if (record) {
    for (const key of ["text", "content", "value", "bullet", "description"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

/** A single field can hold several bullets separated by newlines or "•". */
function splitBulletBlock(value: string): string[] {
  return value
    .split(/\r?\n+|•/)
    .map((item) => item.replace(/^[-–—*\s]+/, "").trim())
    .filter((item) => item.length > 0);
}

/**
 * Extract the achievement bullets for one experience/project entry.
 * Order of precedence matches the resume editor: explicit bullet arrays
 * first, then prose fields split into lines.
 */
export function extractEntryBullets(entry: unknown): string[] {
  const record = asRecord(entry);
  if (!record) return [];
  const collected: string[] = [];
  for (const key of ["bullets", "achievements", "highlights"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = toBulletText(item);
        if (text) collected.push(...splitBulletBlock(text));
      }
    } else if (typeof value === "string" && value.trim()) {
      collected.push(...splitBulletBlock(value));
    }
  }
  if (collected.length === 0) {
    for (const key of ["description", "responsibilities"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        collected.push(...splitBulletBlock(value));
      }
    }
  }
  return collected;
}

/** Every achievement bullet on the resume: experience plus projects. */
export function collectImpactBullets(resume: Record<string, unknown>): string[] {
  const bullets: string[] = [];
  for (const key of ["experience", "projects"]) {
    const section = resume[key];
    if (Array.isArray(section)) {
      for (const entry of section) bullets.push(...extractEntryBullets(entry));
    }
  }
  return bullets;
}

export interface ImpactScore {
  /** 0-100; 100 once quantifiedRatio >= IMPACT_FULL_CREDIT_RATIO. */
  score: number;
  quantified: number;
  total: number;
}

export function computeImpactScore(bullets: string[]): ImpactScore {
  const total = bullets.length;
  if (total === 0) return { score: 0, quantified: 0, total: 0 };
  const quantified = bullets.filter(isQuantifiedBullet).length;
  const ratio = quantified / total;
  const score = Math.min(100, Math.round((ratio / IMPACT_FULL_CREDIT_RATIO) * 100));
  return { score, quantified, total };
}

/**
 * Shared deterministic ATS scoring, extracted verbatim from career-ops-ats so
 * other functions can score a resume against the SAME scale that writes
 * public.ats_scores rows (weighted six dimensions, 0-100 overall).
 *
 * Used by career-ops-tailor-report to compute the "before" score of the master
 * resume so it is directly comparable with the stored "after" score of the
 * tailored resume. career-ops-ats keeps its own inline copy for now; adopting
 * this shared module there is a follow-up (no behavior change intended).
 */

import {
  collectImpactBullets, computeImpactScore, extractEntryBullets, IMPACT_FULL_CREDIT_RATIO,
} from "./ats-impact.ts";
import { ATS_PDF_SPEC } from "./resume-pdf-layout.ts";

export const ATS_WEIGHTS = { format: 0.15, keywords: 0.25, experience: 0.25, skills: 0.15, education: 0.05, impact: 0.15 } as const;

const STRONG_VERBS = new Set([
  "led", "built", "shipped", "designed", "architected", "scaled",
  "launched", "drove", "owned", "delivered", "migrated", "automated",
  "reduced", "improved", "grew", "optimized", "refactored", "rolled",
  "negotiated", "mentored", "hired", "coached", "authored", "published",
  "prototyped", "analyzed", "implemented", "integrated", "deployed",
  "reviewed", "resolved", "debugged", "instrumented", "partnered",
]);

const WEAK_PREFIXES = [
  "responsible for", "worked on", "helped", "assisted", "participated",
  "involved in", "duties included", "tasked with",
];

export const ATS_STOP_WORDS = new Set(["and", "the", "for", "with", "from", "into", "using", "such", "including", "end", "full", "large", "scale"]);

export function analyseBullet(b: string): { issues: string[]; score: number } {
  const issues: string[] = [];
  const bt = b.trim();
  if (!bt) return { issues: ["empty bullet"], score: 0 };
  if (bt.length > 220) issues.push("too long (>220 chars)");
  if (bt.length < 40) issues.push("too short (<40 chars) — add impact");
  const first = (bt.split(/\s+/, 1)[0] || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!STRONG_VERBS.has(first)) issues.push(`starts with "${first}" — prefer an action verb`);
  for (const p of WEAK_PREFIXES) if (bt.toLowerCase().startsWith(p)) issues.push(`weak opener "${p}"`);
  if (!/\d/.test(bt)) issues.push("no numbers — quantify when possible");
  const score = Math.max(0, 100 - issues.length * 18);
  return { issues, score };
}

export interface DetReport {
  format: number;
  experience: number;
  education: number;
  skills: number;
  impact: number;
  issues: Array<{ scope: string; where: string; message: string }>;
  bullets: string[];
}

// deno-lint-ignore no-explicit-any
export function deterministicAnalysis(resume: any): DetReport {
  const issues: DetReport["issues"] = [];
  let formatScore = 100;

  const hasSummary = Boolean(resume.summary || resume.personal_info?.summary);
  const hasExperience = Array.isArray(resume.experience) && resume.experience.length > 0;
  const hasEducation = Array.isArray(resume.education) && resume.education.length > 0;
  const skillList = flattenSkills(resume.skills);
  const hasSkills = skillList.length > 0;

  if (!hasSummary) { issues.push({ scope: "format", where: "summary", message: "no summary/about section" }); formatScore -= 10; }
  if (!hasExperience) { issues.push({ scope: "format", where: "experience", message: "no experience section" }); formatScore -= 30; }
  if (!hasEducation) { issues.push({ scope: "format", where: "education", message: "no education section" }); formatScore -= 10; }
  if (!hasSkills) { issues.push({ scope: "format", where: "skills", message: "no skills section" }); formatScore -= 15; }

  const bulletScores: number[] = [];
  const allBullets: string[] = [];
  if (hasExperience) {
    for (const x of resume.experience) {
      const bullets = extractEntryBullets(x);
      for (const b of bullets) {
        allBullets.push(b);
        const a = analyseBullet(b);
        bulletScores.push(a.score);
        for (const i of a.issues) issues.push({
          scope: "experience",
          where: `${x.company_or_client ?? x.company ?? ""} — ${x.role ?? x.title ?? ""}`,
          message: i,
        });
      }
    }
  }
  const bulletAvg = bulletScores.length ? bulletScores.reduce((s, n) => s + n, 0) / bulletScores.length : 0;

  const impact = computeImpactScore(collectImpactBullets(resume));
  if (impact.total > 0 && impact.quantified / impact.total < IMPACT_FULL_CREDIT_RATIO) {
    issues.push({ scope: "impact", where: "experience", message: `only ${impact.quantified}/${impact.total} bullets are quantified` });
  }

  // Pagination/format risk signal — surfaced as a format issue only, with no
  // additional score penalty beyond the existing deductions.
  const pagination = estimatePaginationRisk(resume);
  for (const message of pagination.issues) {
    issues.push({ scope: "format", where: "pagination", message });
  }

  return {
    format: Math.max(0, Math.min(100, Math.round(formatScore))),
    experience: Math.max(0, Math.min(100, Math.round(bulletAvg))),
    education: hasEducation ? 90 : 40,
    skills: hasSkills ? Math.min(100, skillList.length * 8) : 0,
    impact: impact.score,
    issues,
    bullets: allBullets,
  };
}

// deno-lint-ignore no-explicit-any
export function flattenSkills(skills: any): string[] {
  if (Array.isArray(skills)) {
    return skills.map((skill) => typeof skill === "string" ? skill : String(skill?.name || "")).filter(Boolean);
  }
  if (skills && typeof skills === "object") {
    return Object.values(skills as Record<string, unknown>)
      .flatMap((value) => Array.isArray(value) ? value.map(String) : [])
      .filter(Boolean);
  }
  return [];
}

export function computeKeywordScore(resumeText: string, keywords: string[]): {
  score: number; matched: string[]; missing: string[];
} {
  const normalizedResume = normalizeForMatch(resumeText);
  const paddedResume = ` ${normalizedResume} `;
  const resumeTokens = new Set(normalizedResume.split(" ").filter(Boolean));
  const matched: string[] = [];
  const missing: string[] = [];
  let earned = 0;
  for (const k of keywords) {
    const needle = normalizeForMatch(k);
    if (!needle) continue;
    if (paddedResume.includes(` ${needle} `)) {
      matched.push(k);
      earned += 1;
      continue;
    }
    const tokens = needle.split(" ").filter((token) => token.length > 1 && !ATS_STOP_WORDS.has(token));
    const coverage = tokens.length > 0
      ? tokens.filter((token) => resumeTokens.has(token)).length / tokens.length
      : 0;
    earned += coverage;
    if (coverage >= 0.7) matched.push(k);
    else missing.push(k);
  }
  const score = keywords.length ? Math.round((earned / keywords.length) * 100) : 0;
  return { score, matched, missing };
}

export function normalizeForMatch(value: string): string {
  // A trailing sentence period must not glue to the final token ("systems."
  // ≠ "systems"), while interior dots in names like "Node.js"/".NET" stay.
  return value.toLowerCase()
    .replace(/\.(?![a-z0-9+#])/gi, " ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Pagination / format risk estimation ────────────────────────────────────
//
// The scorer cannot see the rendered PDF, so it estimates rendered height from
// content length vs the shared ATS_PDF_SPEC template metrics. Used to surface
// page-overflow / entry-split risks as FORMAT ISSUES (no extra score penalty).

export interface PaginationRisk {
  /** Estimated number of rendered pages at base density. */
  estimatedPages: number;
  /** Fraction of a page spilling onto the last page (0 when it fits one page). */
  overflowFraction: number;
  /**
   * one-page       — fits comfortably;
   * spill          — slightly over one page (auto-tightenable at render time);
   * multi-page     — genuinely longer than one page (paginates at entry bounds);
   * oversize-entry — a single entry is taller than a page and must split.
   */
  risk: "one-page" | "spill" | "multi-page" | "oversize-entry";
  issues: string[];
}

// deno-lint-ignore no-explicit-any
export function estimatePaginationRisk(resume: any): PaginationRisk {
  const spec = ATS_PDF_SPEC;
  const usable = spec.pageHeightPt - spec.marginPt * 2;
  const contentWidth = spec.pageWidthPt - spec.marginPt * 2;
  const lh = (size: number) => size * spec.lineHeightScale;
  // Average Helvetica glyph width ≈ 0.5em → chars per wrapped line.
  const charsPerLine = (size: number, indentPt = 0) =>
    Math.max(20, Math.floor((contentWidth - indentPt) / (size * 0.5)));
  const wrapLines = (value: string, size: number, indentPt = 0) =>
    Math.max(1, Math.ceil(value.length / charsPerLine(size, indentPt)));

  let height = 0;
  height += lh(spec.nameSize) + lh(spec.smallSize) + 8; // name + contact + header gap
  const sectionOverhead = lh(spec.headingSize) + spec.sectionGapPt + 4;

  const summary = String(resume?.summary ?? resume?.personal_info?.summary ?? "").trim();
  if (summary) height += sectionOverhead + wrapLines(summary, spec.bodySize) * lh(spec.bodySize);

  let tallestEntry = 0;
  const experience = Array.isArray(resume?.experience) ? resume.experience : [];
  if (experience.length > 0) height += sectionOverhead;
  for (const entry of experience) {
    let h = lh(spec.bodySize) + spec.entryGapPt; // entry head line
    const bullets = extractEntryBullets(entry);
    for (const bullet of bullets) h += wrapLines(bullet, spec.bodySize, 12) * lh(spec.bodySize);
    height += h;
    if (h > tallestEntry) tallestEntry = h;
  }

  const education = Array.isArray(resume?.education) ? resume.education : [];
  if (education.length > 0) height += sectionOverhead + education.length * (lh(spec.bodySize) + 3);

  const skills = flattenSkills(resume?.skills);
  if (skills.length > 0) {
    height += sectionOverhead + wrapLines(skills.join(", "), spec.bodySize) * lh(spec.bodySize);
  }

  const projects = Array.isArray(resume?.projects) ? resume.projects : [];
  if (projects.length > 0) height += sectionOverhead;
  for (const project of projects) {
    let h = lh(spec.bodySize) + spec.entryGapPt;
    const bullets = Array.isArray(project?.bullets) ? project.bullets : [];
    for (const bullet of bullets) h += wrapLines(String(bullet), spec.bodySize, 12) * lh(spec.bodySize);
    height += h;
    if (h > tallestEntry) tallestEntry = h;
  }

  const estimatedPages = Math.max(1, Math.ceil(height / usable - 1e-9));
  const spillHeight = height - (estimatedPages - 1) * usable;
  const overflowFraction = estimatedPages > 1 ? spillHeight / usable : 0;

  const issues: string[] = [];
  let risk: PaginationRisk["risk"] = "one-page";
  if (tallestEntry > usable) {
    risk = "oversize-entry";
    issues.push(
      "one experience/project entry is taller than a full page — it will split across pages at a bullet boundary; split it into two entries or trim bullets",
    );
  } else if (estimatedPages === 2 && overflowFraction <= 0.12) {
    risk = "spill";
    issues.push(
      `content slightly exceeds one page (~${Math.round(overflowFraction * 100)}% spill) — the PDF export auto-tightens spacing to fit; trim a line or two to be safe`,
    );
  } else if (estimatedPages > 1) {
    risk = "multi-page";
    issues.push(
      `content runs to ~${estimatedPages} pages — pagination breaks at entry boundaries; keep it to one page unless you have 10+ years of experience`,
    );
  }

  return { estimatedPages, overflowFraction, risk, issues };
}

// deno-lint-ignore no-explicit-any
export function resumeToPlainText(r: any): string {
  const parts: string[] = [];
  const personal = r.personal_info && typeof r.personal_info === "object" ? r.personal_info : {};
  parts.push(`${personal.fullName ?? personal.name ?? ""} ${personal.title ?? ""} ${personal.location ?? ""}`);
  if (r.summary || r.personal_info?.summary) parts.push(r.summary || r.personal_info.summary);
  if (Array.isArray(r.experience)) for (const x of r.experience) {
    parts.push(`${x.role ?? x.title ?? ""} ${x.company_or_client ?? x.company ?? ""}`);
    if (Array.isArray(x.bullets)) parts.push(x.bullets.join(" "));
    else if (x.description) parts.push(x.description);
  }
  const skills = flattenSkills(r.skills);
  if (skills.length > 0) parts.push(skills.join(" "));
  // deno-lint-ignore no-explicit-any
  if (Array.isArray(r.projects)) parts.push(r.projects.map((p: any) =>
    `${p.title ?? p.name ?? ""} ${p.organization ?? ""} ${p.description ?? ""} ${Array.isArray(p.bullets) ? p.bullets.join(" ") : ""}`,
  ).join(" "));
  return parts.join("\n");
}

export interface AtsDimensionScores {
  overall: number;
  dim_format: number;
  dim_keywords: number;
  dim_experience: number;
  dim_skills: number;
  dim_education: number;
  dim_impact: number;
  matched_keywords: string[];
  missing_keywords: string[];
}

/** Weighted 0-100 score identical to the row career-ops-ats writes to ats_scores. */
// deno-lint-ignore no-explicit-any
export function scoreResumeDeterministic(resume: any, jdKeywords: string[]): AtsDimensionScores {
  const det = deterministicAnalysis(resume);
  const resumeText = resumeToPlainText(resume);
  const kw = computeKeywordScore(resumeText, jdKeywords);
  const overall =
    det.format * ATS_WEIGHTS.format +
    kw.score * ATS_WEIGHTS.keywords +
    det.experience * ATS_WEIGHTS.experience +
    det.skills * ATS_WEIGHTS.skills +
    det.education * ATS_WEIGHTS.education +
    det.impact * ATS_WEIGHTS.impact;
  return {
    overall: Math.round(overall * 10) / 10,
    dim_format: det.format,
    dim_keywords: kw.score,
    dim_experience: det.experience,
    dim_skills: det.skills,
    dim_education: det.education,
    dim_impact: det.impact,
    matched_keywords: kw.matched,
    missing_keywords: kw.missing,
  };
}

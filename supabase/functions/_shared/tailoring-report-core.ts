/**
 * tailoring-report-core — pure, dependency-free logic for the "what changed"
 * tailoring report. Imported by:
 *   - supabase/functions/career-ops-tailor-report (Deno edge function)
 *   - src/components/TailoringReportCard.tsx (word-level diff highlighting)
 *   - src/test/tailoring-diff.test.ts (unit tests)
 * Keep this module free of Deno-, DOM-, and node-specific APIs.
 */

// ── Types ─────────────────────────────────────────────────────────

export type TailoringChangeType =
  | "summary_rewritten"
  | "bullet_rephrased"
  | "bullet_reordered"
  | "skills_reordered"
  | "keyword_added"
  | "section_added";

export interface TailoringChange {
  type: TailoringChangeType;
  section: string;
  entry_id: string | null;
  entry_label: string | null;
  bullet_index: number | null;
  before: string | null;
  after: string | null;
  jd_keywords: string[];
}

export interface KeywordDelta {
  /** JD keywords now matched that were NOT present in the master resume. */
  added: string[];
  /** JD keywords now matched that the master resume already contained. */
  covered_now: string[];
  /** JD keywords still missing after tailoring. */
  still_missing: string[];
}

export interface TailoringReport {
  draft_application_id: string;
  master_resume_id: string | null;
  tailored_resume_id: string | null;
  ats_before: number | null;
  ats_after: number | null;
  keyword_delta: KeywordDelta;
  changes: TailoringChange[];
  model: string;
  generated_at: string;
}

// ── Request validation ────────────────────────────────────────────

export class TailoringReportRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "TailoringReportRequestError";
  }
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TailorReportRequest {
  draft_application_id: string;
  refresh: boolean;
  user_id?: string;
}

/** Parse + validate the edge-function request body. Throws TailoringReportRequestError. */
export function validateTailorReportRequest(body: unknown): TailorReportRequest {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const rawId = record.draft_application_id;
  if (typeof rawId !== "string" || !rawId.trim()) {
    throw new TailoringReportRequestError(400, "draft_application_id required");
  }
  const draftApplicationId = rawId.trim();
  if (!UUID_RX.test(draftApplicationId)) {
    throw new TailoringReportRequestError(400, "draft_application_id must be a uuid");
  }
  const request: TailorReportRequest = {
    draft_application_id: draftApplicationId,
    refresh: record.refresh === true,
  };
  if (typeof record.user_id === "string" && UUID_RX.test(record.user_id)) {
    request.user_id = record.user_id;
  }
  return request;
}

// ── Change builder ────────────────────────────────────────────────

type Json = Record<string, unknown>;

function asArray(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((item): item is Json => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

/** JD keywords that appear in `after` but not in `before` (case-insensitive). */
function keywordsIntroduced(before: string | null, after: string | null, jdKeywords: string[]): string[] {
  if (!after) return [];
  const afterNorm = normalizeKeyword(after);
  const beforeNorm = before ? normalizeKeyword(before) : "";
  const hits: string[] = [];
  for (const keyword of jdKeywords) {
    const needle = normalizeKeyword(keyword);
    if (!needle) continue;
    if (afterNorm.includes(needle) && !beforeNorm.includes(needle)) hits.push(keyword);
  }
  return hits;
}

function entryBullets(entry: Json): string[] {
  if (Array.isArray(entry.bullets)) return entry.bullets.map((b) => String(b).trim()).filter(Boolean);
  const description = asString(entry.description);
  return description ? [description] : [];
}

function entryLabel(entry: Json): string {
  const role = asString(entry.role ?? entry.title ?? entry.name);
  const org = asString(entry.company_or_client ?? entry.company ?? entry.organization);
  return [role, org].filter(Boolean).join(" — ");
}

function entryId(entry: Json, index: number, prefix: string): string {
  const id = asString(entry.id);
  return id || `${prefix}-${index}`;
}

/** Word-set Jaccard similarity on normalized text, 0..1. */
export function bulletSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const word of wordsA) if (wordsB.has(word)) intersection += 1;
  return intersection / (wordsA.size + wordsB.size - intersection);
}

const REPHRASE_MATCH_THRESHOLD = 0.35;

/**
 * Pair each tailored bullet with the most similar master bullet in the same
 * entry (greedy, each master bullet used once). Returns [tailoredIndex,
 * masterIndex | null] pairs in tailored order.
 */
export function pairBullets(masterBullets: string[], tailoredBullets: string[]): Array<[number, number | null]> {
  const used = new Set<number>();
  return tailoredBullets.map((tailored, ti) => {
    let best: number | null = null;
    let bestScore = 0;
    masterBullets.forEach((master, mi) => {
      if (used.has(mi)) return;
      const score = bulletSimilarity(master, tailored);
      if (score > bestScore) { best = mi; bestScore = score; }
    });
    if (best !== null && bestScore >= REPHRASE_MATCH_THRESHOLD) {
      used.add(best);
      return [ti, best];
    }
    return [ti, null];
  });
}

function diffBulletEntry(
  section: string,
  id: string,
  label: string,
  masterEntry: Json,
  tailoredEntry: Json,
  jdKeywords: string[],
): TailoringChange[] {
  const changes: TailoringChange[] = [];
  const masterBullets = entryBullets(masterEntry);
  const tailoredBullets = entryBullets(tailoredEntry);
  if (masterBullets.length === 0 && tailoredBullets.length === 0) return changes;

  const masterNorm = masterBullets.map(normalizeText);
  const tailoredNorm = tailoredBullets.map(normalizeText);

  // Pure reorder: identical bullet multiset, different order.
  const sameMultiset = masterNorm.length === tailoredNorm.length
    && [...masterNorm].sort().join("") === [...tailoredNorm].sort().join("");
  if (sameMultiset && masterNorm.join("") !== tailoredNorm.join("")) {
    const afterList = tailoredBullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
    const beforeList = masterBullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
    changes.push({
      type: "bullet_reordered",
      section,
      entry_id: id,
      entry_label: label,
      bullet_index: null,
      before: beforeList,
      after: afterList,
      jd_keywords: keywordsIntroduced(null, afterList, jdKeywords),
    });
    return changes;
  }

  for (const [ti, mi] of pairBullets(masterBullets, tailoredBullets)) {
    const after = tailoredBullets[ti];
    const before = mi === null ? null : masterBullets[mi];
    if (before !== null && normalizeText(before) === normalizeText(after)) continue;
    const introduced = keywordsIntroduced(before, after, jdKeywords);
    const type: TailoringChangeType = before === null && introduced.length > 0
      ? "keyword_added"
      : "bullet_rephrased";
    changes.push({
      type,
      section,
      entry_id: id,
      entry_label: label,
      bullet_index: ti,
      before,
      after,
      jd_keywords: introduced,
    });
  }
  return changes;
}

function flattenSkillList(skills: unknown): string[] {
  if (Array.isArray(skills)) return skills.map((s) => String(s).trim()).filter(Boolean);
  if (skills && typeof skills === "object") {
    return Object.values(skills as Record<string, unknown>)
      .flatMap((value) => Array.isArray(value) ? value.map((s) => String(s).trim()) : [])
      .filter(Boolean);
  }
  return [];
}

/** Build the structured change list between a master and a tailored resume row. */
// deno-lint-ignore no-explicit-any
export function buildTailoringChanges(master: any, tailored: any, jdKeywords: string[] = []): TailoringChange[] {
  const changes: TailoringChange[] = [];

  // Summary
  const masterSummary = asString(master?.summary ?? master?.personal_info?.summary);
  const tailoredSummary = asString(tailored?.summary ?? tailored?.personal_info?.summary);
  if (tailoredSummary && normalizeText(masterSummary) !== normalizeText(tailoredSummary)) {
    changes.push({
      type: masterSummary ? "summary_rewritten" : "section_added",
      section: "summary",
      entry_id: null,
      entry_label: "Professional summary",
      bullet_index: null,
      before: masterSummary || null,
      after: tailoredSummary,
      jd_keywords: keywordsIntroduced(masterSummary || null, tailoredSummary, jdKeywords),
    });
  }

  // Experience + projects: match by stable entry id (pinned by the tailor's
  // sanitizer), falling back to position when ids are absent.
  for (const [section, prefix] of [["experience", "exp"], ["projects", "proj"]] as const) {
    const masterEntries = asArray(master?.[section]);
    const tailoredEntries = asArray(tailored?.[section]);
    const masterById = new Map(masterEntries.map((entry, i) => [entryId(entry, i, prefix), entry]));
    for (let ti = 0; ti < tailoredEntries.length; ti += 1) {
      const tailoredEntry = tailoredEntries[ti];
      const id = entryId(tailoredEntry, ti, prefix);
      const masterEntry = masterById.get(id) ?? masterEntries[ti];
      if (!masterEntry) {
        changes.push({
          type: "section_added",
          section,
          entry_id: id,
          entry_label: entryLabel(tailoredEntry),
          bullet_index: null,
          before: null,
          after: entryBullets(tailoredEntry).join("\n"),
          jd_keywords: keywordsIntroduced(null, entryBullets(tailoredEntry).join("\n"), jdKeywords),
        });
        continue;
      }
      changes.push(...diffBulletEntry(section, id, entryLabel(tailoredEntry) || entryLabel(masterEntry), masterEntry, tailoredEntry, jdKeywords));
    }
  }

  // Skills: tailoring returns a reordered, job-relevant subset of the source.
  const masterSkills = flattenSkillList(master?.skills);
  const tailoredSkills = flattenSkillList(tailored?.skills);
  const masterSkillNorm = masterSkills.map(normalizeText);
  const tailoredSkillNorm = tailoredSkills.map(normalizeText);
  const sameSkillSet = masterSkillNorm.length === tailoredSkillNorm.length
    && [...masterSkillNorm].sort().join("") === [...tailoredSkillNorm].sort().join("");
  if (tailoredSkills.length > 0 && masterSkills.length === 0) {
    changes.push({
      type: "section_added",
      section: "skills",
      entry_id: null,
      entry_label: "Skills",
      bullet_index: null,
      before: null,
      after: tailoredSkills.join(", "),
      jd_keywords: keywordsIntroduced(null, tailoredSkills.join(", "), jdKeywords),
    });
  } else if (sameSkillSet && masterSkillNorm.join("") !== tailoredSkillNorm.join("")) {
    changes.push({
      type: "skills_reordered",
      section: "skills",
      entry_id: null,
      entry_label: "Skills",
      bullet_index: null,
      before: masterSkills.join(", "),
      after: tailoredSkills.join(", "),
      jd_keywords: [],
    });
  }

  return changes;
}

// ── Keyword delta ─────────────────────────────────────────────────

/**
 * Bucket the tailored resume's ATS keyword outcome against the master resume's
 * own text: which matched keywords are genuinely new coverage ("added"), which
 * the master already had ("covered_now"), and which are "still_missing".
 */
export function computeKeywordDelta(
  tailoredMatched: string[],
  tailoredMissing: string[],
  masterResumeText: string,
): KeywordDelta {
  const masterNorm = ` ${normalizeKeyword(masterResumeText)} `;
  const contains = (keyword: string): boolean => {
    const needle = normalizeKeyword(keyword);
    return Boolean(needle) && masterNorm.includes(` ${needle} `);
  };
  return {
    added: tailoredMatched.filter((k) => !contains(k)),
    covered_now: tailoredMatched.filter((k) => contains(k)),
    still_missing: [...tailoredMissing],
  };
}

// ── Word-level diff (UI highlighting) ─────────────────────────────

export type WordDiffKind = "same" | "added" | "removed";
export interface WordDiffToken { text: string; kind: WordDiffKind }

function tokenizeWords(value: string): string[] {
  return value.split(/(\s+)/).filter((part) => part.length > 0);
}

/**
 * Word-level LCS diff of two texts. Whitespace tokens are attached to the
 * preceding word's token kind so rendering stays contiguous. O(n*m) — bullets
 * are <100 words, so the full matrix is fine.
 */
export function wordDiff(before: string, after: string): { before: WordDiffToken[]; after: WordDiffToken[] } {
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const beforeTokens: WordDiffToken[] = [];
  const afterTokens: WordDiffToken[] = [];
  const push = (list: WordDiffToken[], text: string, kind: WordDiffKind) => {
    const last = list[list.length - 1];
    if (last && last.kind === kind) last.text += text;
    else list.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(beforeTokens, a[i], "same");
      push(afterTokens, b[j], "same");
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(beforeTokens, a[i], "removed");
      i += 1;
    } else {
      push(afterTokens, b[j], "added");
      j += 1;
    }
  }
  while (i < a.length) { push(beforeTokens, a[i], "removed"); i += 1; }
  while (j < b.length) { push(afterTokens, b[j], "added"); j += 1; }
  return { before: beforeTokens, after: afterTokens };
}

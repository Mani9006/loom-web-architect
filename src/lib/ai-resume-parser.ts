/* eslint-disable @typescript-eslint/no-explicit-any, no-control-regex, no-empty */
/**
 * Shared AI resume parsing utilities.
 * Extracted from ResumeBuilder.tsx to be reusable across the app.
 */

import {
  normalizeSkillCategory,
  type ResumeParseQuality,
  type SkillsObject,
} from "@/types/resume";

// ── Constants ────────────────────────────────────────────────────────────────

/** Max characters to send to the AI for resume parsing (≈12k tokens) */
const MAX_RESUME_TEXT_CHARS = 48_000;

/** Timeout for a single AI streaming request (90 seconds) */
const AI_STREAM_TIMEOUT_MS = 90_000;

/** Number of retry attempts for AI parsing */
const AI_MAX_RETRIES = 3;

/** Delay between retries in ms (doubles each attempt) */
const AI_RETRY_BASE_DELAY_MS = 2_000;

// ── Robust JSON extractor from AI text ───────────────────────────────────────

export function parseAIResponse(content: string): Record<string, any> | null {
  if (!content || content.trim().length === 0) return null;

  const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Strategy 1: Find matching braces with string/escape awareness
  const result = extractJsonByBraceMatching(cleaned);
  if (result) return result;

  // Strategy 2: If the response was truncated (incomplete JSON),
  // try to repair by closing open braces/brackets
  const repaired = tryRepairTruncatedJson(cleaned);
  if (repaired) return repaired;

  return null;
}

function extractJsonByBraceMatching(cleaned: string): Record<string, any> | null {
  let braceCount = 0,
    startIdx = -1,
    endIdx = -1,
    inString = false,
    escapeNext = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === "\\" && inString) { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === "{") { if (startIdx === -1) startIdx = i; braceCount++; }
      else if (char === "}") { braceCount--; if (braceCount === 0 && startIdx !== -1) { endIdx = i + 1; break; } }
    }
  }
  if (startIdx === -1 || endIdx === -1) return null;
  const jsonString = cleaned.substring(startIdx, endIdx);
  try { return JSON.parse(jsonString); } catch {}
  // Clean control chars and trailing commas, then retry
  try {
    return JSON.parse(
      jsonString.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,(\s*[}\]])/g, "$1"),
    );
  } catch {}
  return null;
}

/**
 * Attempt to repair truncated JSON by finding the start brace and
 * closing all unclosed brackets/braces.
 */
function tryRepairTruncatedJson(cleaned: string): Record<string, any> | null {
  const startIdx = cleaned.indexOf("{");
  if (startIdx === -1) return null;

  let json = cleaned.substring(startIdx);
  // Clean control characters
  json = json.replace(/[\x00-\x1F\x7F]/g, " ");
  // Remove trailing commas before we close
  json = json.replace(/,(\s*)$/, "$1");

  // Track open braces/brackets (respecting strings)
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === "\\" && inString) { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === "{") stack.push("}");
      else if (char === "[") stack.push("]");
      else if (char === "}" || char === "]") stack.pop();
    }
  }

  // If we're inside a string, close it first
  if (inString) {
    json += '"';
  }

  // Remove any trailing partial key-value pairs (e.g., `"key": "incomple`)
  // by removing content after the last complete value
  json = json.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");

  // Close all open containers
  while (stack.length > 0) {
    json += stack.pop();
  }

  // Remove trailing commas before closing brackets
  json = json.replace(/,(\s*[}\]])/g, "$1");

  try { return JSON.parse(json); } catch {}
  return null;
}

// ── Bullet point normalizer ──────────────────────────────────────────────────

export function formatBullets(responsibilities: string | string[]): string[] {
  if (!responsibilities) return [];
  if (Array.isArray(responsibilities))
    return responsibilities
      .filter((r) => r && r.trim())
      .map(cleanBulletText)
      .filter(Boolean);
  return String(responsibilities)
    .split(/\n|(?=[•‣◦⁃∙▪▫●○■□◆\uF0B7])|(?=-\s)/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(cleanBulletText)
    .filter(Boolean);
}

const BULLET_PREFIX = /^[\s\u000c]*(?:[•‣◦⁃∙▪▫●○■□◆\uF0B7]|[-–—*])\s*/u;

export function cleanBulletText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(BULLET_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Text preparation for AI parsing ──────────────────────────────────────────

/**
 * Prepares extracted resume text for AI parsing:
 * - Truncates to max length to avoid token limits
 * - Preserves section structure
 */
export function prepareResumeTextForParsing(text: string): string {
  if (!text) return "";

  const prepared = text.trim();

  // If text is within limits, return as-is
  if (prepared.length <= MAX_RESUME_TEXT_CHARS) return prepared;

  // Truncate intelligently: try to cut at a section boundary
  const truncated = prepared.substring(0, MAX_RESUME_TEXT_CHARS);

  // Find the last double newline (section boundary) before the limit
  const lastSectionBreak = truncated.lastIndexOf("\n\n");
  if (lastSectionBreak > MAX_RESUME_TEXT_CHARS * 0.7) {
    return truncated.substring(0, lastSectionBreak) + "\n\n[Content truncated for processing]";
  }

  // Fall back to hard truncation at last newline
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > MAX_RESUME_TEXT_CHARS * 0.8) {
    return truncated.substring(0, lastNewline) + "\n\n[Content truncated for processing]";
  }

  return truncated + "\n\n[Content truncated for processing]";
}

// ── Stream AI text from Supabase chat function (with retry + timeout) ────────

/**
 * Calls the chat edge function with SSE streaming.
 * Includes retry logic and per-request timeout.
 */
export async function streamAIText(
  accessToken: string,
  messages: { role: string; content: string }[],
  mode = "resume",
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < AI_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff
      const delay = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[streamAIText] Retry ${attempt}/${AI_MAX_RETRIES} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const result = await streamAITextOnce(accessToken, messages, mode);
      if (result && result.trim().length > 0) return result;
      lastError = new Error("AI returned empty response");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[streamAIText] Attempt ${attempt + 1} failed:`, lastError.message);

      // Configuration, entitlement, routing, and authentication errors will not
      // improve on retry. Surface them immediately instead of making the user
      // wait through three identical failures.
      if (
        /\((400|401|402|403|404)\)/.test(lastError.message) ||
        /unauthorized|not configured|access denied/i.test(lastError.message)
      ) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("AI request failed after retries");
}

async function streamAITextOnce(
  accessToken: string,
  messages: { role: string; content: string }[],
  mode: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_STREAM_TIMEOUT_MS);
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "";

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(publishableKey ? { apikey: publishableKey } : {}),
        },
        body: JSON.stringify({ messages, mode, agentHint: mode }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`AI request failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let full = "";

    if (reader) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
            try {
              const p = JSON.parse(trimmed.slice(6));
              const c =
                p.choices?.[0]?.delta?.content ||
                p.choices?.[0]?.message?.content ||
                p.content ||
                p.text;
              if (c) full += c;
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
          try {
            const p = JSON.parse(trimmed.slice(6));
            const c =
              p.choices?.[0]?.delta?.content ||
              p.choices?.[0]?.message?.content ||
              p.content ||
              p.text;
            if (c) full += c;
          } catch {}
        }
      }
    }

    return full;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── System prompt for resume parsing ─────────────────────────────────────────

export const RESUME_PARSE_SYSTEM_PROMPT = `You are a lossless resume extraction engine. Your job is transcription into structured data, not rewriting.
OUTPUT: Return one valid JSON object only. No prose or markdown.
SCHEMA: {"header":{"name":"","title":"","location":"","email":"","phone":"","linkedin":""},"summary":"","experience":[{"role":"","company_or_client":"","start_date":"","end_date":"","location":"","bullets":[],"environment":""}],"education":[{"degree":"","field":"","institution":"","gpa":"","start_date":"","end_date":"","graduation_date":"","location":""}],"certifications":[{"name":"","issuer":"","date":"","url":""}],"skills":{},"projects":[{"title":"","organization":"","date":"","bullets":[],"url":""}],"languages":[{"language":"","proficiency":""}],"volunteer":[{"role":"","organization":"","date":"","bullets":[]}],"awards":[{"title":"","issuer":"","date":"","url":""}],"custom_sections":[{"name":"","entries":[{"title":"","subtitle":"","date":"","bullets":[],"url":""}]}]}
RULES:
1. Preserve source wording and facts. Never summarize, enhance, infer, or invent.
2. Extract every entry, bullet, date, link, skill, and section. Remove only visual bullet glyphs and PDF control characters.
3. Keep an Environment/Technology line on the experience entry it belongs to in "environment"; do not discard it.
4. Preserve education date ranges in start_date/end_date. Also set graduation_date to end_date for backward compatibility.
5. Skills must come from the explicit skills section when one exists. Preserve its category labels as lowercase snake_case. Do not infer skills from job bullets and do not list a skill more than once.
6. Put any meaningful section that does not fit the named schema into custom_sections instead of dropping it.
7. Placeholder contact values such as "EMAIL NEEDED", "(XXX) XXX-XXXX", "City, ST", or generic /handle URLs are missing values: return "" for that field.
8. Use "" for missing scalar fields and [] for missing lists. Every schema key is required.`;

const PARSER_VERSION = "resume-parse-v2";
const PLACEHOLDER_PATTERNS: Record<string, RegExp[]> = {
  email: [/email\s+(?:needed|required|here)/i, /your[._ -]?email/i],
  phone: [/x{2,}/i, /your\s+phone/i, /phone\s+(?:needed|required)/i],
  location: [/^city\s*,?\s*(?:st|state)$/i, /location\s+(?:needed|required)/i],
  linkedin: [/linkedin\.com\/in\/(?:handle|username|your)/i],
};

function cleanScalar(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function cleanContact(field: keyof typeof PLACEHOLDER_PATTERNS, value: unknown): string {
  const cleaned = cleanScalar(value);
  return PLACEHOLDER_PATTERNS[field].some((pattern) => pattern.test(cleaned)) ? "" : cleaned;
}

function safeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

// ── Skill normalization and deduplication ─────────────────────────────────────

/**
 * Normalizes skill category keys and merges duplicate categories.
 * For example, "NLP Tools", "NLP", and "NLP Technologies" all merge into "nlp".
 * Skills within merged categories are deduplicated (case-insensitive).
 *
 * @param rawSkills - The raw skills object from AI parsing or existing data
 * @returns Normalized SkillsObject with deduplicated categories and skills
 */
export function normalizeAndDeduplicateSkills(rawSkills: Record<string, string[]>): SkillsObject {
  const merged: SkillsObject = {};
  const seenGlobally = new Set<string>();

  for (const [rawKey, skills] of Object.entries(rawSkills)) {
    if (!Array.isArray(skills) || skills.length === 0) continue;

    const canonicalKey = normalizeSkillCategory(rawKey);

    if (!merged[canonicalKey]) {
      merged[canonicalKey] = [];
    }

    // A skill should appear once in the document. Cross-category duplicates make
    // the preview noisy and inflate keyword-based scoring without adding evidence.
    for (const skill of skills) {
      const trimmed = cleanScalar(skill);
      const identity = trimmed.toLocaleLowerCase();
      if (trimmed && !seenGlobally.has(identity)) {
        merged[canonicalKey].push(trimmed);
        seenGlobally.add(identity);
      }
    }

    if (merged[canonicalKey].length === 0) delete merged[canonicalKey];
  }

  return merged;
}

/**
 * Merges two skill objects, normalizing categories and deduplicating skills.
 * This should be used instead of naive `{ ...existing, ...newSkills }` spreading.
 *
 * @param existing - The current skills in the resume
 * @param incoming - New skills from AI parsing or other sources
 * @returns Merged and deduplicated SkillsObject
 */
export function mergeAndDeduplicateSkills(
  existing: Record<string, string[]>,
  incoming: Record<string, string[]>,
): SkillsObject {
  // First normalize both inputs separately, then merge
  const combined: Record<string, string[]> = {};

  // Add existing skills first (normalize their keys)
  for (const [key, skills] of Object.entries(existing)) {
    if (!Array.isArray(skills)) continue;
    const canonical = normalizeSkillCategory(key);
    if (!combined[canonical]) combined[canonical] = [];
    combined[canonical].push(...skills);
  }

  // Add incoming skills (normalize their keys)
  for (const [key, skills] of Object.entries(incoming)) {
    if (!Array.isArray(skills)) continue;
    const canonical = normalizeSkillCategory(key);
    if (!combined[canonical]) combined[canonical] = [];
    combined[canonical].push(...skills);
  }

  // Now deduplicate within each category
  return normalizeAndDeduplicateSkills(combined);
}

// ── Map AI parsed data to Supabase resume payload ────────────────────────────

export function mapParsedToResumePayload(parsedData: Record<string, any>) {
  return {
    personal_info: {
      name: cleanScalar(parsedData.header?.name),
      title: cleanScalar(parsedData.header?.title),
      email: cleanContact("email", parsedData.header?.email),
      phone: cleanContact("phone", parsedData.header?.phone),
      location: cleanContact("location", parsedData.header?.location),
      linkedin: cleanContact("linkedin", parsedData.header?.linkedin),
    },
    summary: cleanScalar(parsedData.summary),
    experience:
      safeArray(parsedData.experience).length > 0
        ? safeArray(parsedData.experience).map((e: any) => ({
            id: crypto.randomUUID(),
            role: cleanScalar(e.role),
            company_or_client: cleanScalar(e.company_or_client),
            start_date: cleanScalar(e.start_date),
            end_date: cleanScalar(e.end_date),
            location: cleanScalar(e.location),
            bullets: formatBullets(e.bullets || ""),
            environment: cleanScalar(e.environment),
          }))
        : [],
    education:
      safeArray(parsedData.education).length > 0
        ? safeArray(parsedData.education).map((e: any) => ({
            id: crypto.randomUUID(),
            degree: cleanScalar(e.degree),
            field: cleanScalar(e.field),
            institution: cleanScalar(e.institution),
            gpa: cleanScalar(e.gpa),
            start_date: cleanScalar(e.start_date),
            end_date: cleanScalar(e.end_date),
            graduation_date: cleanScalar(e.graduation_date || e.end_date),
            location: cleanScalar(e.location),
          }))
        : [],
    certifications:
      safeArray(parsedData.certifications).length > 0
        ? safeArray(parsedData.certifications).map((c: any) => ({
            id: crypto.randomUUID(),
            name: cleanScalar(c.name),
            issuer: cleanScalar(c.issuer),
            date: cleanScalar(c.date),
            url: cleanScalar(c.url),
          }))
        : [],
    skills: parsedData.skills && typeof parsedData.skills === "object"
      ? normalizeAndDeduplicateSkills(parsedData.skills)
      : {},
    projects:
      safeArray(parsedData.projects).length > 0
        ? safeArray(parsedData.projects).map((p: any) => ({
            id: crypto.randomUUID(),
            title: cleanScalar(p.title),
            organization: cleanScalar(p.organization),
            date: cleanScalar(p.date),
            bullets: formatBullets(p.bullets || ""),
            url: cleanScalar(p.url),
          }))
        : [],
    languages: safeArray(parsedData.languages).map((l: any) => ({
      id: crypto.randomUUID(),
      language: cleanScalar(l.language),
      proficiency: cleanScalar(l.proficiency),
    })),
    volunteer: safeArray(parsedData.volunteer).map((v: any) => ({
      id: crypto.randomUUID(),
      role: cleanScalar(v.role),
      organization: cleanScalar(v.organization),
      date: cleanScalar(v.date),
      bullets: formatBullets(v.bullets || ""),
    })),
    awards: safeArray(parsedData.awards).map((a: any) => ({
      id: crypto.randomUUID(),
      title: cleanScalar(a.title),
      issuer: cleanScalar(a.issuer),
      date: cleanScalar(a.date),
      url: cleanScalar(a.url),
    })),
    custom_sections: safeArray(parsedData.custom_sections).map((s: any) => ({
      id: crypto.randomUUID(),
      name: cleanScalar(s.name),
      entries: safeArray(s.entries).map((entry: any) => ({
        id: crypto.randomUUID(),
        title: cleanScalar(entry.title),
        subtitle: cleanScalar(entry.subtitle),
        date: cleanScalar(entry.date),
        bullets: formatBullets(entry.bullets || entry.content || ""),
        url: cleanScalar(entry.url),
      })),
    })),
  };
}

const SECTION_DEFINITIONS = [
  { id: "summary", source: /^(?:professional\s+)?(?:summary|profile|objective|about)$/im },
  { id: "experience", source: /^(?:professional\s+|work\s+)?experience|employment(?:\s+history)?$/im },
  { id: "skills", source: /^(?:technical\s+|core\s+)?skills|technologies$/im },
  { id: "education", source: /^education|academic(?:\s+background)?$/im },
  { id: "projects", source: /^(?:selected\s+)?projects$/im },
  { id: "certifications", source: /^certifications?|licenses?(?:\s+and\s+certifications)?$/im },
  { id: "languages", source: /^languages$/im },
  { id: "volunteer", source: /^(?:volunteer|community)(?:\s+experience|\s+service)?$/im },
  { id: "awards", source: /^(?:awards|honors|publications)(?:\s+and\s+publications)?$/im },
] as const;

const COVERAGE_STOP_WORDS = new Set([
  "and", "the", "with", "for", "from", "that", "this", "into", "using", "used", "over", "under",
  "professional", "experience", "summary", "technical", "skills", "education", "present", "resume",
]);

function coverageTokens(value: string): Set<string> {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\b(?:email needed|city st|xxx xxx xxxx|linkedin com in handle|github com handle)\b/g, " ")
    .replace(/[^a-z0-9+#./-]+/g, " ");
  return new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.replace(/^[./-]+|[./-]+$/g, ""))
      .filter((token) => token.length > 2 && !COVERAGE_STOP_WORDS.has(token)),
  );
}

function sourceBulletCount(sourceText: string): number {
  return sourceText
    .split(/\r?\n/)
    .filter((line) => /^[\s\u000c]*[•‣◦⁃∙▪▫●○■□◆\uF0B7]\s*\S/u.test(line)).length;
}

function parsedValueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(parsedValueText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(parsedValueText).join(" ");
  return "";
}

function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 1 : Math.max(0, Math.min(1, numerator / denominator));
}

function percent(value: number): number {
  return Math.round(value * 1000) / 10;
}

export function calculateResumeParseQuality(
  sourceText: string,
  parsedData: Record<string, any>,
  threshold = 95,
): ResumeParseQuality {
  const mapped = mapParsedToResumePayload(parsedData);
  const parsedText = parsedValueText(mapped);
  const sourceTokens = coverageTokens(sourceText);
  const parsedTokens = coverageTokens(parsedText);
  const retainedTokens = [...sourceTokens].filter((token) => parsedTokens.has(token)).length;
  const lexicalCoverage = ratio(retainedTokens, sourceTokens.size);

  const sourceBullets = sourceBulletCount(sourceText);
  const parsedBullets = mapped.experience.reduce((count, entry) => count + entry.bullets.length, 0)
    + mapped.projects.reduce((count, entry) => count + entry.bullets.length, 0)
    + mapped.volunteer.reduce((count, entry) => count + entry.bullets.length, 0);
  const bulletCoverage = ratio(Math.min(parsedBullets, sourceBullets), sourceBullets);

  const sourceDates = new Set(
    (sourceText.match(/\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}\b/gi) || [])
      .map((date) => date.toLocaleLowerCase()),
  );
  const parsedDates = new Set(
    (parsedText.match(/\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}\b/gi) || [])
      .map((date) => date.toLocaleLowerCase()),
  );
  const dateCoverage = ratio([...sourceDates].filter((date) => parsedDates.has(date)).length, sourceDates.size);

  const expectedSections = SECTION_DEFINITIONS.filter((section) => section.source.test(sourceText)).map((section) => section.id);
  const capturedSections = expectedSections.filter((section) => {
    if (section === "summary") return Boolean(mapped.summary);
    if (section === "skills") return Object.values(mapped.skills).some((items) => items.length > 0);
    return safeArray((mapped as Record<string, unknown>)[section]).length > 0;
  });
  const sectionCoverage = ratio(capturedSections.length, expectedSections.length);

  const score = percent(
    lexicalCoverage * 0.55 + bulletCoverage * 0.25 + dateCoverage * 0.1 + sectionCoverage * 0.1,
  );
  const warnings: string[] = [];
  if (sourceBullets > parsedBullets) warnings.push(`${sourceBullets - parsedBullets} source bullet(s) may be missing.`);
  const missingSections = expectedSections.filter((section) => !capturedSections.includes(section));
  if (missingSections.length) warnings.push(`Missing structured sections: ${missingSections.join(", ")}.`);
  if (dateCoverage < 1) warnings.push("One or more source dates were not preserved.");
  if (lexicalCoverage < 0.95) warnings.push("Some source terms were not retained in structured fields.");
  if (/email\s+needed|\(x{3}\)|city\s*,\s*st|\/(?:handle|username)\b/i.test(sourceText)) {
    warnings.push("Placeholder contact values were left blank for the user to complete.");
  }
  if (sourceText.includes("[Content truncated for processing]")) {
    warnings.push("The source exceeded the parser limit and requires manual review.");
  }

  return {
    version: PARSER_VERSION,
    score,
    threshold,
    status: score >= threshold ? "passed" : "review_required",
    sourceCharacters: sourceText.length,
    metrics: {
      lexicalCoverage: percent(lexicalCoverage),
      bulletCoverage: percent(bulletCoverage),
      dateCoverage: percent(dateCoverage),
      sectionCoverage: percent(sectionCoverage),
    },
    evidence: { sourceBullets, parsedBullets, expectedSections, capturedSections },
    warnings,
  };
}

export function buildResumeCorrectionPrompt(
  sourceText: string,
  previousParsed: Record<string, any>,
  quality: ResumeParseQuality,
): string {
  return `The previous extraction scored ${quality.score}% against a ${quality.threshold}% source-coverage gate.
Correct it using the lossless extraction rules. Preserve all source facts and return the complete JSON schema, not a patch.
Quality findings: ${quality.warnings.join(" ") || "Source evidence was not fully retained."}

PREVIOUS JSON:
${JSON.stringify(previousParsed)}

SOURCE RESUME:
${prepareResumeTextForParsing(sourceText)}`;
}

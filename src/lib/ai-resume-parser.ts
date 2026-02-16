/**
 * Shared AI resume parsing utilities.
 * Extracted from ResumeBuilder.tsx to be reusable across the app.
 */

import { normalizeSkillCategory, type SkillsObject } from "@/types/resume";

// ── Robust JSON extractor from AI text ───────────────────────────────────────

export function parseAIResponse(content: string): Record<string, any> | null {
  let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
  try {
    return JSON.parse(
      jsonString.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,(\s*[}\]])/g, "$1"),
    );
  } catch {}
  return null;
}

// ── Bullet point normalizer ──────────────────────────────────────────────────

export function formatBullets(responsibilities: string | string[]): string[] {
  if (!responsibilities) return [];
  if (Array.isArray(responsibilities))
    return responsibilities
      .filter((r) => r && r.trim())
      .map((r) => r.trim().replace(/^[•\-*]\s*/, ""));
  return String(responsibilities)
    .split(/\n|(?=•)|(?=-)/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[•\-*]\s*/, ""));
}

// ── Stream AI text from Supabase chat function ───────────────────────────────

export async function streamAIText(
  accessToken: string,
  messages: { role: string; content: string }[],
  mode = "resume",
): Promise<string> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ messages, mode }),
    },
  );
  if (!response.ok) throw new Error("AI request failed");
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let full = "";
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split("\n")) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const p = JSON.parse(line.slice(6));
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
  }
  return full;
}

// ── System prompt for resume parsing ─────────────────────────────────────────

export const RESUME_PARSE_SYSTEM_PROMPT = `You are an expert resume parser. Extract ALL structured resume data.
OUTPUT: Return ONLY valid JSON.
SCHEMA: {"header":{"name":"","title":"","location":"","email":"","phone":"","linkedin":""},"summary":"","experience":[{"role":"","company_or_client":"","start_date":"","end_date":"","location":"","bullets":[]}],"education":[{"degree":"","field":"","institution":"","gpa":"","graduation_date":"","location":""}],"certifications":[{"name":"","issuer":"","date":""}],"skills":{},"projects":[{"title":"","organization":"","date":"","bullets":[]}]}
RULES: Extract EVERY bullet point. Use "" for missing fields. Return ONLY JSON.
SKILL CATEGORIES: Map all skills to these standard keys: "generative_ai", "nlp", "machine_learning", "deep_learning", "programming_languages", "data_engineering_etl", "visualization", "cloud_mlops", "devops", "databases", "frameworks", "collaboration_tools", "big_data". Do NOT create duplicates like "nlp_tools" or "cloud_platforms" - merge into the standard keys.`;

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

  for (const [rawKey, skills] of Object.entries(rawSkills)) {
    if (!Array.isArray(skills) || skills.length === 0) continue;

    const canonicalKey = normalizeSkillCategory(rawKey);

    if (!merged[canonicalKey]) {
      merged[canonicalKey] = [];
    }

    // Deduplicate skills (case-insensitive)
    const existingLower = new Set(merged[canonicalKey].map((s) => s.toLowerCase().trim()));
    for (const skill of skills) {
      const trimmed = skill.trim();
      if (trimmed && !existingLower.has(trimmed.toLowerCase())) {
        merged[canonicalKey].push(trimmed);
        existingLower.add(trimmed.toLowerCase());
      }
    }
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
      name: parsedData.header?.name || "",
      title: parsedData.header?.title || "",
      email: parsedData.header?.email || "",
      phone: parsedData.header?.phone || "",
      location: parsedData.header?.location || "",
      linkedin: parsedData.header?.linkedin || "",
    },
    summary: parsedData.summary || "",
    experience:
      parsedData.experience?.length > 0
        ? parsedData.experience.map((e: any) => ({
            id: crypto.randomUUID(),
            role: e.role || "",
            company_or_client: e.company_or_client || "",
            start_date: e.start_date || "",
            end_date: e.end_date || "",
            location: e.location || "",
            bullets: Array.isArray(e.bullets)
              ? e.bullets
              : formatBullets(e.bullets || ""),
          }))
        : [],
    education:
      parsedData.education?.length > 0
        ? parsedData.education.map((e: any) => ({
            id: crypto.randomUUID(),
            degree: e.degree || "",
            field: e.field || "",
            institution: e.institution || "",
            gpa: e.gpa || "",
            graduation_date: e.graduation_date || "",
            location: e.location || "",
          }))
        : [],
    certifications:
      parsedData.certifications?.length > 0
        ? parsedData.certifications.map((c: any) => ({
            id: crypto.randomUUID(),
            name: c.name || "",
            issuer: c.issuer || "",
            date: c.date || "",
          }))
        : [],
    skills: parsedData.skills ? normalizeAndDeduplicateSkills(parsedData.skills) : {},
    projects:
      parsedData.projects?.length > 0
        ? parsedData.projects.map((p: any) => ({
            id: crypto.randomUUID(),
            title: p.title || "",
            organization: p.organization || "",
            date: p.date || "",
            bullets: Array.isArray(p.bullets) ? p.bullets : [],
          }))
        : [],
  };
}

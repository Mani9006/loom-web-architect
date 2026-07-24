/**
 * career-ops-tailor-v2
 *
 * Single round-trip resume tailor. Replaces career-ops-tailor (which required
 * a pre-staged evaluation_id and returned a denormalized blob).
 *
 * Input:  { resume: ResumeJSON, job_description: string }
 * Output: { tailored: ResumeJSON, model: string, tokens_in, tokens_out }
 *
 * Uses the provider-swappable standard routing tier from _shared/llm.ts.
 *
 * Hard constraints in the prompt:
 *   - No fabrication. Only reorder/rephrase what's already in the resume.
 *   - Output is JSON matching ResumeJSON exactly. No prose.
 *   - Preserve existing IDs for every entry that's kept.
 */
import {
  corsHeaders,
  jsonResponse,
  withErrorHandler,
  HttpError,
  getAuthedUser,
  serviceClient,
  enforceAccountActive,
  enforceDailyCap,
} from "../_shared/guards.ts";
import { chatFree } from "../_shared/llm.ts";

interface RequestBody {
  resume?: unknown;
  job_description?: unknown;
}

Deno.serve((req) =>
  withErrorHandler(async () => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");

    const user = await getAuthedUser(req);
    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "tailor", isPro);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const resume = body.resume as Record<string, unknown> | undefined;
    const jd = typeof body.job_description === "string" ? body.job_description.trim() : "";

    if (!resume || typeof resume !== "object") throw new HttpError(400, "resume is required");
    if (jd.length < 50) throw new HttpError(400, "job_description must be at least 50 chars");
    if (jd.length > 12_000) throw new HttpError(400, "job_description too long (max 12k chars)");

    const system = buildSystemPrompt();
    const userPrompt = buildUserPrompt(resume, jd);

    const { text, tokens_in, tokens_out, model } = await chatFree<Record<string, unknown>>(
      "standard",
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      {
        maxTokens: 4000,
        temperature: 0.3,
        parseJson: true,
        usage: { svc, userId: user.id, kind: "tailor" },
      },
    );

    const tailored = sanitizeTailored(text, resume);

    return jsonResponse({ tailored, model, tokens_in, tokens_out });
  }),
);

function buildSystemPrompt(): string {
  return `You are a senior resume tailor working under strict ATS rules.

Your job: rewrite a candidate's resume to land an interview for a specific job, WITHOUT FABRICATING ANYTHING.

HARD RULES (violating any of these makes the output unusable):
1. Never invent companies, titles, dates, degrees, certifications, or quantitative claims that weren't in the input resume.
2. You MAY: reorder bullets, rephrase for impact, swap synonyms to mirror the JD's vocabulary, expand abbreviations, infer reasonable metrics ONLY if implied (e.g., "led the team" → "led a team" is OK; "led a team of 12" is NOT unless the original says so).
3. Keep experience and project entries in their original order. You may reorder their bullets by relevance.
4. You MAY: suggest skill keywords from the JD ONLY if the candidate's resume already shows evidence of using them (don't add Kubernetes if they never mention containers).
5. Keep every entry's "id" field exactly as it was. New entries you might generate must NOT happen — never add new experience/education/cert/project entries that weren't in the input.
6. Preserve full ResumeJSON schema. All required keys must be present.

STYLE:
- Bullets: start with a strong past-tense action verb. Lead with impact, then how. Quantify if numbers exist in the source.
- Summary: 2-3 sentences, JD-aware, leads with role + years + 1 signature impact.
- Skills: keep existing category groupings; reorder skills so JD-relevant ones come first.

OUTPUT FORMAT:
Return ONLY a JSON object matching the ResumeJSON schema:
{
  "header": { "name", "title", "location", "email", "phone", "linkedin" },
  "summary": "...",
  "experience": [ { "id", "role", "company_or_client", "start_date", "end_date", "location", "bullets": [] } ],
  "education": [ { "id", "degree", "field", "institution", "gpa", "graduation_date", "location" } ],
  "certifications": [ { "id", "name", "issuer", "date", "url?" } ],
  "skills": { "<category_key>": ["skill", ...] },
  "projects": [ { "id", "title", "organization", "date", "bullets": [], "url?" } ],
  "languages": [ ... ]?,
  "volunteer": [ ... ]?,
  "awards": [ ... ]?,
  "section_order": [...]?
}

No prose, no markdown fences. Just the JSON object.`;
}

function buildUserPrompt(resume: Record<string, unknown>, jd: string): string {
  return `JOB DESCRIPTION:
"""
${jd}
"""

CANDIDATE RESUME (ResumeJSON):
"""
${JSON.stringify(resume)}
"""

Tailor this resume to maximize fit for the job description. Output the full tailored ResumeJSON.`;
}

/**
 * Treat model output as untrusted. Only summary and bullet wording/order may
 * change. All factual identity fields, collections, and skills are pinned to
 * the source résumé so a model cannot fabricate or silently delete history.
 */
function sanitizeTailored(out: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  const sane: Record<string, unknown> = {
    ...input,
    header: asRecord(input.header),
    summary: typeof out.summary === "string" && out.summary.trim()
      ? out.summary.trim()
      : typeof input.summary === "string" ? input.summary : "",
    experience: mergeBulletEntries(out.experience, input.experience),
    projects: mergeBulletEntries(out.projects, input.projects),
    skills: constrainSkills(out.skills, input.skills),
  };

  for (const key of ["education", "certifications", "languages", "volunteer", "awards"]) {
    sane[key] = Array.isArray(input[key]) ? input[key] : [];
  }

  return sane;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanBullets(value: unknown, fallback: unknown): string[] {
  const clean = Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  if (clean.length > 0) return clean;
  return Array.isArray(fallback)
    ? fallback.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function mergeBulletEntries(output: unknown, source: unknown): Array<Record<string, unknown>> {
  const outputEntries = Array.isArray(output) ? output.map(asRecord) : [];
  const sourceEntries = Array.isArray(source) ? source.map(asRecord) : [];

  return sourceEntries.map((sourceEntry, index) => {
    const sourceId = typeof sourceEntry.id === "string" ? sourceEntry.id : "";
    const tailored = sourceId
      ? outputEntries.find((entry) => entry.id === sourceId) ?? outputEntries[index]
      : outputEntries[index];
    return {
      ...sourceEntry,
      bullets: cleanBullets(tailored?.bullets, sourceEntry.bullets),
    };
  });
}

function normalizeSkills(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [category, values] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(values)) continue;
    const clean = values.map(String).map((item) => item.trim()).filter(Boolean);
    result[category] = [...new Set(clean)];
  }
  return result;
}

function constrainSkills(output: unknown, source: unknown): Record<string, string[]> {
  const sourceSkills = normalizeSkills(source);
  const outputSkills = normalizeSkills(output);
  const result: Record<string, string[]> = {};

  for (const [category, sourceValues] of Object.entries(sourceSkills)) {
    const byKey = new Map(sourceValues.map((value) => [value.toLowerCase(), value]));
    const ordered = (outputSkills[category] ?? [])
      .map((value) => byKey.get(value.toLowerCase()))
      .filter((value): value is string => Boolean(value));
    const seen = new Set(ordered.map((value) => value.toLowerCase()));
    result[category] = [...ordered, ...sourceValues.filter((value) => !seen.has(value.toLowerCase()))];
  }

  return result;
}

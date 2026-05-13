/**
 * career-ops-tailor-v2
 *
 * Single round-trip resume tailor. Replaces career-ops-tailor (which required
 * a pre-staged evaluation_id and returned a denormalized blob).
 *
 * Input:  { resume: ResumeJSON, job_description: string }
 * Output: { tailored: ResumeJSON, model: string, tokens_in, tokens_out }
 *
 * Uses _shared/llm.ts standard tier (Sonnet 4.6 by default; swappable via
 * LLM_DEFAULT_PROVIDER + OPENAI_MODEL_STANDARD env).
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
import { callLlm } from "../_shared/llm.ts";

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

    const { text, tokens_in, tokens_out, model } = await callLlm<Record<string, unknown>>({
      tier: "standard",
      system,
      user: userPrompt,
      maxTokens: 4000,
      temperature: 0.3,
      parseJson: true,
      usage: { svc, userId: user.id, kind: "tailor" },
    });

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
3. You MAY: reorder experience entries by relevance to the JD.
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
 * Make sure every entry's id matches the input (LLMs sometimes invent new
 * ids or drop them). Also enforce required keys exist with safe defaults.
 */
function sanitizeTailored(out: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  const sane: Record<string, unknown> = { ...out };

  // Pass-through arrays — pin IDs by matching position to input when the LLM dropped them.
  for (const key of ["experience", "education", "certifications", "projects", "languages", "volunteer", "awards"]) {
    if (!Array.isArray(out[key])) {
      sane[key] = Array.isArray(input[key]) ? input[key] : [];
      continue;
    }
    const inArr = Array.isArray(input[key]) ? (input[key] as Array<{ id?: string }>) : [];
    sane[key] = (out[key] as Array<Record<string, unknown>>).map((entry, i) => {
      if (!entry.id && inArr[i]?.id) {
        return { ...entry, id: inArr[i].id };
      }
      return entry;
    });
  }

  // Ensure header/summary/skills exist
  if (!sane.header || typeof sane.header !== "object") sane.header = input.header ?? {};
  if (typeof sane.summary !== "string") sane.summary = (input.summary as string) ?? "";
  if (!sane.skills || typeof sane.skills !== "object") sane.skills = input.skills ?? {};

  return sane;
}

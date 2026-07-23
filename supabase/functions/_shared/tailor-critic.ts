/**
 * tailor-critic — automated "test before submit" review loop for the resume
 * tailoring pipeline (career-ops-tailor).
 *
 * Implements the three-stage product rubric:
 *   Stage 1  ATS Review            — missing/weak keywords, skills, tools,
 *                                    role-specific terminology. No keyword
 *                                    stuffing: only flag gaps the base resume
 *                                    can honestly cover.
 *   Stage 2  Recruiter 7-Second    — what stands out immediately, what is
 *                                    confusing, does the profile look relevant
 *                                    within a 7-second skim.
 *   Stage 3  Hiring Manager        — do bullets prove real impact, ownership,
 *                                    problem-solving, role fit.
 *
 * Outputs: top rejection reasons, strongest parts, exact weak lines, and
 * rewrites that use ONLY information already present in the base resume —
 * the critic must never invent facts, and neither may the fixes it suggests.
 */
import { callLlmWithFallback } from "./llm.ts";

export interface CriticFix {
  /** Exact line/section in the tailored resume to change. */
  target: string;
  /** How to fix it, using only existing resume content. */
  instruction: string;
}

export interface CriticResult {
  pass: boolean;
  ats_review: {
    weak_keywords: string[];
    notes: string;
  };
  recruiter_scan: {
    stands_out: string[];
    confusing: string[];
    looks_relevant_7s: boolean;
  };
  hiring_manager: {
    impact_issues: string[];
    weak_lines: string[];
  };
  top_rejection_reasons: string[];
  strongest_parts: string[];
  fixes: CriticFix[];
}

const CRITIC_SYSTEM_PROMPT = `You are a brutally honest resume critic reviewing a TAILORED resume against a specific job description before it is submitted. You evaluate in three stages:

STAGE 1 — ATS REVIEW: Identify missing or weak keywords, skills, tools, and role-specific terminology that an applicant tracking system would look for. IMPORTANT: only flag a keyword as weak/missing if the candidate's BASE resume contains evidence that could honestly support it. Never recommend keyword stuffing or adding skills the candidate has not demonstrated.

STAGE 2 — RECRUITER 7-SECOND REVIEW: A recruiter skims this resume for ~7 seconds. Report what stands out immediately, what is confusing or buried, and whether the profile looks relevant to this role within 7 seconds (looks_relevant_7s).

STAGE 3 — HIRING MANAGER REVIEW: Do the bullets prove real impact, ownership, and problem-solving? Do they show fit for THIS role? List impact issues and quote the exact weakest lines verbatim in weak_lines.

Then produce:
- top_rejection_reasons: the most likely reasons this application would be rejected (empty array if none are more than minor polish items).
- strongest_parts: what is already strong and must be preserved.
- fixes: concrete rewrite instructions. Each fix has a "target" (quote the exact line or section from the tailored resume) and an "instruction" describing how to fix it. Fixes may ONLY rephrase, reorder, or foreground information already present in the candidate's BASE resume. NEVER invent roles, skills, employers, dates, locations, certifications, or metrics. NEVER add keywords that are not evidenced in the base resume. If a gap cannot be honestly closed, do not propose a fix for it.

Set "pass" to true only when there are no critical issues: the profile looks relevant within 7 seconds (looks_relevant_7s = true) AND every remaining rejection reason is minor polish rather than a likely rejection trigger.

Return ONLY JSON matching exactly this schema, no markdown fences:
{
  "pass": boolean,
  "ats_review": { "weak_keywords": string[], "notes": string },
  "recruiter_scan": { "stands_out": string[], "confusing": string[], "looks_relevant_7s": boolean },
  "hiring_manager": { "impact_issues": string[], "weak_lines": string[] },
  "top_rejection_reasons": string[],
  "strongest_parts": string[],
  "fixes": [{ "target": string, "instruction": string }]
}`;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean) : [];
}

function normalizeCriticResult(raw: unknown): CriticResult {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const ats = (r.ats_review ?? {}) as Record<string, unknown>;
  const rec = (r.recruiter_scan ?? {}) as Record<string, unknown>;
  const hm = (r.hiring_manager ?? {}) as Record<string, unknown>;
  const fixes = Array.isArray(r.fixes)
    ? r.fixes.flatMap((f) => {
      const o = f && typeof f === "object" ? f as Record<string, unknown> : {};
      const target = typeof o.target === "string" ? o.target.trim() : "";
      const instruction = typeof o.instruction === "string" ? o.instruction.trim() : "";
      return target && instruction ? [{ target, instruction }] : [];
    })
    : [];
  return {
    pass: r.pass === true,
    ats_review: {
      weak_keywords: asStringArray(ats.weak_keywords),
      notes: typeof ats.notes === "string" ? ats.notes : "",
    },
    recruiter_scan: {
      stands_out: asStringArray(rec.stands_out),
      confusing: asStringArray(rec.confusing),
      looks_relevant_7s: rec.looks_relevant_7s === true,
    },
    hiring_manager: {
      impact_issues: asStringArray(hm.impact_issues),
      weak_lines: asStringArray(hm.weak_lines),
    },
    top_rejection_reasons: asStringArray(r.top_rejection_reasons),
    strongest_parts: asStringArray(r.strongest_parts),
    fixes,
  };
}

export interface TailorCriticInput {
  baseResumeText: string;
  tailoredResumeText: string;
  jobDescription: string;
  company: string;
  title: string;
  missingKeywords?: string[];
}

export interface TailorCriticOutput {
  result: CriticResult;
  tokens_in: number;
  tokens_out: number;
}

/**
 * Run the 3-stage critic over a sanitized tailored resume. Throws on LLM
 * failure — callers should treat critic failure as "proceed with current
 * draft" (fail-open) so the tailor pipeline never regresses on critic outages.
 */
export async function runTailorCritic(input: TailorCriticInput): Promise<TailorCriticOutput> {
  const result = await callLlmWithFallback<unknown>({
    tier: "standard",
    system: CRITIC_SYSTEM_PROMPT,
    cachedContext:
      `Candidate BASE résumé (source of truth — nothing may be invented beyond it):\n\n${input.baseResumeText}\n\n` +
      `---\n\nJob description:\n\n${input.jobDescription}`,
    user:
      `Company: ${input.company}\n` +
      `Title: ${input.title}\n\n` +
      (input.missingKeywords?.length
        ? `Keywords a prior evaluation flagged as gaps: ${input.missingKeywords.join(", ")}.\n\n`
        : "") +
      `TAILORED resume to review:\n\n${input.tailoredResumeText}\n\n` +
      `Review it now in the three stages and return the JSON verdict.`,
    maxTokens: 2000,
    temperature: 0.2,
    parseJson: true,
  });
  return {
    result: normalizeCriticResult(result.text),
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
  };
}

/**
 * Format critic feedback into a prompt section appended to the ORIGINAL
 * tailor prompt for the next iteration. The hard honesty rules still apply;
 * fixes only rephrase/reorder existing content.
 */
export function criticFeedbackToPrompt(fixes: CriticFix[], weakKeywords: string[]): string {
  const lines: string[] = [
    "Critic feedback — fix ONLY these by rephrasing/reordering existing content; all hard rules still apply:",
  ];
  if (weakKeywords.length > 0) {
    lines.push(
      `- Weak keyword coverage (only foreground these where the source résumé already evidences them; never stuff keywords): ${weakKeywords.join(", ")}`,
    );
  }
  for (const fix of fixes.slice(0, 12)) {
    lines.push(`- Target: "${fix.target}" → ${fix.instruction}`);
  }
  lines.push("Do not change anything else unless required to stay consistent with these fixes.");
  return lines.join("\n");
}

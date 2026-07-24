// ATS Score V2 - Deep structured scoring with section breakdown
// Returns structured JSON scores instead of freeform chat text

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chatFree } from "../_shared/llm.ts";
import {
  enforceAccountActive,
  enforceDailyCap,
  getAuthedUser,
  HttpError,
  jsonResponse,
  serviceClient,
} from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ATSScoreResult {
  overallScore: number;
  sections: {
    formatting: { score: number; issues: string[]; tips: string[] };
    keywords: { score: number; matched: string[]; missing: string[]; tips: string[] };
    experience: { score: number; issues: string[]; tips: string[] };
    skills: { score: number; matched: string[]; missing: string[]; tips: string[] };
    education: { score: number; issues: string[]; tips: string[] };
    impact: { score: number; issues: string[]; tips: string[] };
  };
  summary: string;
  topImprovements: string[];
}

interface ResumeQualityResponse extends ATSScoreResult {
  scoreType: "resume_quality";
  resumeQualityScore: number;
  jobMatchScore: null;
  methodologyVersion: "resume-quality-text-v2";
}

const SCORING_PROMPT = `You are a résumé-quality analyzer. Assess only evidence visible in the extracted résumé text. Do not predict whether an employer will accept or reject it, and do not claim to inspect visual formatting that plain text cannot prove.

## Scoring Criteria

### 1. Formatting (15% weight)
- Clean section headers (Education, Experience, Skills, etc.)
- No tables, images, columns, or fancy formatting that ATS can't parse
- Standard fonts and bullet points
- Consistent date formats
- Proper contact info at top
- No headers/footers (ATS often ignores these)
- File parsability (plain text extraction quality)

### 2. Keywords
- No job description is supplied to this generic quality check.
- Return score 0, no matched/missing terms, and explain that job requirement
  coverage is measured separately by the authoritative job-match scorer.

### 3. Experience Relevance (25% weight)
- Years of experience match
- Role progression/seniority alignment
- Industry relevance
- Recency of relevant experience
- Gap analysis

### 4. Skills Match (15% weight)
- Technical skills coverage
- Certification/qualification match
- Tools and platform proficiency
- Language/framework alignment

### 5. Education (5% weight)
- Degree level match
- Field of study relevance
- Certifications and continuing education
- Relevant coursework

### 6. Impact & Achievements (15% weight)
- Quantified results (numbers, percentages, dollar amounts)
- Action verbs usage (Led, Developed, Increased, etc.)
- STAR method indicators
- Relevant project descriptions

## IMPORTANT INSTRUCTIONS
You MUST respond with ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no explanation outside the JSON:

{
  "overallScore": <number 0-100>,
  "sections": {
    "formatting": {
      "score": <number 0-100>,
      "issues": ["issue1", "issue2"],
      "tips": ["tip1", "tip2"]
    },
    "keywords": {
      "score": <number 0-100>,
      "matched": ["keyword1", "keyword2"],
      "missing": ["keyword3", "keyword4"],
      "tips": ["tip1"]
    },
    "experience": {
      "score": <number 0-100>,
      "issues": ["issue1"],
      "tips": ["tip1"]
    },
    "skills": {
      "score": <number 0-100>,
      "matched": ["skill1", "skill2"],
      "missing": ["skill3"],
      "tips": ["tip1"]
    },
    "education": {
      "score": <number 0-100>,
      "issues": ["issue1"],
      "tips": ["tip1"]
    },
    "impact": {
      "score": <number 0-100>,
      "issues": ["issue1"],
      "tips": ["tip1"]
    }
  },
  "summary": "2-3 sentence overall assessment",
  "topImprovements": ["top improvement 1", "top improvement 2", "top improvement 3"]
}

The server calculates the final résumé-quality score from the non-job-specific
dimensions. Do not use the keywords dimension in the final score.

Be honest and critical. This is a checklist-based quality estimate, not a
promise about a particular ATS or hiring outcome.`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown, limit = 10): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim()).slice(0, limit)
    : [];
}

function clamp(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

function normalizeResult(value: unknown): ResumeQualityResponse {
  const root = asRecord(value);
  const sections = asRecord(root.sections);
  const genericSection = (key: string) => {
    const section = asRecord(sections[key]);
    return { score: clamp(section.score), issues: strings(section.issues), tips: strings(section.tips) };
  };
  const matchSection = (key: string) => {
    const section = asRecord(sections[key]);
    return { score: clamp(section.score), matched: strings(section.matched), missing: strings(section.missing), tips: strings(section.tips) };
  };
  const normalized = {
    formatting: genericSection("formatting"),
    keywords: matchSection("keywords"),
    experience: genericSection("experience"),
    skills: matchSection("skills"),
    education: genericSection("education"),
    impact: genericSection("impact"),
  };
  const weightedQuality =
    normalized.formatting.score * 0.15 +
    normalized.experience.score * 0.25 +
    normalized.skills.score * 0.15 +
    normalized.education.score * 0.05 +
    normalized.impact.score * 0.15;
  const overallScore = Math.round(weightedQuality / 0.75);
  return {
    overallScore,
    scoreType: "resume_quality",
    resumeQualityScore: overallScore,
    jobMatchScore: null,
    methodologyVersion: "resume-quality-text-v2",
    sections: normalized,
    summary: typeof root.summary === "string" ? root.summary.trim().slice(0, 800) : "ATS analysis completed.",
    topImprovements: strings(root.topImprovements, 5),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getAuthedUser(req);
    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "ats", isPro);

    const { resumeText, jobDescription } = await req.json();

    if (!resumeText || resumeText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Resume text is required (minimum 50 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (jobDescription?.trim()) {
      throw new HttpError(400, "Job-specific matching is available only through career-ops-ats");
    }
    const scoringContext = `## Extracted resume text\n${resumeText.substring(0, 12_000)}

## Scope
Score only general résumé evidence quality. Do not infer visual layout and do not produce a job-match percentage.`;

    const result = await chatFree<ATSScoreResult>(
      "lite",
      [
        { role: "system", content: `${SCORING_PROMPT}\n\n---\n\n${scoringContext}` },
        { role: "user", content: "Score the supplied resume now. Return only the required JSON object." },
      ],
      {
        maxTokens: 1800,
        parseJson: true,
        usage: { svc, userId: user.id, kind: "ats" },
      },
    );
    return jsonResponse(normalizeResult(result.text));
  } catch (error) {
    console.error("ATS score error:", error);
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "ATS scoring is temporarily unavailable" }, 500);
  }
});

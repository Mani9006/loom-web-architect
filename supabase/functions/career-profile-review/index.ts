/**
 * Builds a cached, source-grounded career evidence graph.
 *
 * The language model classifies role families and credible adjacent roles once
 * per resume fingerprint. Dates, total experience, tools, and evidence indexes
 * are validated in code before the graph is stored. No job-specific call is
 * needed to reuse this intelligence.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCandidateCareerProfile } from "../_shared/career-fit.ts";
import { callLlm } from "../_shared/llm.ts";
import {
  corsHeaders,
  enforceAccountActive,
  enforceDailyCap,
  getAuthedUserOrService,
  HttpError,
  jsonResponse,
  serviceClient,
  withErrorHandler,
} from "../_shared/guards.ts";
import {
  getResumeReviewState,
  RESUME_REVIEW_REQUIRED_MESSAGE,
} from "../_shared/resume-review.ts";

const REVIEW_VERSION = "career-evidence-v1";

interface ModelGraph {
  career_story?: unknown;
  primary_role_families?: unknown;
  adjacent_roles?: unknown;
  role_reviews?: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as { resume_id?: string; user_id?: string; force?: boolean };
    const user = await getAuthedUserOrService(req, body.user_id);
    const svc = serviceClient();

    const { data: profile } = await svc.from("profiles")
      .select("years_of_experience,primary_resume_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let resumeQuery = svc.from("resumes")
      .select("id,title,source_document_id,source_hash,parser_version,parse_quality,parsed_at,updated_at,personal_info,summary,experience,skills,projects,certifications")
      .eq("user_id", user.id);
    resumeQuery = body.resume_id
      ? resumeQuery.eq("id", body.resume_id)
      : resumeQuery.order("updated_at", { ascending: false }).limit(20);
    const { data: resumeRows, error: resumeError } = await resumeQuery;
    if (resumeError) throw new HttpError(500, "unable to load source resume");
    const resume = body.resume_id
      ? resumeRows?.[0] as Record<string, unknown> | undefined
      : selectSourceResume((resumeRows ?? []) as Array<Record<string, unknown>>, profile?.primary_resume_id);
    if (!resume) throw new HttpError(412, "Add a source resume before reviewing career evidence");
    if (!getResumeReviewState(resume).allowed) {
      throw new HttpError(409, RESUME_REVIEW_REQUIRED_MESSAGE);
    }

    const sourceFingerprint = stringValue(resume.source_hash) || stringValue(resume.updated_at);
    const { data: cached } = await svc.from("resume_career_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("resume_id", resume.id)
      .maybeSingle();
    if (!body.force && cached?.source_fingerprint === sourceFingerprint && cached?.review_version === REVIEW_VERSION) {
      return jsonResponse({ profile: cached, cached: true });
    }

    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "story", isPro);

    const candidate = buildCandidateCareerProfile(resume, {
      years_of_experience: typeof profile?.years_of_experience === "number" ? profile.years_of_experience : null,
    });
    const source = {
      summary: stringValue(resume.summary),
      experience: Array.isArray(resume.experience) ? resume.experience : [],
      skills: resume.skills && typeof resume.skills === "object" ? resume.skills : {},
      projects: Array.isArray(resume.projects) ? resume.projects : [],
      certifications: Array.isArray(resume.certifications) ? resume.certifications : [],
    };

    const system = `You are a career-evidence classifier. Review the complete structured resume and return one JSON object.

Rules:
- Use every experience/client entry, not only the latest title.
- Do not invent skills, tools, roles, achievements, employers, dates, or years.
- Every role family and adjacent role must cite one or more zero-based experience indexes.
- Adjacent roles are allowed only when responsibilities and demonstrated tools support them.
- Keep adjacent role confidence between 0 and 1.
- Return concise evidence, never generic coaching.

Schema:
{
  "career_story": "2-4 factual sentences",
  "primary_role_families": [{"name":"string","evidence_experience_indexes":[0]}],
  "adjacent_roles": [{"title":"string","confidence":0.0,"evidence_experience_indexes":[0],"matched_tools":["string"],"reason":"string"}],
  "role_reviews": [{"experience_index":0,"role_family":"string","seniority":"entry|mid|senior|staff|manager|director|executive|unknown","capabilities":["string"],"tools":["string"]}]
}`;

    const preferredModel = Deno.env.get("OPENAI_MODEL_CAREER_REVIEW") || "gpt-5.6-luna";
    let result;
    try {
      result = await callLlm<ModelGraph>({
        tier: "cheap",
        provider: "openai",
        model: preferredModel,
        system,
        cachedContext: JSON.stringify(source),
        user: "Build the source-grounded career evidence graph now.",
        maxTokens: 1400,
        parseJson: true,
        usage: { svc, userId: user.id, kind: "story" },
      });
    } catch {
      // Keep the workload available if a newly configured model is not enabled
      // for this API project; the cheap tier remains the controlled fallback.
      result = await callLlm<ModelGraph>({
        tier: "cheap",
        provider: "openai",
        system,
        cachedContext: JSON.stringify(source),
        user: "Build the source-grounded career evidence graph now.",
        maxTokens: 1400,
        parseJson: true,
        usage: { svc, userId: user.id, kind: "story" },
      });
    }

    const graph = validateGraph(result.text, candidate.roleHistory.length, candidate.skills);
    const persisted = {
      user_id: user.id,
      resume_id: resume.id,
      source_fingerprint: sourceFingerprint,
      graph,
      calculated_experience_years: candidate.yearsExperienceSource === "resume_timeline" ? candidate.yearsExperience : 0,
      confirmed_experience_years: candidate.yearsExperienceSource === "profile" ? candidate.yearsExperience : null,
      model: result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      review_version: REVIEW_VERSION,
      reviewed_at: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = await svc.from("resume_career_profiles")
      .upsert(persisted, { onConflict: "user_id,resume_id" })
      .select("*")
      .single();
    if (saveError) throw new HttpError(500, "unable to save career review");

    return jsonResponse({ profile: saved, cached: false });
  });
});

function validateGraph(graph: ModelGraph, roleCount: number, candidateSkills: string[]) {
  const validIndex = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) < roleCount;
  const indexes = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(validIndex))] : [];
  const strings = (value: unknown, limit = 12) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, limit)
    : [];
  const sourceSkills = new Map(candidateSkills.map((skill) => [skill.toLowerCase(), skill]));

  const primaryRoleFamilies = Array.isArray(graph.primary_role_families)
    ? graph.primary_role_families.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const evidence = indexes(row.evidence_experience_indexes);
      const name = stringValue(row.name);
      return name && evidence.length > 0 ? [{ name, evidence_experience_indexes: evidence }] : [];
    }).slice(0, 12)
    : [];

  const adjacentRoles = Array.isArray(graph.adjacent_roles)
    ? graph.adjacent_roles.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const evidence = indexes(row.evidence_experience_indexes);
      const title = stringValue(row.title);
      const confidence = Math.max(0, Math.min(1, Number(row.confidence) || 0));
      const matchedTools = strings(row.matched_tools)
        .map((tool) => sourceSkills.get(tool.toLowerCase()))
        .filter((tool): tool is string => Boolean(tool));
      if (!title || evidence.length === 0 || confidence < 0.5) return [];
      return [{
        title,
        confidence,
        evidence_experience_indexes: evidence,
        matched_tools: [...new Set(matchedTools)],
        reason: stringValue(row.reason).slice(0, 400),
      }];
    }).sort((a, b) => b.confidence - a.confidence).slice(0, 12)
    : [];

  const roleReviews = Array.isArray(graph.role_reviews)
    ? graph.role_reviews.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (!validIndex(row.experience_index)) return [];
      return [{
        experience_index: row.experience_index,
        role_family: stringValue(row.role_family),
        seniority: stringValue(row.seniority) || "unknown",
        capabilities: strings(row.capabilities),
        tools: strings(row.tools)
          .map((tool) => sourceSkills.get(tool.toLowerCase()))
          .filter((tool): tool is string => Boolean(tool)),
      }];
    }).slice(0, roleCount)
    : [];

  return {
    career_story: stringValue(graph.career_story).slice(0, 1_200),
    primary_role_families: primaryRoleFamilies,
    adjacent_roles: adjacentRoles,
    role_reviews: roleReviews,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function selectSourceResume(
  resumes: Array<Record<string, unknown>>,
  primaryResumeId: unknown,
): Record<string, unknown> | undefined {
  const requested = typeof primaryResumeId === "string"
    ? resumes.find((resume) => resume.id === primaryResumeId)
    : undefined;
  if (requested) return requested;
  return resumes.find((resume) => typeof resume.source_document_id === "string" && resume.source_document_id)
    ?? resumes.find((resume) => !/tailored|application copy|job-specific/i.test(stringValue(resume.title)))
    ?? resumes[0];
}

/**
 * career-ops-evaluate — deterministic eligibility + grounded AI explanation.
 *
 * The career-fit gate owns ranking and eligibility. The small language model
 * explains the result and extracts resume-backed stories; it cannot change the
 * score, clear a hard filter, or invent candidate evidence.
 *
 * Body: { scanned_job_id: uuid, force?: boolean }
 * Returns: { evaluation, cached }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { truncate } from "../_shared/ai.ts";
import { chatFree } from "../_shared/llm.ts";
import {
  buildCandidateCareerProfile,
  evaluateCareerFit,
  type CandidatePreferences,
  type FitDimension,
} from "../_shared/career-fit.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUserOrService,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

const MAX_DESC = 12_000;

interface EvaluationNarrative {
  archetype: string;
  summary: string;
  star_stories: Array<{ situation: string; task: string; action: string; result: string }>;
  report_md: string;
}

const SYSTEM_PROMPT = `You explain an already-computed career-fit decision for a job seeker.

The deterministic score, eligibility result, hard filters, evidence, and gaps supplied by the system are authoritative. Do not rescore them, soften a hard filter, claim a skill that lacks resume evidence, or invent an accomplishment. If evidence is thin, say so.

Return ONLY JSON:
{
  "archetype": "Backend"|"Frontend"|"Fullstack"|"ML"|"Data"|"PM"|"Design"|"DevOps"|"Security"|"SA"|"Other",
  "summary": "one concrete sentence explaining the decision",
  "star_stories": [{"situation":"resume-backed context","task":"resume-backed responsibility","action":"resume-backed action","result":"resume-backed result or 'Result not quantified in resume'"}],
  "report_md": "200-350 words with ## Decision, ## Evidence, ## Gaps, ## Next step"
}
No preamble, no code fences, JSON only.`;

function buildResumeText(resume: Record<string, unknown>): string {
  const parts: string[] = [];
  const personalInfo = asRecord(resume.personal_info);
  const summary = stringValue(resume.summary) || stringValue(personalInfo.summary);
  if (summary) parts.push(`## Summary\n${summary}`);

  const experience = asRecords(resume.experience);
  if (experience.length > 0) {
    parts.push("## Experience");
    for (const item of experience) {
      const title = stringValue(item.role) || stringValue(item.title);
      const company = stringValue(item.company_or_client) || stringValue(item.company) || stringValue(item.client);
      parts.push(`- ${title} @ ${company} (${stringValue(item.start_date)} – ${stringValue(item.end_date) || "present"})`);
      for (const bullet of stringArray(item.bullets)) parts.push(`  • ${bullet}`);
      if (stringArray(item.bullets).length === 0 && stringValue(item.description)) {
        parts.push(`  • ${stringValue(item.description)}`);
      }
    }
  }

  const skills = flattenStrings(resume.skills);
  if (skills.length > 0) parts.push(`## Skills\n${skills.join(", ")}`);

  const projects = asRecords(resume.projects);
  if (projects.length > 0) {
    parts.push("## Projects");
    for (const project of projects) parts.push(`- ${stringValue(project.name)}: ${stringValue(project.description)}`);
  }

  const education = asRecords(resume.education);
  if (education.length > 0) {
    parts.push("## Education");
    for (const item of education) {
      parts.push(`- ${stringValue(item.degree)} @ ${stringValue(item.school) || stringValue(item.institution)}`);
    }
  }
  return parts.join("\n");
}

function tierFor(score: number, eligible: boolean): "A" | "B" | "C" | "D" | "F" {
  if (!eligible) return "F";
  if (score >= 90) return "A";
  if (score >= 76) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function dimensionDigest(dimensions: FitDimension[]): string {
  return dimensions.map((dimension) => [
    `${dimension.label}: ${dimension.score}/100 (weight ${dimension.weight})`,
    ...dimension.evidence.map((item) => `  Evidence: ${item}`),
    ...dimension.gaps.map((item) => `  Gap: ${item}`),
  ].join("\n")).join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as { scanned_job_id?: string; force?: boolean; user_id?: string };
    const user = await getAuthedUserOrService(req, body.user_id);
    if (!body.scanned_job_id) throw new HttpError(400, "scanned_job_id required");

    const svc = serviceClient();

    if (!body.force) {
      const { data: existing } = await svc.from("job_evaluations")
        .select("*").eq("user_id", user.id).eq("scanned_job_id", body.scanned_job_id).maybeSingle();
      if (existing?.score_version === "career-fit-v2") {
        return jsonResponse({ evaluation: existing, cached: true });
      }
    }

    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "evaluation", isPro);

    const [{ data: job }, { data: resumes }, { data: prefRow }, { data: profile }] = await Promise.all([
      svc.from("scanned_jobs")
        .select("*, company:scan_companies(name)")
        .eq("id", body.scanned_job_id).maybeSingle(),
      svc.from("resumes")
        .select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20),
      svc.from("user_job_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      svc.from("profiles")
        .select("years_of_experience,seniority_level,desired_roles,desired_locations,preferred_work_type,work_authorization,blacklisted_companies,primary_resume_id")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    if (!job) throw new HttpError(404, "job not found");

    const resume = selectSourceResume((resumes ?? []) as unknown as Array<Record<string, unknown>>, profile?.primary_resume_id);
    if (!resume) throw new HttpError(412, "no resume found for user");
    const resumeText = buildResumeText(resume);
    if (!resumeText || resumeText.length < 120) throw new HttpError(412, "resume too thin to evaluate");

    const rawPrefs = (prefRow ?? {}) as unknown as CandidatePreferences;
    const prefs: CandidatePreferences = {
      ...rawPrefs,
      target_roles: rawPrefs.target_roles?.length ? rawPrefs.target_roles : profile?.desired_roles ?? [],
      locations: rawPrefs.locations?.length ? rawPrefs.locations : profile?.desired_locations ?? [],
      work_modes: rawPrefs.work_modes?.length ? rawPrefs.work_modes : profile?.preferred_work_type ?? [],
      excluded_companies: rawPrefs.excluded_companies?.length ? rawPrefs.excluded_companies : profile?.blacklisted_companies ?? [],
      work_authorization: rawPrefs.work_authorization || profile?.work_authorization,
      years_of_experience: profile?.years_of_experience,
    };
    const candidate = buildCandidateCareerProfile(resume, prefs);
    const companyName = companyFromRelation(job.company);
    const fit = evaluateCareerFit(candidate, {
      title: job.title,
      company: companyName,
      location: job.location,
      remotePolicy: job.remote_policy,
      compensationText: job.compensation_text,
      employmentType: job.employment_type,
      description: job.description_md,
    });
    const tier = tierFor(fit.score, fit.eligible);
    const gaps = unique([
      ...fit.hardFilters,
      ...fit.dimensions.flatMap((dimension) => dimension.gaps),
    ]).slice(0, 12);

    const result = await chatFree<EvaluationNarrative>(
      "lite",
      [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\n---\n\nCandidate resume:\n\n${resumeText}`,
        },
        {
          role: "user",
          content:
            `Authoritative decision: ${fit.eligible ? "AUTOPILOT_READY" : "REVIEW_REQUIRED"}\n` +
            `Score: ${fit.score}/100\nTier: ${tier}\nConfidence: ${Math.round(fit.confidence * 100)}%\n` +
            `Hard filters: ${fit.hardFilters.length ? fit.hardFilters.join(" | ") : "none"}\n\n` +
            `Dimension evidence:\n${dimensionDigest(fit.dimensions)}\n\n` +
            `Company: ${companyName}\nTitle: ${job.title}\nLocation: ${job.location ?? "n/a"}\n` +
            `Compensation: ${job.compensation_text ?? "not disclosed"}\n\n` +
            `Job description:\n${truncate(job.description_md ?? "", MAX_DESC)}`,
        },
      ],
      { maxTokens: 1400, parseJson: true },
    );

    const payload = result.text;
    const row = {
      user_id: user.id,
      scanned_job_id: body.scanned_job_id,
      resume_id: stringValue(resume.id) || null,
      score: Math.round((fit.score / 20) * 100) / 100,
      fit_score: fit.score,
      fit_confidence: fit.confidence,
      eligible: fit.eligible,
      dimension_scores: fit.dimensions,
      hard_filters: fit.hardFilters,
      score_version: fit.version,
      archetype: payload.archetype || "Other",
      tier,
      summary: payload.summary,
      keyword_matches: fit.matchedSkills,
      gaps,
      star_stories: payload.star_stories ?? [],
      report_md: payload.report_md,
      model: result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      evaluated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveErr } = await svc.from("job_evaluations")
      .upsert(row, { onConflict: "user_id,scanned_job_id" }).select().single();
    if (saveErr) throw new HttpError(500, `save: ${saveErr.message}`);

    await logAiUsage(svc, user.id, "evaluation", result.tokens_in, result.tokens_out);
    return jsonResponse({ evaluation: saved, cached: false });
  });
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function flattenStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === "string" ? [item] : [stringValue(asRecord(item).name)]).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => typeof item === "string" ? [item] : stringArray(item));
  }
  return [];
}

function companyFromRelation(value: unknown): string {
  if (Array.isArray(value)) return stringValue(asRecord(value[0]).name) || "the company";
  return stringValue(asRecord(value).name) || "the company";
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
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

/**
 * Builds the first personalized match feed without a language-model call.
 * Candidate facts and preferences are compared with fresh company-direct jobs
 * by the deterministic career-fit engine, then the strongest results are
 * persisted for the normal match UI. Narrative generation remains optional.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildCandidateCareerProfile,
  evaluateCareerFit,
  isRoleFamilyCompatible,
  type CandidatePreferences,
} from "../_shared/career-fit.ts";
import { type ExistingEvaluation, withoutPreservedEvaluations } from "../_shared/match-feed-preserve.ts";
import {
  corsHeaders,
  getAuthedUserOrService,
  HttpError,
  jsonResponse,
  serviceClient,
  withErrorHandler,
} from "../_shared/guards.ts";

interface JobMetadata {
  id: string;
  title: string;
  location: string | null;
  remote_policy: string | null;
  compensation_text: string | null;
  employment_type: string | null;
  description_md?: string | null;
  last_seen_at: string;
  company: { name: string } | Array<{ name: string }> | null;
}

const MAX_EVALUATIONS = 100;
const MAX_PER_COMPANY = 8;
const DISCOVERY_POOL_SIZE = 500;
const MIN_PUBLISHED_FIT = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as { user_id?: string };
    const user = await getAuthedUserOrService(req, body.user_id);
    const svc = serviceClient();
    const [{ data: resumes }, { data: prefRow }, { data: profile }, { data: careerReviews }, { data: metadata, error: jobsError }] = await Promise.all([
      svc.from("resumes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20),
      svc.from("user_job_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      svc.from("profiles")
        .select("years_of_experience,seniority_level,desired_roles,desired_locations,preferred_work_type,work_authorization,blacklisted_companies,location,primary_resume_id")
        .eq("user_id", user.id).maybeSingle(),
      svc.from("resume_career_profiles")
        .select("resume_id,graph,reviewed_at")
        .eq("user_id", user.id)
        .order("reviewed_at", { ascending: false })
        .limit(1),
      svc.from("scanned_jobs")
        .select("id,title,location,remote_policy,compensation_text,employment_type,last_seen_at,company:scan_companies(name)")
        .eq("is_live", true)
        .order("last_seen_at", { ascending: false })
        .limit(2000),
    ]);
    if (jobsError) throw new HttpError(500, "unable to load current jobs");

    const resume = selectSourceResume((resumes ?? []) as unknown as Array<Record<string, unknown>>, profile?.primary_resume_id);
    if (!resume) throw new HttpError(412, "Add a source resume before building matches");

    const rawPrefs = (prefRow ?? {}) as unknown as CandidatePreferences;
    const inferredCountry = inferResumeCountry(resume, profile?.location, profile?.desired_locations);
    const prefs: CandidatePreferences = {
      ...rawPrefs,
      target_roles: rawPrefs.target_roles?.length ? rawPrefs.target_roles : profile?.desired_roles ?? [],
      locations: rawPrefs.locations?.length ? rawPrefs.locations : profile?.desired_locations ?? [],
      work_modes: rawPrefs.work_modes?.length ? rawPrefs.work_modes : profile?.preferred_work_type ?? [],
      excluded_companies: rawPrefs.excluded_companies?.length ? rawPrefs.excluded_companies : profile?.blacklisted_companies ?? [],
      work_authorization: rawPrefs.work_authorization || profile?.work_authorization,
      years_of_experience: profile?.years_of_experience,
      target_countries: rawPrefs.target_countries?.length
        ? rawPrefs.target_countries
        : inferredCountry ? [inferredCountry] : [],
    };
    const reviewedGraph = careerReviews?.[0]?.resume_id === resume.id && careerReviews[0].graph && typeof careerReviews[0].graph === "object"
      ? careerReviews[0].graph as Record<string, unknown>
      : null;
    const reviewedRoleFamilies = reviewRoleTerms(reviewedGraph?.primary_role_families);
    const reviewedAdjacentRoles = reviewRoleTerms(reviewedGraph?.adjacent_roles, "title");
    const candidate = buildCandidateCareerProfile(resume, {
      ...prefs,
      target_roles: unique([...(prefs.target_roles ?? []), ...reviewedRoleFamilies, ...reviewedAdjacentRoles]),
    });
    const targets = normalizeTerms(
      [
        ...(prefs.target_roles ?? []),
        candidate.currentTitle,
        ...candidate.roleHistory.map((role) => role.title),
        ...reviewedRoleFamilies,
        ...reviewedAdjacentRoles,
      ],
    );
    const groundedRoleTerms = normalizeTerms([
      ...(prefs.target_roles ?? []),
      candidate.currentTitle,
      ...candidate.roleHistory.map((role) => role.title),
    ]);
    const negatives = normalizeTerms(rawPrefs.negative_keywords ?? []);

    const allCandidates = ((metadata ?? []) as unknown as JobMetadata[])
      .filter((job) => !negatives.some((term) => job.title.toLowerCase().includes(term)))
      .filter((job) => isRoleFamilyCompatible(job.title, groundedRoleTerms))
      .map((job) => ({ job, relevance: titleRelevance(job.title, targets) }))
      .sort((a, b) => b.relevance - a.relevance || b.job.last_seen_at.localeCompare(a.job.last_seen_at));

    // Stage one is deliberately broad. Strong title-family matches are joined
    // by a fresh discovery sample so adjacent roles can qualify through tools,
    // responsibilities, client history, and experience even when the title is
    // different. Stage two reads the full job description before publishing.
    const strongTitleCandidates = allCandidates.filter((item) => item.relevance >= 40);
    const discoveryCandidates = [...allCandidates]
      .sort((a, b) => b.job.last_seen_at.localeCompare(a.job.last_seen_at))
      .slice(0, DISCOVERY_POOL_SIZE);
    const rankedCandidates = uniqueByJob([...strongTitleCandidates, ...discoveryCandidates]);
    const companyCounts = new Map<string, number>();
    const ranked = rankedCandidates.filter((item) => {
      const company = companyName(item.job.company).toLowerCase();
      const count = companyCounts.get(company) ?? 0;
      if (count >= Math.max(MAX_PER_COMPANY * 2, 16)) return false;
      companyCounts.set(company, count + 1);
      return true;
    }).slice(0, DISCOVERY_POOL_SIZE);

    if (ranked.length === 0) {
      return jsonResponse({ evaluated: 0, eligible: 0, message: "No current roles match the target titles" });
    }

    const ids = ranked.map((item) => item.job.id);
    const { data: detailed, error: detailError } = await svc.from("scanned_jobs")
      .select("id,title,location,remote_policy,compensation_text,employment_type,description_md,last_seen_at,company:scan_companies(name)")
      .in("id", ids);
    if (detailError) throw new HttpError(500, "unable to load job details");

    const relevance = new Map(ranked.map((item) => [item.job.id, item.relevance]));
    const evaluatedAt = new Date().toISOString();
    const rows = ((detailed ?? []) as unknown as JobMetadata[]).map((job) => {
      const company = companyName(job.company);
      const fit = evaluateCareerFit(candidate, {
        title: job.title,
        company,
        location: job.location,
        remotePolicy: job.remote_policy,
        compensationText: job.compensation_text,
        // Portal labels vary (Full-time, full_time, FULL TIME). Canonicalize
        // before the shared gate so a formatting difference never excludes a job.
        employmentType: canonicalEmploymentType(job.employment_type),
        description: job.description_md,
      });
      const tier = tierFor(fit.score, fit.eligible);
      const gaps = unique([...fit.hardFilters, ...fit.dimensions.flatMap((dimension) => dimension.gaps)]).slice(0, 12);
      const strongest = fit.dimensions
        .filter((dimension) => ["role", "skills", "experience"].includes(dimension.key))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((item) => item.label);
      const roleEvidence = fit.dimensions.find((dimension) => dimension.key === "role")?.evidence[0];
      const experienceEvidence = fit.dimensions.find((dimension) => dimension.key === "experience")?.evidence[0];
      const summary = [
        `${fit.score}% career fit${strongest.length ? `, led by ${strongest.join(" and ").toLowerCase()}` : ""}.`,
        roleEvidence,
        experienceEvidence,
        !fit.eligible && fit.hardFilters[0] ? `Autopilot will wait for review: ${fit.hardFilters[0]}` : null,
      ].filter(Boolean).join(" ");
      return {
        user_id: user.id,
        scanned_job_id: job.id,
        resume_id: stringValue(resume.id) || null,
        score: Math.round((fit.score / 20) * 100) / 100,
        fit_score: fit.score,
        fit_confidence: fit.confidence,
        eligible: fit.eligible,
        dimension_scores: fit.dimensions,
        hard_filters: fit.hardFilters,
        score_version: fit.version,
        archetype: "Other",
        tier,
        summary,
        keyword_matches: fit.matchedSkills,
        gaps,
        star_stories: [],
        report_md: null,
        model: "deterministic-career-fit",
        tokens_in: 0,
        tokens_out: 0,
        evaluated_at: evaluatedAt,
        _relevance: relevance.get(job.id) ?? 0,
      };
    });

    const persisted = rows
      .filter((row) => row.fit_score >= MIN_PUBLISHED_FIT)
      .filter((row) => !row.hard_filters.some((filter) => /outside selected countries/i.test(filter)))
      .filter((row) => !row.hard_filters.some((filter) => /outside selected seniority|not credible|experience gap exceeds/i.test(filter)))
      .filter((row) => {
        const dimensions = Array.isArray(row.dimension_scores) ? row.dimension_scores : [];
        const role = dimensions.find((dimension) => dimension.key === "role")?.score ?? 0;
        const skills = dimensions.find((dimension) => dimension.key === "skills")?.score ?? 0;
        return role >= 52 || (role >= 45 && skills >= 60);
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.fit_score - a.fit_score || b._relevance - a._relevance)
      .slice(0, MAX_EVALUATIONS)
      .map(({ _relevance: _ignored, ...row }) => row);
    // Never overwrite a manually requested AI evaluation or a dismissed row:
    // the upsert would wipe the paid report/STAR stories (and relabel the row
    // deterministic, making it eligible for the stale cleanup below).
    const { data: existingEvaluations } = persisted.length > 0
      ? await svc.from("job_evaluations")
        .select("scanned_job_id,model,dismissed_at")
        .eq("user_id", user.id)
        .in("scanned_job_id", persisted.map((row) => row.scanned_job_id))
      : { data: [] };
    const refreshable = withoutPreservedEvaluations(persisted, (existingEvaluations || []) as ExistingEvaluation[]);
    if (refreshable.length > 0) {
      const { error: saveError } = await svc.from("job_evaluations")
        .upsert(refreshable, { onConflict: "user_id,scanned_job_id" });
      if (saveError) throw new HttpError(500, "unable to save match feed");
    }

    // Remove stale deterministic suggestions that are no longer in the user's
    // current resume-ranked shortlist. Manually requested explanations remain.
    // NEVER delete evaluations that have application drafts linked:
    // draft_applications.evaluation_id is ON DELETE CASCADE, so this cleanup
    // was silently wiping ready/queued drafts (and their tailored resumes'
    // submission state) on every refresh.
    const { data: linkedDrafts } = await svc.from("draft_applications")
      .select("evaluation_id")
      .eq("user_id", user.id);
    const linkedEvaluationIds = [...new Set((linkedDrafts || [])
      .map((draft: { evaluation_id: string | null }) => draft.evaluation_id)
      .filter((id: string | null): id is string => Boolean(id)))];
    const publishedIds = persisted.map((row) => row.scanned_job_id);
    let staleQuery = svc.from("job_evaluations")
      .delete()
      .eq("user_id", user.id)
      .eq("model", "deterministic-career-fit")
      // Dismissed rows remember "Passed" so the job does not resurface.
      .is("dismissed_at", null);
    if (publishedIds.length > 0) {
      staleQuery = staleQuery.not("scanned_job_id", "in", `(${publishedIds.join(",")})`);
    }
    if (linkedEvaluationIds.length > 0) {
      staleQuery = staleQuery.not("id", "in", `(${linkedEvaluationIds.join(",")})`);
    }
    await staleQuery;

    return jsonResponse({
      evaluated: persisted.length,
      eligible: persisted.filter((row) => row.eligible).length,
      tokens_used: 0,
      version: "resume-story-v2",
      minimum_published_fit: MIN_PUBLISHED_FIT,
      experience_years: candidate.yearsExperience,
      experience_source: candidate.yearsExperienceSource,
      resume_roles_reviewed: candidate.roleHistory.length,
      ai_role_families_reviewed: reviewedRoleFamilies.length + reviewedAdjacentRoles.length,
    });
  });
});

function normalizeTerms(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
}

function canonicalEmploymentType(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["fulltime", "permanent", "regular"].includes(compact)) return "full_time";
  if (compact === "parttime") return "part_time";
  if (["contract", "contractor", "temporary", "temp", "fixedterm"].includes(compact)) return "contract";
  if (["intern", "internship"].includes(compact)) return "internship";
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function titleRelevance(title: string, targets: string[]): number {
  if (targets.length === 0) return 1;
  const normalizedTitle = title.toLowerCase();
  const titleTokens = new Set(normalizedTitle.split(/[^a-z0-9+#.]+/).filter((token) => token.length > 1));
  let best = 0;
  for (const target of targets) {
    if (normalizedTitle.includes(target)) best = Math.max(best, 100);
    const tokens = target
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => token.length > 1 && !["senior", "junior", "lead", "staff", "principal"].includes(token));
    const overlap = tokens.filter((token) => titleTokens.has(token)).length;
    best = Math.max(best, Math.round((overlap / Math.max(1, tokens.length)) * 80));
  }
  return best;
}

function inferResumeCountry(
  resume: Record<string, unknown>,
  profileLocation: unknown,
  desiredLocations: unknown,
): string | null {
  const personal = resume.personal_info && typeof resume.personal_info === "object"
    ? resume.personal_info as Record<string, unknown>
    : {};
  const header = resume.header && typeof resume.header === "object"
    ? resume.header as Record<string, unknown>
    : {};
  const values = [
    personal.location,
    header.location,
    profileLocation,
    ...(Array.isArray(desiredLocations) ? desiredLocations : []),
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/\b(united states|u\.?s\.?a?|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|ohio|oklahoma|oregon|pennsylvania|tennessee|texas|utah|vermont|virginia|washington|wisconsin|wyoming|dallas|austin|chicago|new york|san francisco|seattle)\b/.test(values)) return "United States";
  if (/\bcanada|toronto|vancouver\b/.test(values)) return "Canada";
  if (/\bunited kingdom|london|uk\b/.test(values)) return "United Kingdom";
  if (/\bindia|hyderabad|bengaluru|bangalore|chennai|mumbai|delhi\b/.test(values)) return "India";
  return null;
}

function companyName(value: JobMetadata["company"]): string {
  if (Array.isArray(value)) return value[0]?.name || "the company";
  return value?.name || "the company";
}

function uniqueByJob<T extends { job: { id: string } }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.job.id)) return false;
    seen.add(item.job.id);
    return true;
  });
}

function reviewRoleTerms(value: unknown, key = "name"): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const term = (item as Record<string, unknown>)[key];
    return typeof term === "string" && term.trim() ? [term.trim()] : [];
  });
}


function tierFor(score: number, eligible: boolean): "A" | "B" | "C" | "D" | "F" {
  if (!eligible) return "F";
  if (score >= 90) return "A";
  if (score >= 76) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

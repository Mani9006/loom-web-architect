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
  type CandidatePreferences,
} from "../_shared/career-fit.ts";
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

const MAX_EVALUATIONS = 80;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as { user_id?: string };
    const user = await getAuthedUserOrService(req, body.user_id);
    const svc = serviceClient();
    const [{ data: resumes }, { data: prefRow }, { data: profile }, { data: metadata, error: jobsError }] = await Promise.all([
      svc.from("resumes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1),
      svc.from("user_job_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      svc.from("profiles")
        .select("years_of_experience,seniority_level,desired_roles,desired_locations,preferred_work_type,work_authorization,blacklisted_companies")
        .eq("user_id", user.id).maybeSingle(),
      svc.from("scanned_jobs")
        .select("id,title,location,remote_policy,compensation_text,employment_type,last_seen_at,company:scan_companies(name)")
        .eq("is_live", true)
        .order("last_seen_at", { ascending: false })
        .limit(2000),
    ]);
    if (jobsError) throw new HttpError(500, "unable to load current jobs");

    const resume = resumes?.[0] as unknown as Record<string, unknown> | undefined;
    if (!resume) throw new HttpError(412, "Add a source resume before building matches");

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
    const targets = normalizeTerms(
      prefs.target_roles?.length ? prefs.target_roles : [candidate.currentTitle],
    );
    const negatives = normalizeTerms(rawPrefs.negative_keywords ?? []);

    const ranked = ((metadata ?? []) as unknown as JobMetadata[])
      .filter((job) => !negatives.some((term) => job.title.toLowerCase().includes(term)))
      .map((job) => ({ job, relevance: titleRelevance(job.title, targets) }))
      .filter((item) => targets.length === 0 || item.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance || b.job.last_seen_at.localeCompare(a.job.last_seen_at))
      .slice(0, MAX_EVALUATIONS);

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
      const strongest = [...fit.dimensions].sort((a, b) => b.score - a.score).slice(0, 2).map((item) => item.label);
      const summary = fit.eligible
        ? `${fit.score}% career fit${strongest.length ? `, led by ${strongest.join(" and ").toLowerCase()}` : ""}.`
        : `Blocked by a hard preference: ${fit.hardFilters[0] || gaps[0] || "candidate preference mismatch"}.`;
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
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.fit_score - a.fit_score || b._relevance - a._relevance)
      .map(({ _relevance: _ignored, ...row }) => row);
    const { error: saveError } = await svc.from("job_evaluations")
      .upsert(persisted, { onConflict: "user_id,scanned_job_id" });
    if (saveError) throw new HttpError(500, "unable to save match feed");

    return jsonResponse({
      evaluated: persisted.length,
      eligible: persisted.filter((row) => row.eligible).length,
      tokens_used: 0,
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
    const tokens = target.split(/[^a-z0-9+#.]+/).filter((token) => token.length > 1);
    const overlap = tokens.filter((token) => titleTokens.has(token)).length;
    best = Math.max(best, Math.round((overlap / Math.max(1, tokens.length)) * 80));
  }
  return best;
}

function companyName(value: JobMetadata["company"]): string {
  if (Array.isArray(value)) return value[0]?.name || "the company";
  return value?.name || "the company";
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

/**
 * ats-score-v2
 *
 * Legacy structured generic résumé-quality scorer.
 *
 * It deliberately does not calculate a job-description match.
 * `career-ops-ats` is the single authoritative job-match endpoint.
 *
 * Input:
 *   { resume: ResumeJSON }
 * Output:
 *   {
 *     overall: 0–100,
 *     passesATS: boolean,
 *     summary: string,
 *     sections: [{ name, score, max, issues: [...] }],
 *     score_kind: "resume_quality",
 *   }
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
import { estimatePaginationRisk } from "../_shared/ats-deterministic.ts";

interface RequestBody {
  resume?: unknown;
  job_description?: unknown;
}

interface Issue {
  id: string;
  severity: "critical" | "warning" | "suggestion";
  title: string;
  description: string;
  section: string;
}

interface SectionScore {
  name: string;
  score: number;
  max: number;
  issues: Issue[];
}

Deno.serve((req) =>
  withErrorHandler(async () => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");

    const user = await getAuthedUser(req);
    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    await enforceDailyCap(svc, user.id, "ats", isPro);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const resume = body.resume as Record<string, unknown> | undefined;
    const jd = typeof body.job_description === "string" ? body.job_description.trim() : "";

    if (!resume || typeof resume !== "object") throw new HttpError(400, "resume is required");
    if (jd) throw new HttpError(400, "Job-specific matching is available only through career-ops-ats");

    const sections = scoreDeterministic(resume);
    const overall = sections.reduce((sum, s) => sum + s.score, 0);

    const allIssues = sections.flatMap((s) => s.issues);
    const passesATS = overall >= 70;
    const summary = buildSummary(overall, allIssues);

    return jsonResponse({
      overall,
      score_kind: "resume_quality",
      resume_quality_score: overall,
      job_match_score: null,
      methodology_version: "resume-quality-v2",
      passesATS,
      summary,
      sections,
      model: "rules-only",
      tokens_in: 0,
      tokens_out: 0,
    });
  }),
);

// ─── Deterministic scorer ─────────────────────────────────────────────────
// Mirrors the rules in src/lib/ats-scorer.ts, with the same weights, so v2
// server-side scores match v2 client-side scores. (Client uses this as a
// snappy preview; server is the authoritative score logged for users.)

const STRONG_VERBS = new Set([
  "achieved","accelerated","administered","analyzed","architected","automated",
  "built","championed","collaborated","configured","consolidated","created",
  "decreased","delivered","deployed","designed","developed","directed",
  "drove","eliminated","enabled","engineered","enhanced","established",
  "exceeded","executed","expanded","facilitated","formulated","generated",
  "grew","guided","identified","implemented","improved","increased",
  "initiated","innovated","integrated","introduced","launched","led",
  "managed","maximized","mentored","migrated","minimized","modernized",
  "negotiated","optimized","orchestrated","organized","oversaw","partnered",
  "pioneered","planned","presented","produced","programmed","propelled",
  "published","realized","recommended","reduced","refined",
  "resolved","restructured","revamped","scaled","secured","simplified",
  "spearheaded","standardized","streamlined","strengthened","supervised",
  "surpassed","tested","trained","transformed","tripled","unified","upgraded",
]);

const METRIC_RX = /(\b\d+(?:\.\d+)?\s*%|\$\s?[\d,]+(?:\.\d+)?[kKmMbB]?|\b\d{2,}\b)/;

function scoreDeterministic(resume: Record<string, unknown>): SectionScore[] {
  return [
    scoreHeader(resume),
    scoreSummary(resume),
    scoreExperience(resume),
    scoreEducation(resume),
    scoreSkills(resume),
    scoreFormatting(resume),
    scoreContent(resume),
  ];
}

function scoreHeader(r: Record<string, unknown>): SectionScore {
  const h = (r.header as Record<string, string>) ?? {};
  const issues: Issue[] = [];
  let score = 0;
  if (h.name?.trim()) score += 3; else issues.push({ id: "h1", severity: "critical", title: "Missing name", description: "Header has no name.", section: "Header" });
  if (h.email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) score += 3; else issues.push({ id: "h2", severity: "critical", title: "Missing or invalid email", description: "Header needs a valid email.", section: "Header" });
  if (h.phone?.trim()) score += 2; else issues.push({ id: "h3", severity: "warning", title: "Missing phone", description: "Recruiters expect a phone number.", section: "Header" });
  if (h.location?.trim()) score += 1; else issues.push({ id: "h4", severity: "suggestion", title: "Add location", description: "Location helps with proximity filters.", section: "Header" });
  if (h.linkedin?.trim()) score += 1; else issues.push({ id: "h5", severity: "suggestion", title: "Add LinkedIn", description: "A LinkedIn URL boosts ATS keyword density.", section: "Header" });
  return { name: "Header", score, max: 10, issues };
}

function scoreSummary(r: Record<string, unknown>): SectionScore {
  const s = (r.summary as string) ?? "";
  const issues: Issue[] = [];
  let score = 0;
  const wc = s.trim().split(/\s+/).filter(Boolean).length;
  if (wc === 0) {
    issues.push({ id: "s1", severity: "critical", title: "No summary", description: "Add a 2–3 sentence summary.", section: "Summary" });
  } else if (wc < 25) {
    score += 5;
    issues.push({ id: "s2", severity: "warning", title: "Summary too short", description: "Aim for 40–80 words: role + years + signature impact.", section: "Summary" });
  } else if (wc <= 90) {
    score += 10;
  } else {
    score += 6;
    issues.push({ id: "s3", severity: "warning", title: "Summary too long", description: "Keep it under ~90 words.", section: "Summary" });
  }
  return { name: "Summary", score, max: 10, issues };
}

function scoreExperience(r: Record<string, unknown>): SectionScore {
  const xs = (r.experience as Array<{ role?: string; bullets?: string[]; start_date?: string; end_date?: string }>) ?? [];
  const issues: Issue[] = [];
  let score = 0;
  if (xs.length === 0) {
    issues.push({ id: "x1", severity: "critical", title: "No experience", description: "ATS will reject a resume with no work history.", section: "Experience" });
    return { name: "Experience", score: 0, max: 30, issues };
  }

  // 10 pts: presence + basic completeness
  score += 6;
  if (xs.every((x) => x.role && x.start_date)) score += 4;
  else issues.push({ id: "x2", severity: "warning", title: "Incomplete entries", description: "Every job needs a role + start date.", section: "Experience" });

  // 10 pts: bullets quality (action verbs, metrics)
  const allBullets = xs.flatMap((x) => x.bullets ?? []);
  if (allBullets.length === 0) {
    issues.push({ id: "x3", severity: "critical", title: "No bullets", description: "Each role needs 3–5 quantified bullets.", section: "Experience" });
  } else {
    const verbHits = allBullets.filter((b) => STRONG_VERBS.has(b.trim().split(/\s+/)[0]?.toLowerCase() ?? "")).length;
    const verbPct = verbHits / allBullets.length;
    score += Math.round(verbPct * 5);
    if (verbPct < 0.6) issues.push({ id: "x4", severity: "warning", title: "Weak verbs", description: "Start bullets with strong action verbs (Led, Built, Reduced).", section: "Experience" });

    const metricHits = allBullets.filter((b) => METRIC_RX.test(b)).length;
    const metricPct = metricHits / allBullets.length;
    score += Math.round(metricPct * 5);
    if (metricPct < 0.4) issues.push({ id: "x5", severity: "warning", title: "Not enough metrics", description: "Quantify impact in at least 40% of bullets ($, %, count).", section: "Experience" });
  }

  // 10 pts: count + recency
  if (xs.length >= 2) score += 5;
  const hasRecent = xs.some((x) => /present|current/i.test(x.end_date ?? "") || /20[2-9]\d/.test(x.end_date ?? ""));
  if (hasRecent) score += 5;
  else issues.push({ id: "x6", severity: "warning", title: "No recent role", description: "Include a current or recent role.", section: "Experience" });

  return { name: "Experience", score: Math.min(score, 30), max: 30, issues };
}

function scoreEducation(r: Record<string, unknown>): SectionScore {
  const eds = (r.education as Array<{ degree?: string; institution?: string }>) ?? [];
  const issues: Issue[] = [];
  let score = 0;
  if (eds.length === 0) {
    issues.push({ id: "e1", severity: "warning", title: "No education", description: "Most ATS expect an education section.", section: "Education" });
    return { name: "Education", score: 4, max: 10, issues };
  }
  if (eds.every((e) => e.degree && e.institution)) score = 10;
  else { score = 6; issues.push({ id: "e2", severity: "suggestion", title: "Incomplete entries", description: "Each entry needs degree + institution.", section: "Education" }); }
  return { name: "Education", score, max: 10, issues };
}

function scoreSkills(r: Record<string, unknown>): SectionScore {
  const sk = (r.skills as Record<string, string[]>) ?? {};
  const issues: Issue[] = [];
  const cats = Object.keys(sk);
  const total = cats.reduce((sum, c) => sum + (sk[c]?.length ?? 0), 0);
  let score = 0;
  if (total === 0) {
    issues.push({ id: "k1", severity: "critical", title: "No skills listed", description: "ATS keyword matching depends on a Skills section.", section: "Skills" });
  } else if (total < 8) {
    score = 6;
    issues.push({ id: "k2", severity: "warning", title: "Sparse skills", description: "List at least 8–15 relevant hard skills.", section: "Skills" });
  } else if (total <= 30) {
    score = 15;
  } else {
    score = 12;
    issues.push({ id: "k3", severity: "suggestion", title: "Skill list too long", description: "Trim to your strongest 20–25 skills; ATS may dilute relevance.", section: "Skills" });
  }
  return { name: "Skills", score, max: 15, issues };
}

function scoreFormatting(r: Record<string, unknown>): SectionScore {
  const issues: Issue[] = [];
  let score = 8;
  // Date format consistency is a real ATS failure mode. Check experience dates.
  const xs = (r.experience as Array<{ start_date?: string; end_date?: string }>) ?? [];
  const validDate = (d: string | undefined) =>
    !d || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(d) || /^\d{1,2}\/\d{4}$/.test(d) || /^\d{4}$/.test(d) || /^(present|current)$/i.test(d);
  const allValid = xs.every((x) => validDate(x.start_date) && validDate(x.end_date));
  if (allValid) score = 10;
  else issues.push({ id: "f1", severity: "warning", title: "Inconsistent date format", description: "Use 'Jan 2024' or 'MM/YYYY' consistently.", section: "Formatting" });

  // Pagination/format risk: estimated from content length vs the shared
  // ATS_PDF_SPEC template metrics (the scorer cannot see the rendered PDF).
  // Surfaced as format issues only — no score penalty beyond the above.
  const pagination = estimatePaginationRisk(r);
  if (pagination.risk === "spill") {
    issues.push({ id: "f2", severity: "warning", title: "Content slightly overflows one page", description: "The rendered PDF would spill a few lines onto a nearly-empty page 2. The export auto-tightens spacing to fit; trim a line or two to be safe.", section: "Formatting" });
  } else if (pagination.risk === "oversize-entry") {
    issues.push({ id: "f3", severity: "warning", title: "One entry is taller than a page", description: "A single experience/project entry exceeds a full page and will split across pages. Split it into two entries or trim bullets.", section: "Formatting" });
  } else if (pagination.risk === "multi-page") {
    issues.push({ id: "f4", severity: "suggestion", title: `Resume runs ~${pagination.estimatedPages} pages`, description: "Pagination breaks at entry boundaries so no entry splits. Keep it to one page unless you have 10+ years of experience.", section: "Formatting" });
  }
  return { name: "Formatting", score, max: 10, issues };
}

function scoreContent(r: Record<string, unknown>): SectionScore {
  const xs = (r.experience as Array<{ bullets?: string[] }>) ?? [];
  const bullets = xs.flatMap((x) => x.bullets ?? []);
  const issues: Issue[] = [];
  let score = 5;
  if (bullets.length > 0) {
    const long = bullets.filter((b) => b.length > 240).length;
    const tooLong = long / bullets.length;
    if (tooLong < 0.2) score += 5;
    else issues.push({ id: "c1", severity: "warning", title: "Bullets too long", description: "Keep bullets under ~240 chars (~2 lines).", section: "Content" });

    const firstPerson = bullets.filter((b) => /\b(i|my|me)\b/i.test(b)).length;
    if (firstPerson === 0) score += 5;
    else issues.push({ id: "c2", severity: "warning", title: "First-person pronouns", description: "Avoid 'I', 'me', 'my' in resume bullets.", section: "Content" });
  } else {
    issues.push({ id: "c3", severity: "critical", title: "No content to evaluate", description: "Add bullets to your experience.", section: "Content" });
    score = 0;
  }
  return { name: "Content", score: Math.min(score, 15), max: 15, issues };
}

// ─── Summary text ─────────────────────────────────────────────────────────

function buildSummary(overall: number, issues: Issue[]): string {
  const critical = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const tier =
    overall >= 90 ? "Strong résumé-quality signals under this checklist." :
    overall >= 75 ? "Good résumé-quality signals." :
    overall >= 60 ? "Decent — fix warnings before applying." :
    "Needs work under the résumé-quality checklist.";
  const fixes = critical > 0 ? ` ${critical} critical issue${critical > 1 ? "s" : ""} to fix.` :
                warnings > 0 ? ` ${warnings} warning${warnings > 1 ? "s" : ""} to address.` : "";
  return `${tier}${fixes} This is not a prediction of an employer screening result.`;
}

/**
 * Deterministic, explainable career-fit scoring shared by career-ops functions.
 *
 * The LLM may explain or tailor after this gate, but it must not override hard
 * eligibility failures or manufacture evidence. Keeping the gate deterministic
 * makes the same resume + preferences + job produce the same decision.
 */

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";
export type Seniority = "intern" | "entry" | "mid" | "senior" | "staff" | "manager" | "director" | "executive" | "unknown";

export interface CandidatePreferences {
  target_roles?: string[];
  negative_keywords?: string[];
  excluded_companies?: string[];
  locations?: string[];
  target_countries?: string[];
  work_modes?: string[];
  employment_types?: string[];
  seniority_levels?: string[];
  min_years_experience?: number | null;
  max_years_experience?: number | null;
  comp_target_usd_min?: number | null;
  comp_target_usd_max?: number | null;
  work_authorization?: string | null;
  requires_sponsorship?: boolean;
  require_salary_disclosure?: boolean;
  max_stretch_years?: number;
  years_of_experience?: number | null;
}

export interface CandidateCareerProfile {
  currentTitle: string;
  /** Every role from the source resume, newest first. */
  roleHistory: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    evidenceText: string;
  }>;
  yearsExperience: number;
  yearsExperienceSource: "profile" | "resume_timeline";
  seniority: Seniority;
  skills: string[];
  /** Source-grounded client/role locations for each detected tool. */
  skillEvidence: Record<string, string[]>;
  preferences: CandidatePreferences;
}

export interface JobForFit {
  title: string;
  company?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  compensationText?: string | null;
  employmentType?: string | null;
  description?: string | null;
}

export interface FitDimension {
  key: "role" | "skills" | "experience" | "location" | "compensation" | "authorization";
  label: string;
  score: number;
  weight: number;
  evidence: string[];
  gaps: string[];
}

export interface CareerFitResult {
  score: number;
  confidence: number;
  eligible: boolean;
  dimensions: FitDimension[];
  hardFilters: string[];
  matchedSkills: string[];
  missingSkills: string[];
  inferred: {
    requiredYears: number | null;
    seniority: Seniority;
    workMode: WorkMode;
    country: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
  };
  version: "career-fit-v2";
}

type ResumeLike = Record<string, unknown>;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
  october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const SKILL_CATALOG = [
  "accessibility", "agile", "airflow", "ansible", "apache kafka", "apache spark",
  "aws", "azure", "c#", "c++", "ci/cd", "css", "databricks", "dbt", "docker",
  "elasticsearch", "excel", "fastapi", "figma", "flask", "gcp", "git", "go",
  "graphql", "hadoop", "html", "java", "javascript", "jenkins", "jira", "kotlin",
  "kubernetes", "langchain", "machine learning", "microservices", "mongodb", "mysql",
  "next.js", "node.js", "nosql", "openai", "pandas", "php", "postgresql", "power bi",
  "product strategy", "project management", "prometheus", "pytorch", "r", "react",
  "redis", "rest api", "ruby", "rust", "salesforce", "scala", "scrum", "snowflake",
  "spring boot", "sql", "swift", "tableau", "tailwind", "tensorflow", "terraform",
  "typescript", "vue", "workday",
];

const ROLE_STOP_WORDS = new Set([
  "and", "engineer", "engineering", "developer", "development", "lead", "manager",
  "principal", "senior", "sr", "staff", "director", "head", "specialist", "the",
]);

const PROTECTED_ROLE_FAMILIES: RegExp[] = [
  /\b(account executive|sales representative|sales manager|business development|customer success)\b/i,
  /\b(marketing|growth marketer|content strategist|social media)\b/i,
  /\b(product designer|ux designer|ui designer|graphic designer|visual designer)\b/i,
  /\b(recruiter|talent acquisition|human resources|people operations)\b/i,
  /\b(attorney|lawyer|legal counsel|paralegal)\b/i,
  /\b(nurse|physician|pharmacist|therapist|clinical practitioner)\b/i,
  /\b(accountant|controller|auditor|treasury analyst)\b/i,
  /\b(android engineer|ios engineer|mobile developer)\b/i,
];

const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": ["united states", "usa", "u.s.", "us only", "new york", "california", "texas", "chicago", "seattle", "boston", "austin", "dallas", "san francisco"],
  canada: ["canada", "canadian", "toronto", "vancouver", "montreal"],
  "united kingdom": ["united kingdom", "uk", "uk only", "great britain", "england", "scotland", "london", "manchester"],
  india: ["india", "indian", "hyderabad", "bengaluru", "bangalore", "chennai", "mumbai", "delhi", "pune"],
  germany: ["germany", "deutschland", "berlin", "munich"],
  france: ["france", "paris"],
  australia: ["australia", "sydney", "melbourne"],
  ireland: ["ireland", "dublin"],
  qatar: ["qatar", "doha"],
  "united arab emirates": ["united arab emirates", "uae", "dubai", "abu dhabi"],
  singapore: ["singapore"],
  japan: ["japan", "tokyo"],
  "south korea": ["south korea", "republic of korea", "seoul"],
  "hong kong": ["hong kong"],
  switzerland: ["switzerland", "zurich", "geneva"],
  sweden: ["sweden", "stockholm"],
  denmark: ["denmark", "copenhagen"],
  norway: ["norway", "oslo"],
  poland: ["poland", "warsaw", "krakow"],
  netherlands: ["netherlands", "amsterdam"],
  spain: ["spain", "madrid", "barcelona"],
  brazil: ["brazil", "sao paulo", "rio de janeiro"],
  mexico: ["mexico", "mexico city"],
};

export function buildCandidateCareerProfile(
  resume: ResumeLike,
  preferences: CandidatePreferences = {},
): CandidateCareerProfile {
  const experience = asRecords(resume.experience);
  const personalInfo = asRecord(resume.personal_info) ?? asRecord(resume.header) ?? {};
  const current = experience.find((item) => /present|current/i.test(stringValue(item.end_date))) ?? experience[0] ?? {};
  const currentTitle = firstNonEmpty(
    stringValue(current.role),
    stringValue(current.title),
    stringValue(personalInfo.title),
    stringValue(resume.title),
  );
  const calculatedYears = calculateExperienceYears(experience);
  const statedYears = numberOrNull((preferences as Record<string, unknown>).years_of_experience);
  const yearsExperience = statedYears ?? calculatedYears;
  const skills = collectResumeSkills(resume);
  const roleHistory = experience
    .map((item) => ({
      title: firstNonEmpty(stringValue(item.role), stringValue(item.title)),
      company: firstNonEmpty(stringValue(item.company_or_client), stringValue(item.company), stringValue(item.client)),
      startDate: stringValue(item.start_date),
      endDate: stringValue(item.end_date),
      evidenceText: [
        ...stringArray(item.bullets),
        stringValue(item.environment),
        stringValue(item.responsibilities),
      ].filter(Boolean).join(" "),
    }))
    .filter((item) => item.title || item.evidenceText);
  const skillEvidence = buildSkillEvidence(skills, roleHistory);

  return {
    currentTitle,
    roleHistory,
    yearsExperience,
    yearsExperienceSource: statedYears !== null ? "profile" : "resume_timeline",
    seniority: inferCandidateSeniority(currentTitle, yearsExperience),
    skills,
    skillEvidence,
    preferences,
  };
}

export function evaluateCareerFit(candidate: CandidateCareerProfile, job: JobForFit): CareerFitResult {
  const prefs = candidate.preferences;
  const combined = normalize([job.title, job.company, job.location, job.remotePolicy, job.employmentType, job.description].filter(Boolean).join(" "));
  const jobSkills = extractJobSkills(combined);
  const candidateSkills = unique(candidate.skills.map(normalize).filter(Boolean));
  const matchedSkills = jobSkills.filter((skill) => candidateSkills.some((candidateSkill) => skillsOverlap(candidateSkill, skill)));
  const missingSkills = jobSkills.filter((skill) => !matchedSkills.includes(skill));
  const requiredYears = inferRequiredYears(job.description ?? "");
  const jobSeniority = inferJobSeniority(job.title, requiredYears);
  const workMode = inferWorkMode(job.remotePolicy, job.location, job.description);
  const country = inferCountry([job.location, job.description?.slice(0, 1800)].filter(Boolean).join(" "));
  const salary = inferSalary(job.compensationText ?? job.description ?? "");
  const hardFilters: string[] = [];

  applyNegativeKeywordGate(prefs, combined, hardFilters);
  applyCompanyGate(prefs, job.company, hardFilters);
  applyWorkModeGate(prefs, workMode, hardFilters);
  applyCountryGate(prefs, country, hardFilters);
  applySeniorityGate(candidate, jobSeniority, requiredYears, hardFilters);
  applyExperiencePreferenceGate(prefs, requiredYears, hardFilters);
  applyAuthorizationGate(prefs, combined, hardFilters);
  applyEmploymentTypeGate(prefs, job.employmentType, hardFilters);
  applySalaryGate(prefs, salary, hardFilters);

  const dimensions: FitDimension[] = [
    scoreRole(candidate, job),
    scoreSkills(candidate, jobSkills, matchedSkills, missingSkills),
    scoreExperience(candidate, requiredYears, jobSeniority),
    scoreLocation(prefs, job, workMode),
    scoreCompensation(prefs, salary),
    scoreAuthorization(prefs, combined),
  ];

  const weighted = dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) /
    dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const confidence = calculateConfidence(job, jobSkills, requiredYears, workMode, salary);
  const eligible = hardFilters.length === 0;
  const score = Math.round(clamp(weighted - (eligible ? 0 : 28), 0, 100));

  return {
    score,
    confidence,
    eligible,
    dimensions,
    hardFilters,
    matchedSkills,
    missingSkills,
    inferred: {
      requiredYears,
      seniority: jobSeniority,
      workMode,
      country,
      salaryMin: salary.min,
      salaryMax: salary.max,
    },
    version: "career-fit-v2",
  };
}

export function calculateExperienceYears(experience: Array<Record<string, unknown>>, now = new Date()): number {
  const intervals = experience
    .map((item) => {
      const start = parseMonth(stringValue(item.start_date), now);
      const end = parseMonth(stringValue(item.end_date), now, true);
      return start && end && end >= start ? [start, end] as const : null;
    })
    .filter((value): value is readonly [number, number] => value !== null)
    .sort((a, b) => a[0] - b[0]);

  if (intervals.length === 0) return 0;
  const merged: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    const previous = merged.at(-1);
    if (!previous || start > previous[1] + 1) merged.push([start, end]);
    else previous[1] = Math.max(previous[1], end);
  }
  const months = merged.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
  return Math.round((months / 12) * 10) / 10;
}

export function isRoleFamilyCompatible(jobTitle: string, groundedRoleTerms: string[]): boolean {
  const protectedFamily = PROTECTED_ROLE_FAMILIES.find((pattern) => pattern.test(jobTitle));
  if (!protectedFamily) return true;
  return groundedRoleTerms.some((term) => protectedFamily.test(term));
}

function scoreRole(candidate: CandidateCareerProfile, job: JobForFit): FitDimension {
  const preferenceTargets = (candidate.preferences.target_roles ?? []).map(normalize).filter(Boolean);
  const resumeRoles = candidate.roleHistory.map((role) => normalize(role.title)).filter(Boolean);
  const targets = unique([...preferenceTargets, candidate.currentTitle, ...resumeRoles].map(normalize).filter(Boolean));
  if (targets.length === 0) {
    return dimension("role", "Role alignment", 45, 25, [], ["Add target roles to improve matching confidence."]);
  }
  const title = normalize(job.title);
  const similarities = targets.map((target) => roleSimilarity(target, title));
  const best = Math.max(...similarities);
  const bestTarget = targets[similarities.indexOf(best)];
  const matchingHistory = candidate.roleHistory.find((role) => normalize(role.title) === bestTarget);
  const evidence = best >= 52
    ? [matchingHistory
      ? `Prior ${matchingHistory.title} experience${matchingHistory.company ? ` at ${matchingHistory.company}` : ""} supports this role family.`
      : `${job.title} aligns with the saved target ${bestTarget}.`]
    : [];
  const gaps = best < 52 ? ["The job title has limited overlap with demonstrated or selected role families."] : [];
  return dimension("role", "Role alignment", best, 25, evidence, gaps);
}

function scoreSkills(candidate: CandidateCareerProfile, jobSkills: string[], matched: string[], missing: string[]): FitDimension {
  if (jobSkills.length === 0) {
    return dimension("skills", "Demonstrated skills", 55, 30, [], ["The posting does not expose enough concrete skills for a high-confidence score."]);
  }
  const score = Math.round((matched.length / jobSkills.length) * 100);
  return dimension(
    "skills",
    "Demonstrated skills",
    score,
    30,
    matched.slice(0, 8).map((skill) => {
      const sources = candidate.skillEvidence[normalize(skill)] ?? [];
      return sources.length > 0
        ? `${display(skill)} is demonstrated in ${sources.slice(0, 2).join(" and ")}.`
        : `The source resume explicitly lists ${display(skill)}.`;
    }),
    missing.slice(0, 8).map((skill) => `No resume evidence found for ${display(skill)}.`),
  );
}

function scoreExperience(candidate: CandidateCareerProfile, requiredYears: number | null, seniority: Seniority): FitDimension {
  const evidence = [candidate.yearsExperienceSource === "profile"
    ? `Candidate-confirmed total experience is ${candidate.yearsExperience.toFixed(1)} years.`
    : `Non-overlapping dates across ${candidate.roleHistory.length || "the"} resume ${candidate.roleHistory.length === 1 ? "role" : "roles"} support about ${candidate.yearsExperience.toFixed(1)} years.`];
  const gaps: string[] = [];
  let score = 70;

  if (requiredYears !== null) {
    const delta = candidate.yearsExperience - requiredYears;
    if (delta >= 0) score = delta > 7 ? 82 : 100;
    else if (delta >= -1) score = 75;
    else if (delta >= -2) score = 50;
    else score = 15;
    if (delta < 0) gaps.push(`Posting asks for ${requiredYears}+ years; resume shows about ${candidate.yearsExperience.toFixed(1)}.`);
    else evidence.push(`Meets the ${requiredYears}+ year requirement.`);
  }

  const seniorityDistance = Math.abs(seniorityRank(seniority) - seniorityRank(candidate.seniority));
  if (seniority !== "unknown" && candidate.seniority !== "unknown") {
    if (seniorityDistance === 0) score = Math.min(100, score + 8);
    else if (seniorityDistance >= 2) {
      score = Math.min(score, 30);
      gaps.push(`Resume reads as ${candidate.seniority}; posting reads as ${seniority}.`);
    }
  }
  return dimension("experience", "Experience and level", score, 20, evidence, gaps);
}

function scoreLocation(prefs: CandidatePreferences, job: JobForFit, mode: WorkMode): FitDimension {
  const allowedModes = normalizedList(prefs.work_modes);
  const locations = normalizedList(prefs.locations);
  const evidence: string[] = [];
  const gaps: string[] = [];
  let score = 55;

  if (mode !== "unknown" && (allowedModes.length === 0 || allowedModes.includes(mode))) {
    score = 90;
    evidence.push(`${display(mode)} is an allowed work mode.`);
  } else if (mode !== "unknown") {
    score = 10;
    gaps.push(`${display(mode)} is outside the selected work modes.`);
  }

  const location = normalize(job.location ?? "");
  const country = inferCountry([job.location, job.description?.slice(0, 1800)].filter(Boolean).join(" "));
  const countries = normalizedList(prefs.target_countries).map(canonicalCountry);
  if (countries.length > 0 && country) {
    if (countries.includes(country)) {
      score = Math.max(score, 90);
      evidence.push(`${display(country)} is an allowed country.`);
    } else {
      score = Math.min(score, 5);
      gaps.push(`${display(country)} is outside the selected countries.`);
    }
  }
  if (locations.length > 0 && mode !== "remote") {
    const locationMatch = locations.some((preferred) => location.includes(preferred) || preferred.includes(location));
    if (locationMatch) {
      score = Math.max(score, 95);
      evidence.push(`${job.location} matches a preferred location.`);
    } else {
      score = Math.min(score, 35);
      gaps.push(`${job.location || "Unknown location"} is outside preferred locations.`);
    }
  }
  return dimension("location", "Location and work mode", score, 15, evidence, gaps);
}

function scoreCompensation(prefs: CandidatePreferences, salary: { min: number | null; max: number | null }): FitDimension {
  const targetMin = numberOrNull(prefs.comp_target_usd_min);
  if (salary.min === null && salary.max === null) {
    return dimension("compensation", "Compensation", prefs.require_salary_disclosure ? 15 : 55, 5, [], ["Salary is not disclosed."]);
  }
  if (targetMin === null) {
    return dimension("compensation", "Compensation", 80, 5, ["Posting includes a salary range."], []);
  }
  const ceiling = salary.max ?? salary.min ?? 0;
  if (ceiling >= targetMin) {
    return dimension("compensation", "Compensation", 100, 5, [`Posted range reaches the $${targetMin.toLocaleString()} target.`], []);
  }
  return dimension("compensation", "Compensation", 10, 5, [], [`Posted maximum is below the $${targetMin.toLocaleString()} target.`]);
}

function scoreAuthorization(prefs: CandidatePreferences, combined: string): FitDimension {
  if (!prefs.requires_sponsorship) {
    return dimension("authorization", "Work authorization", 90, 5, ["No sponsorship constraint was supplied by the candidate."], []);
  }
  if (disallowsSponsorship(combined)) {
    return dimension("authorization", "Work authorization", 0, 5, [], ["Posting says sponsorship is unavailable."]);
  }
  if (/sponsor|visa|h-?1b|opt/i.test(combined)) {
    return dimension("authorization", "Work authorization", 85, 5, ["Posting mentions sponsorship or visa support."], []);
  }
  return dimension("authorization", "Work authorization", 45, 5, [], ["Sponsorship availability is unknown and must be confirmed."]);
}

function applyNegativeKeywordGate(prefs: CandidatePreferences, combined: string, filters: string[]) {
  const match = normalizedList(prefs.negative_keywords).find((keyword) => combined.includes(keyword));
  if (match) filters.push(`Excluded keyword: ${display(match)}.`);
}

function applyCompanyGate(prefs: CandidatePreferences, company: string | null | undefined, filters: string[]) {
  const normalizedCompany = normalize(company ?? "");
  const match = normalizedList(prefs.excluded_companies).find((excluded) => normalizedCompany.includes(excluded));
  if (match) filters.push(`Excluded company: ${company}.`);
}

function applyWorkModeGate(prefs: CandidatePreferences, mode: WorkMode, filters: string[]) {
  const allowed = normalizedList(prefs.work_modes);
  if (mode !== "unknown" && allowed.length > 0 && !allowed.includes(mode)) {
    filters.push(`${display(mode)} work is outside selected work modes.`);
  }
}

function applyCountryGate(prefs: CandidatePreferences, country: string | null, filters: string[]) {
  const allowed = normalizedList(prefs.target_countries).map(canonicalCountry);
  if (country && allowed.length > 0 && !allowed.includes(country)) {
    filters.push(`${display(country)} is outside selected countries.`);
  }
}

function applySeniorityGate(
  candidate: CandidateCareerProfile,
  jobSeniority: Seniority,
  requiredYears: number | null,
  filters: string[],
) {
  const allowed = normalizedList(candidate.preferences.seniority_levels);
  if (jobSeniority !== "unknown" && allowed.length > 0 && !allowed.includes(jobSeniority)) {
    filters.push(`${display(jobSeniority)} roles are outside selected seniority levels.`);
  }
  const stretch = candidate.preferences.max_stretch_years ?? 2;
  if (requiredYears !== null && requiredYears - candidate.yearsExperience > stretch) {
    filters.push(`Experience gap exceeds the allowed ${stretch}-year stretch.`);
  }
  if (candidate.yearsExperience < 7 && ["director", "executive"].includes(jobSeniority)) {
    filters.push(`${display(jobSeniority)} role is not credible for a ${candidate.yearsExperience.toFixed(1)}-year resume without explicit evidence.`);
  }
}

function applyExperiencePreferenceGate(
  prefs: CandidatePreferences,
  requiredYears: number | null,
  filters: string[],
) {
  if (requiredYears === null) return;
  const minimum = numberOrNull(prefs.min_years_experience);
  const maximum = numberOrNull(prefs.max_years_experience);
  if (minimum !== null && requiredYears < minimum) {
    filters.push(`Role asks for ${requiredYears}+ years, below the selected ${minimum}+ year floor.`);
  }
  if (maximum !== null && requiredYears > maximum) {
    filters.push(`Role asks for ${requiredYears}+ years, above the selected ${maximum}-year ceiling.`);
  }
}

function applyAuthorizationGate(prefs: CandidatePreferences, combined: string, filters: string[]) {
  if (prefs.requires_sponsorship && disallowsSponsorship(combined)) {
    filters.push("Candidate needs sponsorship, but the posting says sponsorship is unavailable.");
  }
  if (/u\.s\. citizens? only|must be (?:a )?u\.s\. citizen|active security clearance/i.test(combined) &&
      !/citizen/i.test(prefs.work_authorization ?? "")) {
    filters.push("Posting has a citizenship or clearance requirement not established by the profile.");
  }
}

function applyEmploymentTypeGate(prefs: CandidatePreferences, employmentType: string | null | undefined, filters: string[]) {
  const allowed = unique((prefs.employment_types ?? []).map(canonicalEmploymentType).filter(Boolean));
  const actual = canonicalEmploymentType(employmentType ?? "");
  if (allowed.length > 0 && actual && !allowed.includes(actual)) {
    filters.push(`${employmentType} is outside selected employment types.`);
  }
}

function canonicalEmploymentType(value: string): string {
  const normalized = normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const compact = normalized.replace(/_/g, "");
  if (["fulltime", "permanent", "regular"].includes(compact)) return "full_time";
  if (["parttime"].includes(compact)) return "part_time";
  if (["contract", "contractor", "temporary", "temp"].includes(compact)) return "contract";
  if (["intern", "internship"].includes(compact)) return "internship";
  return normalized;
}

function applySalaryGate(
  prefs: CandidatePreferences,
  salary: { min: number | null; max: number | null },
  filters: string[],
) {
  const targetMin = numberOrNull(prefs.comp_target_usd_min);
  if (prefs.require_salary_disclosure && salary.min === null && salary.max === null) {
    filters.push("Salary disclosure is required by preference, but the posting has no range.");
  }
  if (targetMin !== null && salary.max !== null && salary.max < targetMin) {
    filters.push(`Posted compensation is below the $${targetMin.toLocaleString()} minimum.`);
  }
}

function collectResumeSkills(resume: ResumeLike): string[] {
  const raw = resume.skills;
  const skills: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") skills.push(item);
      else if (item && typeof item === "object") skills.push(stringValue((item as Record<string, unknown>).name));
    }
  } else if (raw && typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) skills.push(...value.filter((item): item is string => typeof item === "string"));
      else if (typeof value === "string") skills.push(value);
    }
  }
  const text = normalize(JSON.stringify(resume));
  for (const skill of SKILL_CATALOG) if (containsTerm(text, skill)) skills.push(skill);
  return unique(skills.map((skill) => skill.trim()).filter(Boolean));
}

function buildSkillEvidence(
  skills: string[],
  roles: CandidateCareerProfile["roleHistory"],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const skill of skills) {
    const normalizedSkill = normalize(skill);
    const sources = roles
      .filter((role) => containsTerm(normalize(`${role.title} ${role.evidenceText}`), normalizedSkill))
      .map((role) => role.company ? `${role.title || "a role"} at ${role.company}` : role.title || "a prior role");
    result[normalizedSkill] = unique(sources);
  }
  return result;
}

function extractJobSkills(text: string): string[] {
  return SKILL_CATALOG.filter((skill) => containsTerm(text, skill));
}

function containsTerm(text: string, term: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
  }
  return text.includes(normalize(term));
}

function skillsOverlap(candidate: string, required: string): boolean {
  return candidate === required || candidate.includes(required) || required.includes(candidate);
}

function inferRequiredYears(description: string): number | null {
  const matches = [...description.matchAll(/(?:minimum\s+of\s+|at\s+least\s+)?(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+|relevant\s+)?experience/gi)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((match) => Number(match[1])));
}

function inferJobSeniority(title: string, requiredYears: number | null): Seniority {
  const value = normalize(title);
  if (/\b(chief|c[etof]o|vice president|vp|head of)\b/.test(value)) return "executive";
  if (/\bdirector\b/.test(value)) return "director";
  if (/\bmanager|management\b/.test(value)) return "manager";
  if (/\b(staff|principal|architect)\b/.test(value)) return "staff";
  if (/\b(senior|sr\.?|lead)\b/.test(value)) return "senior";
  if (/\b(intern|internship)\b/.test(value)) return "intern";
  if (/\b(junior|jr\.?|entry|graduate|new grad|associate)\b/.test(value)) return "entry";
  if (requiredYears !== null) {
    if (requiredYears >= 10) return "director";
    if (requiredYears >= 7) return "staff";
    if (requiredYears >= 4) return "senior";
    if (requiredYears <= 1) return "entry";
    return "mid";
  }
  return "unknown";
}

function inferCandidateSeniority(title: string, years: number): Seniority {
  const explicit = inferJobSeniority(title, null);
  if (explicit !== "unknown") return explicit;
  if (years < 1) return "entry";
  if (years < 4) return "mid";
  if (years < 8) return "senior";
  return "staff";
}

function inferWorkMode(remotePolicy?: string | null, location?: string | null, description?: string | null): WorkMode {
  const value = normalize([remotePolicy, location, description?.slice(0, 1200)].filter(Boolean).join(" "));
  if (/\bhybrid\b/.test(value)) return "hybrid";
  if (/\b(on[- ]?site|in[- ]?office|in person)\b/.test(value)) return "onsite";
  if (/\b(remote|work from home|distributed)\b/.test(value)) return "remote";
  return "unknown";
}

function inferCountry(value: string): string | null {
  const normalized = normalize(value);
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => containsTerm(normalized, alias))) return country;
  }
  return null;
}

function canonicalCountry(value: string): string {
  const normalized = normalize(value);
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (normalized === country || aliases.includes(normalized)) return country;
  }
  return normalized;
}

function inferSalary(text: string): { min: number | null; max: number | null } {
  const normalized = text.replace(/,/g, "");
  const values = [...normalized.matchAll(/\$\s?(\d{2,7})(?:\.\d+)?\s*([kK])?/g)]
    .map((match) => Number(match[1]) * (match[2] ? 1000 : 1))
    .filter((value) => value >= 10_000 && value <= 2_000_000);
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function calculateConfidence(
  job: JobForFit,
  jobSkills: string[],
  requiredYears: number | null,
  workMode: WorkMode,
  salary: { min: number | null; max: number | null },
): number {
  let points = 0.35;
  if ((job.description?.length ?? 0) >= 600) points += 0.2;
  if (jobSkills.length >= 4) points += 0.2;
  if (requiredYears !== null) points += 0.1;
  if (workMode !== "unknown") points += 0.08;
  if (salary.min !== null || salary.max !== null) points += 0.07;
  return Math.round(clamp(points, 0, 1) * 100) / 100;
}

function roleSimilarity(target: string, title: string): number {
  if (target === title) return 100;
  if (title.includes(target) || target.includes(title)) return 92;
  const targetTokens = roleTokens(target);
  const titleTokens = roleTokens(title);
  if (targetTokens.length === 0 || titleTokens.length === 0) return 35;
  const intersection = targetTokens.filter((token) => titleTokens.includes(token));
  const union = unique([...targetTokens, ...titleTokens]);
  const jaccard = intersection.length / union.length;
  if (jaccard >= 0.66) return 85;
  if (jaccard >= 0.4) return 68;
  if (intersection.length > 0) return union.length >= 4 && intersection.length === 1 ? 38 : 52;
  return 18;
}

function roleTokens(value: string): string[] {
  return value.split(/[^a-z0-9+#.]+/).filter((token) => token.length > 1 && !ROLE_STOP_WORDS.has(token));
}

function seniorityRank(value: Seniority): number {
  return { intern: 0, entry: 1, mid: 2, senior: 3, staff: 4, manager: 4, director: 5, executive: 6, unknown: 2 }[value];
}

function disallowsSponsorship(text: string): boolean {
  return /(?:no|not|unable to|cannot|can't|will not)\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor|without\s+(?:current or future\s+)?sponsorship|not\s+eligible\s+for\s+sponsorship/i.test(text);
}

function parseMonth(value: string, now: Date, end = false): number | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (/present|current|now/.test(normalized)) return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  const monthName = Object.keys(MONTHS).find((name) => new RegExp(`\\b${name}\\b`).test(normalized));
  const numericMonth = normalized.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[/-]\s*(?:19|20)\d{2}/)?.[1];
  const month = monthName ? MONTHS[monthName] : numericMonth ? Number(numericMonth) - 1 : end ? 11 : 0;
  return year * 12 + month;
}

function dimension(
  key: FitDimension["key"],
  label: string,
  score: number,
  weight: number,
  evidence: string[],
  gaps: string[],
): FitDimension {
  return { key, label, score: Math.round(clamp(score, 0, 100)), weight, evidence, gaps };
}

function normalizedList(values: string[] | undefined): string[] {
  return unique((values ?? []).map(normalize).filter(Boolean));
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function display(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values: string[]): string {
  return values.find(Boolean) ?? "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

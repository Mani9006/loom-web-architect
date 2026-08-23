/**
 * ATS detection from a job URL.
 *
 * Detection is not the same as the ability to submit. A host match only
 * identifies the employer system. Submission requires a live adapter and a
 * verified portal receipt. Indeed / Naukri / LinkedIn need the candidate's
 * own logged-in account and are never treated as API-submittable.
 */

export type AtsMode = "adapter" | "needs_you" | "account_required" | "unknown";

export type AtsSlug =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "icims"
  | "smartrecruiters"
  | "workable"
  | "jobvite"
  | "successfactors"
  | "oraclecloud"
  | "rippling"
  | "phenom"
  | "bamboohr"
  | "jazzhr"
  | "breezyhr"
  | "recruitee"
  | "teamtailor"
  | "pinpoint"
  | "polymer"
  | "dover"
  | "gem"
  | "brassring"
  | "dayforce"
  | "hireology"
  | "join"
  | "paylocity"
  | "ultipro"
  | "adp"
  | "zohorecruit"
  | "indeed"
  | "naukri"
  | "linkedin";

export interface AtsCatalogEntry {
  slug: AtsSlug;
  label: string;
  /** Live browser adapter that may click submit when a receipt can be verified. */
  live: boolean;
  mode: AtsMode;
  hostSuffixes: string[];
}

export interface AtsDetection {
  ats: AtsSlug | null;
  label: string;
  detected: boolean;
  /** True only when a live adapter exists. Detection alone is never enough. */
  submittable: boolean;
  mode: AtsMode;
  reason: string;
  host: string | null;
}

/**
 * Public ATS list ResumePreps knows how to name from a URL.
 * `live: true` is the only set the cloud worker is allowed to submit.
 */
export const ATS_CATALOG: AtsCatalogEntry[] = [
  { slug: "greenhouse", label: "Greenhouse", live: true, mode: "adapter", hostSuffixes: ["greenhouse.io"] },
  { slug: "lever", label: "Lever", live: true, mode: "adapter", hostSuffixes: ["lever.co"] },
  { slug: "ashby", label: "Ashby", live: true, mode: "adapter", hostSuffixes: ["ashbyhq.com"] },
  { slug: "workable", label: "Workable", live: true, mode: "adapter", hostSuffixes: ["workable.com"] },
  { slug: "workday", label: "Workday", live: true, mode: "adapter", hostSuffixes: ["myworkdayjobs.com", "myworkday.com"] },
  { slug: "icims", label: "iCIMS", live: false, mode: "needs_you", hostSuffixes: ["icims.com"] },
  { slug: "smartrecruiters", label: "SmartRecruiters", live: false, mode: "needs_you", hostSuffixes: ["smartrecruiters.com"] },
  { slug: "jobvite", label: "Jobvite", live: false, mode: "needs_you", hostSuffixes: ["jobvite.com"] },
  { slug: "successfactors", label: "SAP SuccessFactors", live: false, mode: "needs_you", hostSuffixes: ["successfactors.com", "successfactors.eu", "sapsf.com", "sapsf.eu"] },
  { slug: "oraclecloud", label: "Oracle Cloud HCM", live: false, mode: "needs_you", hostSuffixes: ["oraclecloud.com"] },
  { slug: "rippling", label: "Rippling", live: false, mode: "needs_you", hostSuffixes: ["rippling.com"] },
  { slug: "phenom", label: "Phenom", live: false, mode: "needs_you", hostSuffixes: ["phenom.com", "phenompeople.com"] },
  { slug: "bamboohr", label: "BambooHR", live: false, mode: "needs_you", hostSuffixes: ["bamboohr.com"] },
  { slug: "jazzhr", label: "JazzHR", live: false, mode: "needs_you", hostSuffixes: ["jazz.co", "applytojob.com"] },
  { slug: "breezyhr", label: "Breezy HR", live: false, mode: "needs_you", hostSuffixes: ["breezy.hr"] },
  { slug: "recruitee", label: "Recruitee", live: false, mode: "needs_you", hostSuffixes: ["recruitee.com"] },
  { slug: "teamtailor", label: "Teamtailor", live: false, mode: "needs_you", hostSuffixes: ["teamtailor.com"] },
  { slug: "pinpoint", label: "Pinpoint", live: false, mode: "needs_you", hostSuffixes: ["pinpoint.tech", "pinpointhq.com"] },
  { slug: "polymer", label: "Polymer", live: false, mode: "needs_you", hostSuffixes: ["polymer.co"] },
  { slug: "dover", label: "Dover", live: false, mode: "needs_you", hostSuffixes: ["dover.com", "app.dover.io"] },
  { slug: "gem", label: "Gem", live: false, mode: "needs_you", hostSuffixes: ["gem.com"] },
  { slug: "brassring", label: "Brassring", live: false, mode: "needs_you", hostSuffixes: ["brassring.com"] },
  { slug: "dayforce", label: "Dayforce", live: false, mode: "needs_you", hostSuffixes: ["dayforcehcm.com", "dayforce.com"] },
  { slug: "hireology", label: "Hireology", live: false, mode: "needs_you", hostSuffixes: ["hireology.com"] },
  { slug: "join", label: "Join", live: false, mode: "needs_you", hostSuffixes: ["join.com"] },
  { slug: "paylocity", label: "Paylocity", live: false, mode: "needs_you", hostSuffixes: ["paylocity.com"] },
  { slug: "ultipro", label: "UKG / UltiPro", live: false, mode: "needs_you", hostSuffixes: ["ultipro.com", "ukg.com"] },
  { slug: "adp", label: "ADP", live: false, mode: "needs_you", hostSuffixes: ["adp.com", "workforcenow.adp.com"] },
  { slug: "zohorecruit", label: "Zoho Recruit", live: false, mode: "needs_you", hostSuffixes: ["zohorecruit.com", "recruit.zoho.com", "zoho.com"] },
  { slug: "indeed", label: "Indeed", live: false, mode: "account_required", hostSuffixes: ["indeed.com"] },
  { slug: "naukri", label: "Naukri", live: false, mode: "account_required", hostSuffixes: ["naukri.com"] },
  { slug: "linkedin", label: "LinkedIn", live: false, mode: "account_required", hostSuffixes: ["linkedin.com"] },
];

export const LIVE_SUBMIT_ADAPTERS: AtsSlug[] = ATS_CATALOG.filter((entry) => entry.live).map((entry) => entry.slug);

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function parseUrl(value: string): URL | null {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function catalogEntryForHost(hostname: string): AtsCatalogEntry | null {
  const host = hostname.toLowerCase();
  for (const entry of ATS_CATALOG) {
    if (entry.hostSuffixes.some((suffix) => hostMatches(host, suffix))) return entry;
  }
  return null;
}

function reasonFor(entry: AtsCatalogEntry): string {
  if (entry.live) {
    return `Live ${entry.label} adapter. The worker submits only after a portal receipt.`;
  }
  if (entry.mode === "account_required") {
    return `${entry.label} requires the candidate's own logged-in account. ResumePreps cannot submit here.`;
  }
  return `${entry.label} is detected. No live submit adapter yet — the tailored packet stays in Needs you.`;
}

export function detectAtsFromUrl(url: string | null | undefined): AtsDetection {
  const parsed = parseUrl(String(url || ""));
  if (!parsed) {
    return {
      ats: null,
      label: "Unknown",
      detected: false,
      submittable: false,
      mode: "unknown",
      reason: "Not a valid http(s) job URL.",
      host: null,
    };
  }
  const entry = catalogEntryForHost(parsed.hostname);
  if (!entry) {
    return {
      ats: null,
      label: "Unknown ATS",
      detected: false,
      submittable: false,
      mode: "unknown",
      reason: "ATS not recognized from this URL. The tailored packet will be ready for you to submit on the employer site.",
      host: parsed.hostname.toLowerCase(),
    };
  }
  return {
    ats: entry.slug,
    label: entry.label,
    detected: true,
    submittable: entry.live,
    mode: entry.mode,
    reason: reasonFor(entry),
    host: parsed.hostname.toLowerCase(),
  };
}

export function isLiveSubmitAts(slug: string | null | undefined): boolean {
  return Boolean(slug && LIVE_SUBMIT_ADAPTERS.includes(slug as AtsSlug));
}

/**
 * Job URL validation and smart fallback utilities.
 *
 * Many job URLs from AI-powered search or aggregators resolve to company
 * career pages or search portals rather than the actual job listing. These
 * helpers detect likely-broken URLs and build reliable fallback links.
 */

/** Patterns that indicate a URL is probably NOT a direct job application link */
const GENERIC_CAREER_PAGE_PATTERNS = [
  /\/careers\/?$/i,
  /\/careers\/?\?/i,
  /\/careers\/search/i,
  /\/careers\/home/i,
  /\/jobs\/?$/i,
  /\/jobs\/?\?/i,
  /\/jobs\/search/i,
  /\/join-us/i,
  /\/work-with-us/i,
  /\/career-opportunities/i,
];

/** Domains that are known job aggregators, search URLs here are NOT direct job links */
const AGGREGATOR_SEARCH_PATTERNS = [
  /linkedin\.com\/jobs\/search/i,
  /indeed\.com\/jobs\?/i,
  /indeed\.com\/q-/i,
  /glassdoor\.com\/Job\/.*-jobs/i,
  /ziprecruiter\.com\/jobs\/search/i,
  /monster\.com\/jobs\/search/i,
];

/** Patterns that suggest a URL IS a direct job link (high confidence) */
const DIRECT_JOB_PATTERNS = [
  /linkedin\.com\/jobs\/view\/\d+/i,
  /indeed\.com\/viewjob\?.*jk=/i,
  /greenhouse\.io\/.*\/jobs\/\d+/i,
  /lever\.co\/.*\/[a-f0-9-]+/i,
  /myworkdayjobs\.com\/.+\/job\//i,
  /boards\.greenhouse\.io\/.+\/jobs\/\d+/i,
  /jobs\.ashbyhq\.com\/.+\/[a-f0-9-]+/i,
  /apply\.workable\.com\/.+\/j\//i,
  /careers\.google\.com\/jobs\/results\/\d+/i,
  /angel\.co\/company\/.+\/jobs\//i,
  /glassdoor\.com\/job-listing\//i,
  /ziprecruiter\.com\/jobs\/.+\/\w+/i,
];

/**
 * Returns the URL only when it parses as an absolute http(s) URL; otherwise
 * undefined. Use before rendering untrusted URLs as hrefs so javascript:,
 * data: and other schemes can never reach an anchor.
 */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = String(url).trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Checks if a URL appears to be broken, fake, or a placeholder.
 */
export function looksLikelyBrokenUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const normalized = url.toLowerCase().trim();
  if (!normalized.startsWith("http")) return true;
  if (/fake|placeholder|example\.com|undefined|null|javascript:|about:|data:/.test(normalized)) return true;
  if (normalized.length < 15) return true;
  return false;
}

/**
 * Checks if a URL leads to a generic company careers/search page
 * rather than a specific job listing.
 */
export function isGenericCareerPage(url: string): boolean {
  const normalized = url.toLowerCase().trim();
  for (const pattern of GENERIC_CAREER_PAGE_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  for (const pattern of AGGREGATOR_SEARCH_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

/**
 * Checks if a URL looks like a direct link to a specific job posting.
 */
export function isDirectJobLink(url: string): boolean {
  for (const pattern of DIRECT_JOB_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

/**
 * Builds a LinkedIn search fallback URL for a given job.
 */
export function buildLinkedInFallback(
  title: string,
  company: string,
  location?: string | null,
): string {
  const query = `${title} ${company}`.trim();
  const loc = (location || "United States").trim();
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(loc)}`;
}

/**
 * Builds a Google search fallback URL that targets the job directly.
 */
export function buildGoogleJobSearch(
  title: string,
  company: string,
): string {
  const query = `${title} ${company} apply`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export type ResolvedJobUrl = {
  /** The URL to use (either original or fallback) */
  url: string;
  /** Whether the original URL was replaced with a fallback */
  isFallback: boolean;
  /** Human-readable label for the button */
  label: string;
};

/**
 * Resolves the best URL to use for a job application.
 *
 * Returns the original URL if it looks like a direct job link,
 * or builds a smart fallback if the URL is broken or generic.
 */
export function resolveJobUrl(
  applyUrl: string | null | undefined,
  title: string,
  company: string,
  location?: string | null,
): ResolvedJobUrl {
  // If the URL is broken or missing → fallback
  if (looksLikelyBrokenUrl(applyUrl)) {
    return {
      url: buildLinkedInFallback(title, company, location),
      isFallback: true,
      label: "Search on LinkedIn",
    };
  }

  const url = applyUrl!;

  // If it's a known direct job link → use as-is
  if (isDirectJobLink(url)) {
    return { url, isFallback: false, label: "Apply" };
  }

  // If it's a generic career/search page → fallback
  if (isGenericCareerPage(url)) {
    return {
      url: buildLinkedInFallback(title, company, location),
      isFallback: true,
      label: "Search on LinkedIn",
    };
  }

  // Otherwise, trust the URL (could be a company ATS we don't recognize)
  return { url, isFallback: false, label: "Apply" };
}

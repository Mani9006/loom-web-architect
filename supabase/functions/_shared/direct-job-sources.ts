/**
 * No-key direct-employer job discovery.
 *
 * These connectors use public read endpoints documented by the ATS vendors.
 * They are a resilient first layer, not a universal crawler: the board registry
 * is deliberately explicit, reviewable, and safe to expand over time.
 */

type SearchOptions = {
  query: string;
  location?: string;
  remoteFilter?: string;
  experienceLevel?: string;
  limit?: number;
};

export type DirectJob = {
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  salary: string | null;
  job_type: string | null;
  remote: boolean;
  date_posted: string;
  source: string;
};

const GREENHOUSE_BOARDS = [
  { board: "databricks", company: "Databricks" },
  { board: "stripe", company: "Stripe" },
  { board: "cloudflare", company: "Cloudflare" },
  { board: "scaleai", company: "Scale AI" },
  { board: "reddit", company: "Reddit" },
  { board: "affirm", company: "Affirm" },
] as const;

const ASHBY_BOARDS = [
  { board: "linear", company: "Linear" },
  { board: "cursor", company: "Cursor" },
  { board: "notion", company: "Notion" },
  { board: "ramp", company: "Ramp" },
] as const;

// Lever's public Postings API is another no-key read layer. Applications are
// still submitted only by the controlled worker after the user's profile and
// approval policy pass; discovery never needs an employer API credential.
const LEVER_BOARDS = [
  { board: "peerspace", company: "Peerspace" },
  { board: "applydigital", company: "Apply Digital" },
  { board: "docsumo", company: "Docsumo" },
  { board: "bonedry", company: "Bone Dry Roofing" },
  { board: "dnb", company: "Dun & Bradstreet" },
] as const;

const NON_US = /\b(?:europe|india|canada|united kingdom|uk|germany|france|australia|singapore|japan|china|brazil|mexico|ireland|netherlands|poland|spain|italy|sweden|israel|dubai|bangalore|hyderabad|mumbai|delhi|pune|chennai|toronto|vancouver|london|berlin|paris|sydney|melbourne|tokyo)\b/i;
const US_SIGNAL = /\b(?:united states|u\.s\.|usa|remote|north america|al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\b/i;

function plainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function terms(query: string): string[] {
  return query.toLocaleLowerCase().split(/[^a-z0-9+#.]+/).filter((term) => term.length > 1);
}

function relevance(title: string, description: string, query: string): number {
  const wanted = terms(query);
  if (!wanted.length) return 1;
  const normalizedTitle = title.toLocaleLowerCase();
  const normalizedBody = `${title} ${description}`.toLocaleLowerCase();
  return wanted.reduce((score, term) => {
    if (normalizedTitle.includes(term)) return score + 5;
    if (normalizedBody.includes(term)) return score + 1;
    return score;
  }, 0);
}

function locationAllowed(value: string, requested?: string): boolean {
  const location = value || "Remote (US)";
  if (NON_US.test(location) && !US_SIGNAL.test(location)) return false;
  if (requested?.trim() && !/remote|united states|usa/i.test(requested)) {
    return location.toLocaleLowerCase().includes(requested.toLocaleLowerCase());
  }
  return true;
}

function filterOptions(job: DirectJob, options: SearchOptions): boolean {
  if (!locationAllowed(job.location, options.location)) return false;
  const text = `${job.title} ${job.location} ${job.description}`;
  if (options.remoteFilter === "remote-only" && !/\bremote\b/i.test(text)) return false;
  if (options.remoteFilter === "on-site" && /\bremote\b/i.test(text) && !/on[ -]?site|in office/i.test(text)) return false;
  if (options.experienceLevel && options.experienceLevel !== "all") {
    const requested = options.experienceLevel.toLocaleLowerCase();
    if (requested.includes("entry") && /\b(?:senior|staff|principal|lead|director|vp)\b/i.test(job.title)) return false;
    if (requested.includes("senior") && !/\b(?:senior|sr\.?|staff|principal|lead)\b/i.test(text)) return false;
    if (requested.includes("intern") && !/\b(?:intern|co-op)\b/i.test(text)) return false;
  }
  return true;
}

async function fetchJson(url: string, timeoutMs = 7_000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ResumePreps-JobDiscovery/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`direct source ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGreenhouse(
  source: (typeof GREENHOUSE_BOARDS)[number],
  options: SearchOptions,
): Promise<Array<DirectJob & { relevance: number }>> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${source.board}`;
  const listing = await fetchJson(`${base}/jobs`);
  const candidates = (Array.isArray(listing?.jobs) ? listing.jobs : [])
    .map((job: any) => ({ ...job, score: relevance(job.title || "", "", options.query) }))
    .filter((job: any) => job.score > 0 && locationAllowed(job.location?.name || "", options.location))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  const details = await Promise.allSettled(candidates.map((job: any) => fetchJson(`${base}/jobs/${job.id}`)));
  return details.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const detail = result.value;
    const description = plainText(detail.content);
    const job: DirectJob & { relevance: number } = {
      title: detail.title || candidates[index].title || "",
      company: source.company,
      location: detail.location?.name || candidates[index].location?.name || "Remote (US)",
      description,
      apply_url: detail.absolute_url || candidates[index].absolute_url || "",
      salary: null,
      job_type: null,
      remote: /\bremote\b/i.test(`${detail.location?.name || ""} ${description}`),
      date_posted: detail.updated_at || candidates[index].updated_at || new Date().toISOString(),
      source: `${source.company} careers`,
      relevance: relevance(detail.title || "", description, options.query),
    };
    return filterOptions(job, options) ? [job] : [];
  });
}

async function fetchAshby(
  source: (typeof ASHBY_BOARDS)[number],
  options: SearchOptions,
): Promise<Array<DirectJob & { relevance: number }>> {
  const data = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${source.board}?includeCompensation=true`,
  );
  return (Array.isArray(data?.jobs) ? data.jobs : []).flatMap((entry: any) => {
    if (entry.isListed === false) return [];
    const description = entry.descriptionPlain || plainText(entry.descriptionHtml);
    const score = relevance(entry.title || "", description, options.query);
    if (score <= 0) return [];
    const compensation = entry.compensation?.scrapeableCompensationSalarySummary
      || entry.compensation?.compensationTierSummary
      || null;
    const job: DirectJob & { relevance: number } = {
      title: entry.title || "",
      company: source.company,
      location: entry.location || "Remote (US)",
      description,
      apply_url: entry.jobUrl || entry.applyUrl || "",
      salary: compensation,
      job_type: entry.employmentType || null,
      remote: /\bremote\b/i.test(`${entry.location || ""} ${description}`),
      date_posted: entry.publishedAt || new Date().toISOString(),
      source: `${source.company} careers`,
      relevance: score,
    };
    return filterOptions(job, options) ? [job] : [];
  });
}

async function fetchLever(
  source: (typeof LEVER_BOARDS)[number],
  options: SearchOptions,
): Promise<Array<DirectJob & { relevance: number }>> {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${source.board}?mode=json`);
  return (Array.isArray(data) ? data : []).flatMap((entry: any) => {
    if (entry.categories?.commitment && /volunteer|internship/i.test(String(entry.categories.commitment))) return [];
    const description = plainText(entry.descriptionPlain || entry.description || entry.requirements || "");
    const title = entry.text || entry.title || "";
    const location = entry.categories?.location || entry.categories?.allLocations || "Remote (US)";
    const score = relevance(title, description, options.query);
    if (score <= 0) return [];
    const job: DirectJob & { relevance: number } = {
      title,
      company: source.company,
      location: String(location),
      description,
      apply_url: entry.applyUrl || entry.hostedUrl || "",
      salary: entry.salaryRange?.currency
        ? `${entry.salaryRange.min ?? ""}-${entry.salaryRange.max ?? ""} ${entry.salaryRange.currency}`
        : null,
      job_type: entry.categories?.commitment || null,
      remote: /\bremote\b/i.test(`${location} ${description}`),
      date_posted: entry.createdAt ? new Date(Number(entry.createdAt)).toISOString() : new Date().toISOString(),
      source: `${source.company} careers`,
      relevance: score,
    };
    return filterOptions(job, options) ? [job] : [];
  });
}

export async function searchDirectJobSources(options: SearchOptions): Promise<DirectJob[]> {
  const settled = await Promise.allSettled([
    ...GREENHOUSE_BOARDS.map((source) => fetchGreenhouse(source, options)),
    ...ASHBY_BOARDS.map((source) => fetchAshby(source, options)),
    ...LEVER_BOARDS.map((source) => fetchLever(source, options)),
  ]);
  const all = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const seen = new Set<string>();
  const limit = Math.max(1, Math.min(options.limit ?? 25, 40));
  return all
    .sort((a, b) => b.relevance - a.relevance || b.date_posted.localeCompare(a.date_posted))
    .filter((job) => {
      const key = `${job.title}::${job.company}`.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(job.title && job.company && job.description.length >= 80 && job.apply_url);
    })
    .slice(0, limit)
    .map(({ relevance: _relevance, ...job }) => job);
}

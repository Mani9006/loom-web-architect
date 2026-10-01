// Perplexity-powered Job Search with DB-first approach
// Strategy: query cached_jobs DB first → return matching jobs → only call Perplexity when DB exhausted
// v20: Full CST (America/Chicago) timezone support + comprehensive debug logging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceAccountActive,
  enforceDailyCap,
  getAuthedUser,
  HttpError,
  logAiUsage,
} from "../_shared/guards.ts";
import { isAllowedApplyUrl } from "../_shared/jobs.ts";
import { searchDirectJobSources } from "../_shared/direct-job-sources.ts";

// ── CST Timezone Helper ─────────────────────────────────────────────────
// Returns current date/time in America/Chicago (CST/CDT) timezone
function getCSTNow(): { date: Date; isoString: string; display: string; dateOnly: string } {
  const now = new Date();
  // Format in CST for display
  const display = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const dateOnly = now.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  // Get CST offset: parse the CST time and compute the offset from UTC
  const cstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const p: Record<string, string> = {};
  for (const part of cstParts) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  // Build a Date object representing CST "wall clock" time for date comparisons
  const cstDate = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
  return { date: cstDate, isoString: now.toISOString(), display, dateOnly };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cache API key across warm invocations
let cachedPerplexityKey: string | null = null;

// ── Role Category Mapping ──────────────────────────────────────────────
const ROLE_CATEGORIES: Record<string, string[]> = {
  "Engineering": ["software engineer", "developer", "backend", "frontend", "full stack", "fullstack", "devops", "sre", "site reliability", "platform engineer", "systems engineer", "embedded", "firmware", "qa engineer", "test engineer", "sdet", "mobile developer", "ios developer", "android developer", "web developer"],
  "Data & Analytics": ["data scientist", "data analyst", "data engineer", "business intelligence", "bi analyst", "analytics", "statistician", "quantitative", "etl", "data warehouse"],
  "AI & Machine Learning": ["machine learning", "ml engineer", "ai engineer", "artificial intelligence", "deep learning", "nlp", "computer vision", "research scientist", "applied scientist"],
  "Cloud & Infrastructure": ["cloud engineer", "cloud architect", "aws", "azure", "gcp", "infrastructure", "network engineer", "solutions architect", "system administrator", "sysadmin"],
  "Cybersecurity": ["security engineer", "cybersecurity", "information security", "penetration tester", "security analyst", "soc analyst", "threat", "vulnerability"],
  "Product & Design": ["product manager", "product owner", "ux designer", "ui designer", "product designer", "user researcher", "interaction designer", "visual designer", "ux/ui"],
  "Project Management": ["project manager", "program manager", "scrum master", "agile coach", "delivery manager", "technical program manager", "tpm"],
  "Marketing": ["marketing manager", "digital marketing", "content marketing", "seo", "sem", "growth", "brand manager", "social media", "marketing analyst", "demand generation"],
  "Sales & Business Development": ["sales engineer", "account executive", "business development", "sales representative", "account manager", "customer success", "sales manager", "revenue"],
  "Finance & Accounting": ["financial analyst", "accountant", "controller", "treasury", "tax", "audit", "bookkeeper", "cfo", "finance manager"],
  "Human Resources": ["hr manager", "recruiter", "talent acquisition", "people operations", "human resources", "compensation", "benefits", "hrbp"],
  "Operations": ["operations manager", "supply chain", "logistics", "procurement", "warehouse", "inventory", "facilities"],
  "Healthcare": ["nurse", "physician", "medical", "clinical", "healthcare", "pharmacy", "therapist", "dentist", "surgeon", "rn ", "lpn"],
  "Legal": ["attorney", "lawyer", "legal counsel", "paralegal", "compliance", "regulatory"],
  "Creative": ["graphic designer", "creative director", "copywriter", "content creator", "video editor", "animator", "illustrator", "art director"],
  "Customer Support": ["customer service", "customer support", "help desk", "technical support", "support engineer", "support specialist"],
  "Education & Training": ["teacher", "instructor", "professor", "trainer", "curriculum", "education", "tutor", "academic"],
};

// ── Experience Level Detection ─────────────────────────────────────────
const EXPERIENCE_PATTERNS: { level: string; patterns: RegExp[] }[] = [
  { level: "Internship", patterns: [/\bintern\b/i, /\binternship\b/i, /\bco-?op\b/i] },
  { level: "Entry-Level", patterns: [/\bentry[- ]?level\b/i, /\bjunior\b/i, /\bjr\.?\b/i, /\b0-2 years?\b/i, /\b1-2 years?\b/i, /\bnew grad\b/i, /\bgraduate\b/i, /\bassociate\b/i] },
  { level: "Mid-Level", patterns: [/\bmid[- ]?level\b/i, /\b3-5 years?\b/i, /\b2-4 years?\b/i, /\b3-7 years?\b/i, /\bmid[- ]?senior\b/i] },
  { level: "Senior", patterns: [/\bsenior\b/i, /\bsr\.?\b/i, /\bstaff\b/i, /\b5\+? years?\b/i, /\b7\+? years?\b/i, /\blead\b/i, /\bprincipal\b/i] },
  { level: "Executive", patterns: [/\bdirector\b/i, /\bvp\b/i, /\bvice president\b/i, /\bc-?suite\b/i, /\bchief\b/i, /\bcto\b/i, /\bceo\b/i, /\bcfo\b/i, /\bcoo\b/i, /\bhead of\b/i, /\bexecutive\b/i] },
];

// ── Industry Detection ─────────────────────────────────────────────────
const INDUSTRY_PATTERNS: Record<string, RegExp[]> = {
  "Technology": [/\btech\b/i, /\bsoftware\b/i, /\bsaas\b/i, /\bcloud\b/i, /\bai\b/i, /\bfintech\b/i, /\bstartup\b/i],
  "Finance": [/\bbank\b/i, /\bfinancial\b/i, /\binvestment\b/i, /\binsurance\b/i, /\bhedge fund\b/i, /\basset management\b/i],
  "Healthcare": [/\bhospital\b/i, /\bmedical\b/i, /\bhealth\b/i, /\bpharma\b/i, /\bbiotech\b/i, /\bclinical\b/i],
  "Retail & E-Commerce": [/\bretail\b/i, /\be-?commerce\b/i, /\bshopping\b/i, /\bmerchant\b/i],
  "Manufacturing": [/\bmanufacturing\b/i, /\bindustrial\b/i, /\bproduction\b/i, /\bfactory\b/i],
  "Education": [/\buniversity\b/i, /\bcollege\b/i, /\bschool\b/i, /\beducation\b/i, /\bacademic\b/i],
  "Government": [/\bgovernment\b/i, /\bfederal\b/i, /\bstate\b/i, /\bmilitary\b/i, /\bdefense\b/i, /\bnasa\b/i],
  "Media & Entertainment": [/\bmedia\b/i, /\bentertainment\b/i, /\bgaming\b/i, /\bstreaming\b/i, /\bpublishing\b/i],
  "Consulting": [/\bconsulting\b/i, /\badvisory\b/i, /\bprofessional services\b/i],
  "Energy": [/\benergy\b/i, /\boil\b/i, /\bgas\b/i, /\brenewable\b/i, /\bsolar\b/i, /\butilities\b/i],
  "Transportation": [/\btransportation\b/i, /\blogistics\b/i, /\bshipping\b/i, /\bfreight\b/i, /\bairline\b/i],
  "Real Estate": [/\breal estate\b/i, /\bproperty\b/i, /\bconstruction\b/i],
};

// ── Helper Functions ───────────────────────────────────────────────────

function classifyRoleCategory(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  for (const [category, keywords] of Object.entries(ROLE_CATEGORIES)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return category;
    }
  }
  return "Other";
}

function detectExperienceLevel(title: string, description: string): string {
  const text = `${title} ${description}`;
  for (const { level, patterns } of EXPERIENCE_PATTERNS) {
    for (const p of patterns) {
      if (p.test(title)) return level;
    }
  }
  for (const { level, patterns } of EXPERIENCE_PATTERNS) {
    if (level === "Mid-Level") continue;
    for (const p of patterns) {
      if (p.test(text)) return level;
    }
  }
  return "Mid-Level";
}

function detectIndustry(company: string, description: string): string | null {
  const text = `${company} ${description}`.toLowerCase();
  for (const [industry, patterns] of Object.entries(INDUSTRY_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(text)) return industry;
    }
  }
  return null;
}

function sanitizeDatePosted(raw: string): string {
  if (!raw) return "Recently";
  const s = raw.trim();
  if (/ago|today|yesterday|recently|just now/i.test(s)) return s;
  let parsed: Date | null = null;
  const attempt = new Date(s);
  if (!isNaN(attempt.getTime())) {
    parsed = attempt;
  } else {
    const match = s.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
    if (match) {
      parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
      if (isNaN(parsed.getTime())) parsed = null;
    }
  }
  if (!parsed) return s;
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 0) return "Recently";
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

function relativeDateToTimestamp(label: string): string {
  if (!label) return new Date().toISOString();
  const s = label.trim().toLowerCase();
  const now = new Date();
  if (s === "today" || s === "just now" || s === "recently") return now.toISOString();
  if (s === "yesterday" || s === "1 day ago") return new Date(now.getTime() - 86400000).toISOString();
  const daysMatch = s.match(/^(\d+)\s*days?\s*ago$/);
  if (daysMatch) return new Date(now.getTime() - parseInt(daysMatch[1], 10) * 86400000).toISOString();
  const weeksMatch = s.match(/^(\d+)\s*weeks?\s*ago$/);
  if (weeksMatch) return new Date(now.getTime() - parseInt(weeksMatch[1], 10) * 7 * 86400000).toISOString();
  const monthsMatch = s.match(/^(\d+)\s*months?\s*ago$/);
  if (monthsMatch) return new Date(now.getTime() - parseInt(monthsMatch[1], 10) * 30 * 86400000).toISOString();
  const attempt = new Date(s);
  if (!isNaN(attempt.getTime())) return attempt.toISOString();
  return now.toISOString();
}

function jobFingerprint(job: { title: string; company: string; location: string }): string {
  return [
    (job.title || "").toLowerCase().trim(),
    (job.company || "").toLowerCase().trim(),
    (job.location || "").toLowerCase().trim(),
  ].join(":::");
}

// ── Quality Validation ─────────────────────────────────────────────────
const GENERIC_URL_PATTERNS = [
  /\/careers\/?$/i,
  /\/careers\/?\?/i,
  /\/careers\/search/i,
  /\/careers\/home/i,
  /\/jobs\/?$/i,
  /\/jobs\/?\?/i,
  /\/jobs\/search/i,
  /linkedin\.com\/jobs\/search/i,
  /indeed\.com\/jobs\?/i,
  /glassdoor\.com\/Job\/.*-jobs/i,
  /ziprecruiter\.com\/jobs\/search/i,
];

function sanitizeApplyUrl(url: string, title: string, company: string, _location: string): string {
  if (!url || !url.startsWith("http")) return "";
  const lower = url.toLowerCase();
  if (/fake|placeholder|example\.com|undefined|null/.test(lower)) return "";
  for (const pattern of GENERIC_URL_PATTERNS) {
    if (pattern.test(lower)) {
      console.log(`Generic URL detected for ${title} at ${company}: ${url}`);
      return "";
    }
  }
  return isAllowedApplyUrl(url) ? url : "";
}

function validateJob(job: any): { valid: boolean; reason?: string } {
  if (!job.title || job.title.length < 3) return { valid: false, reason: "missing/short title" };
  if (!job.company || job.company.length < 2) return { valid: false, reason: "missing company" };
  if (!job.location || job.location.length < 2) return { valid: false, reason: "missing location" };
  if (!job.apply_url || !job.apply_url.startsWith("http")) return { valid: false, reason: "invalid apply_url" };
  if (!isAllowedApplyUrl(job.apply_url)) return { valid: false, reason: "not a direct company or ATS URL" };
  if (!job.description || job.description.length < 50) return { valid: false, reason: "description too short" };
  const loc = (job.location || "").toLowerCase();
  const nonUSPatterns = [
    /\bindia\b/, /\bcanada\b/, /\buk\b/, /\bunited kingdom\b/, /\bgermany\b/,
    /\bfrance\b/, /\baustralia\b/, /\bsingapore\b/, /\bjapan\b/, /\bchina\b/,
    /\bbrazil\b/, /\bmexico\b/, /\bdubai\b/, /\bnigeria\b/, /\bphilippines\b/,
    /\bbangalore\b/, /\bhyderabad\b/, /\bmumbai\b/, /\bdelhi\b/, /\bpune\b/,
    /\bchennai\b/, /\btoronto\b/, /\bvancouver\b/, /\blondon\b/, /\bberlin\b/,
    /\bparis\b/, /\bsydney\b/, /\bmelbourne\b/, /\btokyo\b/,
  ];
  for (const p of nonUSPatterns) {
    if (p.test(loc)) return { valid: false, reason: `non-US location: ${job.location}` };
  }
  const company = (job.company || "").toLowerCase();
  if (company === "unknown" || company === "various" || company === "confidential company")
    return { valid: false, reason: "generic company name" };
  return { valid: true };
}

// ── Date filter helper: convert date_posted filter to a cutoff timestamp ──
// All date math uses CST (America/Chicago) so "today" means today in user's local time.
function getDateCutoff(dateFilter: string): string | null {
  const now = new Date();
  const hoursMs = 60 * 60 * 1000;
  const dayMs = 24 * hoursMs;

  let cutoff: Date | null = null;
  switch (dateFilter) {
    case "today":
      // Rolling 36-hour window to be generous with timezone differences
      cutoff = new Date(now.getTime() - 36 * hoursMs);
      break;
    case "3days":
      cutoff = new Date(now.getTime() - 3 * dayMs);
      break;
    case "week":
      cutoff = new Date(now.getTime() - 7 * dayMs);
      break;
    case "2weeks":
      cutoff = new Date(now.getTime() - 14 * dayMs);
      break;
    case "month":
      cutoff = new Date(now.getTime() - 30 * dayMs);
      break;
    default:
      return null; // "all" — no date filter
  }
  const iso = cutoff.toISOString();
  console.log(`[DateCutoff] filter="${dateFilter}" → cutoff=${iso} (CST now: ${getCSTNow().display})`);
  return iso;
}

// ── DB Search: query cached_jobs directly with SQL filters ─────────────
async function searchDatabase(
  sb: any,
  query: string,
  filters: {
    location?: string;
    experience_level?: string;
    remote_filter?: string;
    job_type?: string;
    date_posted?: string;
    search_source?: string;
  },
  offset: number,
  limit: number,
  excludeFingerprints: string[] = []
): Promise<{ jobs: any[]; total: number }> {
  const searchTerms = query.toLowerCase().trim().split(/\s+/);

  // Build the query — search title, company, role_category, description
  let dbQuery = sb
    .from("cached_jobs")
    .select("*", { count: "exact" })
    .gt("expires_at", new Date().toISOString());

  // Text search: match ALL search terms against title OR company OR role_category
  // Use ilike for each term — job must match ALL terms in at least one of the fields
  for (const term of searchTerms) {
    // Strip PostgREST or()-syntax and wildcard characters, matching
    // searchScannedJobs: a raw comma/parenthesis breaks (or injects into) the filter.
    const safeTerm = term.replace(/[%_,()"\\]/g, "");
    if (!safeTerm) continue;
    const pattern = `%${safeTerm}%`;
    dbQuery = dbQuery.or(`title.ilike.${pattern},company.ilike.${pattern},role_category.ilike.${pattern},description.ilike.${pattern}`);
  }

  // Location filter
  if (filters.location && filters.location.trim()) {
    const loc = filters.location.trim();
    dbQuery = dbQuery.ilike("location", `%${loc}%`);
  }

  // Experience level filter
  if (filters.experience_level && filters.experience_level !== "all") {
    dbQuery = dbQuery.eq("experience_level", filters.experience_level);
  }

  // Remote filter
  if (filters.remote_filter === "remote-only") {
    dbQuery = dbQuery.eq("remote", true);
  } else if (filters.remote_filter === "on-site") {
    dbQuery = dbQuery.eq("remote", false);
  }
  // "hybrid" and "all" — no remote filter needed

  // Job type filter
  if (filters.job_type && filters.job_type !== "all") {
    dbQuery = dbQuery.ilike("job_type", `%${filters.job_type}%`);
  }

  // Date posted filter — use created_at (when job was added to our DB)
  const dateCutoff = getDateCutoff(filters.date_posted || "month");
  if (dateCutoff) {
    dbQuery = dbQuery.gte("created_at", dateCutoff);
  }

  // Search source filter — filter by source field
  if (filters.search_source === "direct") {
    // Exclude aggregator sources
    const aggregators = ["LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter", "SimplyHired", "Monster"];
    for (const agg of aggregators) {
      dbQuery = dbQuery.not("source", "ilike", `%${agg}%`);
    }
  }

  // Exclude already-shown fingerprints. PostgREST's `in` list syntax splits
  // on unquoted commas and treats bare parentheses as structure, so a raw
  // join breaks (and silently returns a query error -> empty results, see
  // searchDatabase's catch below) the moment a title/company contains a
  // comma ("Software Engineer, Backend") or parens ("SRE (Site Reliability
  // Engineer)") — quote each value per PostgREST's list-literal syntax.
  if (excludeFingerprints.length > 0) {
    const quoted = excludeFingerprints.map((fp) => `"${fp.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    dbQuery = dbQuery.not("job_fingerprint", "in", `(${quoted.join(",")})`);
  }

  // Pagination and ordering
  dbQuery = dbQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: jobs, count, error } = await dbQuery;

  if (error) {
    console.error("[DB] Search error:", JSON.stringify(error));
    return { jobs: [], total: 0 };
  }

  const cst = getCSTNow();
  console.log(`[DB] Query "${query}" → ${jobs?.length || 0} results (total: ${count || 0}), filters: ${JSON.stringify(filters)}, offset=${offset}, limit=${limit}, CST time: ${cst.display}`);

  return { jobs: jobs || [], total: count || 0 };
}

async function searchScannedJobs(
  sb: any,
  query: string,
  filters: {
    location?: string;
    remote_filter?: string;
    job_type?: string;
    date_posted?: string;
  },
  offset: number,
  limit: number,
): Promise<{ jobs: any[]; total: number }> {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let dbQuery = sb
    .from("scanned_jobs")
    .select("id,title,location,description_md,apply_url,compensation_text,employment_type,remote_policy,posted_at,last_seen_at,company:scan_companies!inner(name,category)", { count: "exact" })
    .eq("is_live", true);

  for (const term of terms) {
    const safeTerm = term.replace(/[%_,()]/g, "");
    if (safeTerm) dbQuery = dbQuery.or(`title.ilike.%${safeTerm}%,description_md.ilike.%${safeTerm}%`);
  }
  if (filters.location?.trim()) dbQuery = dbQuery.ilike("location", `%${filters.location.trim()}%`);
  if (filters.remote_filter === "remote-only") {
    dbQuery = dbQuery.or("remote_policy.ilike.%remote%,location.ilike.%remote%");
  } else if (filters.remote_filter === "on-site") {
    dbQuery = dbQuery.not("remote_policy", "ilike", "%remote%").not("location", "ilike", "%remote%");
  }
  if (filters.job_type && filters.job_type !== "all") {
    dbQuery = dbQuery.ilike("employment_type", `%${filters.job_type.replace(/-/g, "_")}%`);
  }
  const cutoff = getDateCutoff(filters.date_posted || "month");
  if (cutoff) dbQuery = dbQuery.gte("last_seen_at", cutoff);

  const { data, count, error } = await dbQuery
    .order("posted_at", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[SCANNED_DB] Search error:", JSON.stringify(error));
    return { jobs: [], total: 0 };
  }

  const jobs = (data || []).flatMap((row: any) => {
    const company = Array.isArray(row.company) ? row.company[0] : row.company;
    if (!isAllowedApplyUrl(row.apply_url || "")) return [];
    const description = row.description_md || "";
    return [{
      id: row.id,
      title: row.title,
      company: company?.name || "Company",
      location: row.location || "Location listed on company page",
      description,
      apply_url: row.apply_url,
      salary: row.compensation_text || null,
      job_type: row.employment_type || null,
      remote: /remote/i.test(`${row.remote_policy || ""} ${row.location || ""}`),
      date_posted: sanitizeDatePosted(row.posted_at || row.last_seen_at || "Recent"),
      source: `${company?.name || "Company"} careers`,
      role_category: classifyRoleCategory(row.title, description),
      experience_level: detectExperienceLevel(row.title, description),
      industry: company?.category || detectIndustry(company?.name || "", description),
    }];
  });
  return { jobs, total: count || jobs.length };
}

async function persistDirectJobs(sb: any, jobs: any[]): Promise<any[]> {
  const normalized: any[] = [];
  for (const job of jobs) {
    const applyUrl = sanitizeApplyUrl(job.apply_url || "", job.title || "", job.company || "", job.location || "");
    const candidate = { ...job, apply_url: applyUrl };
    const check = validateJob(candidate);
    if (!check.valid) continue;

    const jobRow = {
      title: candidate.title,
      company: candidate.company,
      location: candidate.location,
      description: candidate.description,
      apply_url: applyUrl,
      salary: candidate.salary || null,
      job_type: candidate.job_type || null,
      remote: Boolean(candidate.remote),
      date_posted: sanitizeDatePosted(candidate.date_posted || "Recent"),
      source: candidate.source || `${candidate.company} careers`,
      role_category: classifyRoleCategory(candidate.title, candidate.description),
      experience_level: detectExperienceLevel(candidate.title, candidate.description),
      industry: detectIndustry(candidate.company, candidate.description),
      job_fingerprint: jobFingerprint(candidate),
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const { data, error } = await sb
      .from("cached_jobs")
      .upsert(jobRow, { onConflict: "job_fingerprint", ignoreDuplicates: false })
      .select("id")
      .single();
    if (!error && data?.id) {
      normalized.push({ id: data.id, ...jobRow, job_fingerprint: undefined, expires_at: undefined });
    }
  }
  return normalized;
}

// ── Main Server ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const {
      query,
      location,
      salary_range,
      job_type,
      date_posted,
      resume_text,
      experience_level,
      remote_filter,
      search_source,
      page,
      skip_cache,
      force_web_search,  // NEW: explicitly request Perplexity search
      exclude_fingerprints, // NEW: fingerprints already shown to user
    } = await req.json();

    const pageNum = parseInt(page, 10) || 1;
    const pageSize = 15;
    const offset = (pageNum - 1) * pageSize;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const user = await getAuthedUser(req);
    const user_id = user.id;
    const { isPro } = await enforceAccountActive(sb, user_id);

    const searchQuery = query || "software engineer";
    const cstInfo = getCSTNow();
    console.log(`[SEARCH] ===== NEW REQUEST =====`);
    console.log(`[SEARCH] query="${searchQuery}", page=${pageNum}, offset=${offset}, user_id=${user_id || "anon"}`);
    console.log(`[SEARCH] filters: date_posted=${date_posted}, location=${location}, experience=${experience_level}, remote=${remote_filter}, job_type=${job_type}, source=${search_source}`);
    console.log(`[SEARCH] CST time: ${cstInfo.display}, UTC: ${cstInfo.isoString}`);
    console.log(`[SEARCH] force_web_search=${!!force_web_search}, skip_cache=${!!skip_cache}`);

    // ── STEP 1: Always try DB first (unless force_web_search) ──────────
    if (!force_web_search) {
      const dbResult = await searchDatabase(
        sb,
        searchQuery,
        {
          location,
          experience_level,
          remote_filter,
          job_type,
          date_posted,
          search_source,
        },
        offset,
        pageSize,
        exclude_fingerprints || []
      );

      console.log(`[STEP1] DB returned ${dbResult.jobs.length} jobs (total: ${dbResult.total})`);

      if (dbResult.jobs.length > 0) {
        // Post-query filter: enforce date_posted matches the requested filter
        // date_posted in DB can be: "March 5, 2026", "2026-03-05", "Recently", "1 week ago", etc.
        let dateFilteredJobs = dbResult.jobs.filter((job: any) => isAllowedApplyUrl(job.apply_url));
        if (date_posted && date_posted !== "all" && date_posted !== "month") {
          const cstNow = getCSTNow();
          const nowMs = cstNow.date.getTime();
          const dayMs = 24 * 60 * 60 * 1000;
          let maxAgeDays: number;
          switch (date_posted) {
            case "today": maxAgeDays = 1; break;
            case "3days": maxAgeDays = 3; break;
            case "week": maxAgeDays = 7; break;
            case "2weeks": maxAgeDays = 14; break;
            default: maxAgeDays = 9999; break;
          }

          dateFilteredJobs = dateFilteredJobs.filter((j: any) => {
            const dp = (j.date_posted || "").trim();
            if (!dp || /recently|just now/i.test(dp)) return true; // keep ambiguous ones

            // Try parsing as an actual date ("March 5, 2026" or "2026-03-05")
            const parsed = new Date(dp);
            if (!isNaN(parsed.getTime())) {
              const ageDays = Math.floor((nowMs - parsed.getTime()) / dayMs);
              return ageDays <= maxAgeDays;
            }

            // Try parsing relative strings ("2 days ago", "1 week ago", etc.)
            const daysAgo = dp.match(/(\d+)\s*days?\s*ago/i);
            if (daysAgo) return parseInt(daysAgo[1], 10) <= maxAgeDays;
            const weeksAgo = dp.match(/(\d+)\s*weeks?\s*ago/i);
            if (weeksAgo) return parseInt(weeksAgo[1], 10) * 7 <= maxAgeDays;
            const monthsAgo = dp.match(/(\d+)\s*months?\s*ago/i);
            if (monthsAgo) return parseInt(monthsAgo[1], 10) * 30 <= maxAgeDays;
            if (/today|yesterday/i.test(dp)) return maxAgeDays >= 1;

            // Can't determine age — keep it
            return true;
          });
          console.log(`[STEP1] Date post-filter "${date_posted}" (max ${maxAgeDays}d): ${dbResult.jobs.length} → ${dateFilteredJobs.length} jobs`);
        }

        // Filter out jobs already seen by this user
        let resultJobs = dateFilteredJobs;
        if (user_id) {
          const fingerprints = resultJobs.map((j: any) => j.job_fingerprint);
          const { data: seenJobs } = await sb
            .from("user_seen_jobs")
            .select("job_fingerprint")
            .eq("user_id", user_id)
            .in("job_fingerprint", fingerprints);

          const seenCount = (seenJobs || []).length;
          const seenSet = new Set((seenJobs || []).map((s: any) => s.job_fingerprint));
          resultJobs = resultJobs.filter((j: any) => !seenSet.has(j.job_fingerprint));
          console.log(`[STEP1] Seen filter: ${seenCount} seen, ${resultJobs.length} remaining`);

          // Mark these jobs as seen
          if (resultJobs.length > 0) {
            const seenInserts = resultJobs.map((j: any) => ({
              user_id,
              job_fingerprint: j.job_fingerprint,
            }));
            await sb
              .from("user_seen_jobs")
              .upsert(seenInserts, { onConflict: "user_id,job_fingerprint" })
              .select();
          }
        }

        // If we have results after filtering seen jobs, return them
        if (resultJobs.length > 0) {
          const normalizedJobs = resultJobs.map((job: any) => ({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description || "",
            apply_url: job.apply_url || "",
            salary: job.salary,
            job_type: job.job_type,
            remote: job.remote || false,
            date_posted: sanitizeDatePosted(job.date_posted || "Recent"),
            source: job.source || "Web Search",
            role_category: job.role_category || "Other",
            experience_level: job.experience_level || "Mid-Level",
            industry: job.industry || null,
          }));

          const elapsed = Date.now() - startTime;
          console.log(`[RESULT] DB SUCCESS: ${normalizedJobs.length} jobs (db_total: ${dbResult.total}) in ${elapsed}ms for "${searchQuery}"`);

          return new Response(
            JSON.stringify({
              jobs: normalizedJobs,
              total: dbResult.total,
              citations: [],
              query: searchQuery,
              elapsed_ms: elapsed,
              from_cache: true,
              from_db: true,
              db_total: dbResult.total,
              has_more_db: dbResult.total > offset + pageSize,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // If all DB jobs are already seen by user, we'll fall through to Perplexity
        console.log(`[STEP1] All ${dateFilteredJobs.length} DB jobs already seen by user, falling through to web search`);
      } else {
        console.log(`[STEP1] No DB results for "${searchQuery}" with filters, falling through to web search`);
      }

      const scannedResult = await searchScannedJobs(
        sb,
        searchQuery,
        { location, remote_filter, job_type, date_posted },
        offset,
        pageSize,
      );
      if (scannedResult.jobs.length > 0) {
        return new Response(
          JSON.stringify({
            jobs: scannedResult.jobs,
            total: scannedResult.total,
            citations: [],
            query: searchQuery,
            elapsed_ms: Date.now() - startTime,
            from_cache: false,
            from_db: true,
            db_total: scannedResult.total,
            has_more_db: scannedResult.total > offset + pageSize,
            source_mode: "verified_company_scans",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── STEP 2: DB exhausted — query public direct-employer feeds ─────
    const directJobs = await searchDirectJobSources({
      query: searchQuery,
      location,
      remoteFilter: remote_filter,
      experienceLevel: experience_level,
      limit: pageSize,
    });
    const persistedDirectJobs = await persistDirectJobs(sb, directJobs);
    if (persistedDirectJobs.length > 0) {
      return new Response(
        JSON.stringify({
          jobs: persistedDirectJobs,
          total: persistedDirectJobs.length,
          query: searchQuery,
          elapsed_ms: Date.now() - startTime,
          from_cache: false,
          from_db: false,
          source_mode: "direct_employer",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── STEP 3: Optional metered discovery expansion ──────────────────
    await enforceDailyCap(sb, user_id, "search", isPro);
    if (!cachedPerplexityKey) {
      cachedPerplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
      if (!cachedPerplexityKey) {
        const { data: vaultData } = await sb.rpc("vault_read_secret", {
          secret_name: "PERPLEXITY_API_KEY",
        });
        if (vaultData) cachedPerplexityKey = String(vaultData);
      }
    }

    if (!cachedPerplexityKey) {
      return new Response(
        JSON.stringify({
          error: "Job discovery is temporarily unavailable.",
          code: "SEARCH_UNAVAILABLE",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build search prompt with all filters
    const parts: string[] = [`"${searchQuery}" jobs`];
    const searchLocation = location || "United States";
    parts.push(`in ${searchLocation}, USA`);
    if (job_type && job_type !== "all") parts.push(job_type);
    if (salary_range && salary_range !== "any") parts.push(`salary ${salary_range}`);
    if (date_posted && date_posted !== "all" && date_posted !== "month") parts.push(`posted last ${date_posted}`);
    if (experience_level && experience_level !== "all") parts.push(`${experience_level} level`);
    if (remote_filter === "remote-only") parts.push("remote");
    else if (remote_filter === "hybrid") parts.push("hybrid");
    else if (remote_filter === "on-site") parts.push("on-site in-office");

    const resumeHint = resume_text
      ? `\nCandidate background: ${resume_text.substring(0, 300)}. Prioritize matching roles.`
      : "";

    const now = new Date();
    const todayStr = now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/Chicago",
    });
    console.log(`[STEP2] Falling through to Perplexity. Today (CST): ${todayStr}`);

    const sourceInstruction = `- DIRECT COMPANY SOURCES ONLY: You MUST search ONLY company career pages, hiring platforms, and direct employer portals. Search Greenhouse, Lever, Ashby, Workday, iCIMS, Jobvite, BambooHR, SmartRecruiters, and company career pages. Do NOT return aggregator pages. The source field must identify the employer or ATS.`;

    const systemPrompt = `You are a job search engine for the United States job market ONLY. Return ONLY valid JSON, no markdown, no explanation.
TODAY'S DATE IS: ${todayStr}. Use this to calculate accurate relative dates for when jobs were posted.
Format: {"jobs":[{"title":"","company":"","location":"","description":"","apply_url":"https://...","salary":"","job_type":"Full-time/Part-time/Contract/Internship","remote":false,"date_posted":"2 days ago","source":"Company Careers/Greenhouse/Lever/Ashby/Workday","experience_level":"Entry-Level/Mid-Level/Senior/Executive"}]}
CRITICAL RULES:
- ONLY return jobs located in the United States — absolutely NO jobs from India, Canada, UK, Europe, Asia, or any other country
- Every location MUST be a US city/state (e.g. "San Francisco, CA", "New York, NY", "Remote (US)")
- If a job is remote, it must be US-based remote — mark location as "Remote (US)" not just "Remote"
- DESCRIPTION RULES: Each job MUST include a detailed description (5-10 sentences) pulled directly from the actual job posting. Include the real responsibilities, requirements, qualifications, and any listed benefits. Do NOT summarize or paraphrase — use the actual content from the job posting as closely as possible. Never leave the description empty.
- Find as many REAL job listings as possible — aim for 15-20 jobs minimum
${sourceInstruction}
- APPLY URL RULES: Every job MUST have a real, clickable apply_url that goes DIRECTLY to that specific job's application page — NOT a generic company careers homepage (e.g., NOT "company.com/careers"), NOT a job board search results page (e.g., NOT "linkedin.com/jobs/search/..."), and NOT a filtered search page. The URL must point to the individual job posting where the user can see the full description and click "Apply". Examples of GOOD URLs: "https://boards.greenhouse.io/company/jobs/12345", "https://www.linkedin.com/jobs/view/123456789", "https://company.com/careers/apply/12345". Examples of BAD URLs: "https://company.com/careers", "https://indeed.com/jobs?q=engineer", "https://linkedin.com/jobs/search/?keywords=engineer".
- DATE RULES: Today is ${todayStr}. For date_posted, calculate relative time from TODAY and use labels like "Today", "1 day ago", "2 days ago", "3 days ago", "1 week ago", "2 weeks ago", "1 month ago", etc. NEVER use exact calendar dates. If a job posting says it was posted on a specific date, calculate how many days ago that was from today (${todayStr}) and use the relative label. If you cannot determine when a job was posted, use "Recently". NEVER return a future date.
- EXPERIENCE LEVEL: For each job, determine the experience_level from the job title and requirements. Use EXACTLY one of: "Internship", "Entry-Level", "Mid-Level", "Senior", "Executive"
- Do NOT make up or fabricate jobs — only return real current listings
- Include salary info when available (in USD)
- Each job must have a different company or be a distinctly different role
- Return ONLY the JSON object`;

    const paginationHint = pageNum > 1
      ? ` This is page ${pageNum} of search results — return DIFFERENT jobs than typical first-page results. Focus on additional companies, smaller/newer companies, and less-common job boards. Do NOT repeat commonly shown listings.`
      : "";

    const userPrompt = `Search company career pages, Greenhouse, Lever, Ashby, Workday, and direct employer hiring portals to find real job listings in the UNITED STATES ONLY for: ${parts.join(", ")}. Find at least 15 different jobs posted directly by companies. Do NOT include results from aggregators. Do NOT include jobs from outside the United States.${resumeHint}${paginationHint}`;

    let recencyFilter = "month";
    if (date_posted === "today") recencyFilter = "day";
    else if (date_posted === "3days" || date_posted === "week") recencyFilter = "week";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const perplexityResponse = await fetch(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cachedPerplexityKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 8000,
            temperature: 0.0,
            search_recency_filter: recencyFilter,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!perplexityResponse.ok) {
        const errText = await perplexityResponse.text();
        console.error("Metered search provider error:", errText);
        return new Response(
          JSON.stringify({ error: "Job discovery is temporarily unavailable.", code: "SEARCH_UPSTREAM_FAILED" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const perplexityData = await perplexityResponse.json();
      await logAiUsage(
        sb,
        user_id,
        "search",
        Number(perplexityData.usage?.prompt_tokens || 0),
        Number(perplexityData.usage?.completion_tokens || 0),
      );
      const content = perplexityData.choices?.[0]?.message?.content || "";
      const citations = perplexityData.citations || [];

      let jobs: any[] = [];
      try {
        const jsonMatch = content.match(/\{[\s\S]*"jobs"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          jobs = parsed.jobs || [];
        }
      } catch (parseErr) {
        console.error("Failed to parse Perplexity response:", parseErr);
        try {
          const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          jobs = parsed.jobs || [];
        } catch {
          console.error("Fallback parse also failed");
        }
      }

      // ── Quality validation + categorization ────────────────────────
      const validatedJobs: any[] = [];
      let rejectedCount = 0;

      for (const job of jobs.slice(0, 30)) {
        const check = validateJob(job);
        if (!check.valid) {
          console.log(`Rejected job: ${job.title || "?"} at ${job.company || "?"} — ${check.reason}`);
          rejectedCount++;
          continue;
        }

        const roleCategory = classifyRoleCategory(job.title || "", job.description || "");
        const expLevel = job.experience_level || detectExperienceLevel(job.title || "", job.description || "");
        const industry = detectIndustry(job.company || "", job.description || "");

        validatedJobs.push({
          ...job,
          role_category: roleCategory,
          experience_level: expLevel,
          industry: industry,
        });
      }

      const passRate = jobs.length > 0 ? Math.round((validatedJobs.length / jobs.length) * 100) : 0;
      console.log(`Quality: ${validatedJobs.length}/${jobs.length} passed (${passRate}%), ${rejectedCount} rejected`);

      // ── Save to cached_jobs ────────────────────────────────────────
      const normalizedJobs: any[] = [];
      const jobIds: string[] = [];

      for (const job of validatedJobs.slice(0, 25)) {
        const fp = jobFingerprint(job);

        const jobRow = {
          title: job.title || "Unknown Title",
          company: job.company || "Unknown Company",
          location: job.location || "Not specified",
          description: job.description || "",
          apply_url: sanitizeApplyUrl(job.apply_url || job.url || "", job.title || "", job.company || "", job.location || ""),
          salary: job.salary || null,
          job_type: job.job_type || null,
          remote: job.remote || false,
          date_posted: sanitizeDatePosted(job.date_posted || "Recent"),
          source: job.source || "Web Search",
          role_category: job.role_category || "Other",
          experience_level: job.experience_level || "Mid-Level",
          industry: job.industry || null,
          job_fingerprint: fp,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const { data: upserted, error: upsertErr } = await sb
          .from("cached_jobs")
          .upsert(jobRow, { onConflict: "job_fingerprint", ignoreDuplicates: false })
          .select("id")
          .single();

        if (upserted) {
          jobIds.push(upserted.id);
          normalizedJobs.push({
            id: upserted.id, ...jobRow,
            job_fingerprint: undefined, expires_at: undefined,
          });
        } else if (upsertErr) {
          const { data: existing } = await sb
            .from("cached_jobs")
            .select("id")
            .eq("job_fingerprint", fp)
            .single();
          if (existing) {
            jobIds.push(existing.id);
            normalizedJobs.push({
              id: existing.id, ...jobRow,
              job_fingerprint: undefined, expires_at: undefined,
            });
          }
        }
      }

      // ── Fire-and-forget bridge to `jobs` table ─────────────────────
      const bridgeRows = normalizedJobs.map((job: any) => {
        const fp = jobFingerprint({ title: job.title, company: job.company, location: job.location });
        let salaryMin: number | null = null;
        let salaryMax: number | null = null;
        if (job.salary) {
          const nums = job.salary.match(/(\d[\d,]*)/g);
          if (nums && nums.length >= 1) {
            salaryMin = parseInt(nums[0].replace(/,/g, ""), 10);
            if (job.salary.toLowerCase().includes("k")) salaryMin *= 1000;
            else if (salaryMin < 1000) salaryMin *= 1000;
          }
          if (nums && nums.length >= 2) {
            salaryMax = parseInt(nums[1].replace(/,/g, ""), 10);
            if (job.salary.toLowerCase().includes("k")) salaryMax *= 1000;
            else if (salaryMax < 1000) salaryMax *= 1000;
          }
        }
        return {
          title: job.title, company: job.company, location: job.location,
          description: job.description, apply_url: job.apply_url,
          salary_min: salaryMin, salary_max: salaryMax,
          job_type: job.job_type, remote: job.remote,
          date_posted: relativeDateToTimestamp(job.date_posted),
          source: job.source || "Web Search",
          role_category: job.role_category || "Other",
          experience_level: job.experience_level || "Mid-Level",
          industry: job.industry || null,
          external_id: `search_${fp}`,
        };
      });
      sb.from("jobs").upsert(bridgeRows, { onConflict: "external_id" }).then(
        () => console.log(`Bridged ${bridgeRows.length} jobs to jobs table`),
        (err: any) => console.error("Bridge to jobs table failed:", err)
      );

      // Mark jobs as seen by user
      if (user_id && normalizedJobs.length > 0) {
        const seenInserts = normalizedJobs.map((j: any) => ({
          user_id,
          job_fingerprint: jobFingerprint({ title: j.title, company: j.company, location: j.location }),
        }));
        await sb
          .from("user_seen_jobs")
          .upsert(seenInserts, { onConflict: "user_id,job_fingerprint" })
          .select();
      }

      const finalJobs = normalizedJobs;
      const elapsed = Date.now() - startTime;

      const sources = new Set(finalJobs.map((j: any) => (j.source || "").toLowerCase()));
      console.log(`Web search: ${finalJobs.length} jobs from ${sources.size} sources in ${elapsed}ms (quality: ${passRate}%)`);

      return new Response(
        JSON.stringify({
          jobs: finalJobs,
          total: finalJobs.length,
          citations,
          query: searchQuery,
          elapsed_ms: elapsed,
          from_cache: false,
          from_db: false,
          quality_pass_rate: passRate,
          sources_count: sources.size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        console.error("Perplexity API timed out after 25s");
        return new Response(
          JSON.stringify({ error: "Search timed out. Please try a simpler query.", timed_out: true }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw fetchErr;
    }
  } catch (err) {
    console.error("perplexity-job-search error:", err);
    const isExpected = err instanceof HttpError;
    const status = isExpected ? err.status : 500;
    const message = status === 401
      ? "Please sign in again."
      : status === 403
        ? "Job discovery is not available for this account."
        : status === 429
          ? "The current job discovery limit has been reached."
          : "Job discovery is temporarily unavailable.";
    return new Response(
      JSON.stringify({ error: message, code: `SEARCH_${status}` }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

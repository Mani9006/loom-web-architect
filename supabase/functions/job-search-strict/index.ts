/**
 * job-search-strict
 *
 * Clean job search that ONLY returns company-direct career pages.
 * Replaces the messy perplexity-job-search + job-search + kimi-job-finder
 * cluster. Old functions stay in place until this is wired into the UI.
 *
 * Pipeline:
 *   1. Perplexity searches for jobs matching query+filters, instructed to
 *      return ONLY company careers pages (Greenhouse/Ashby/Lever/Workday/etc).
 *   2. (Optional) Apify scrapes specific career pages when APIFY_TOKEN is set
 *      and APIFY_JOB_ACTOR is configured. Off by default.
 *   3. Server-side filters enforce: source allowlist, date window math, salary
 *      floor, experience level, remote/hybrid/onsite, location.
 *   4. Dedupe and cache to `cached_jobs` for subsequent same-query hits.
 *
 * Input:
 *   { query, location?, dateWindow?, minSalaryUsd?, level?, remote?, page? }
 * Output:
 *   { jobs: NormalizedJob[], total, dropped, from_cache, elapsed_ms }
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
  logAiUsage,
} from "../_shared/guards.ts";
import {
  applyFilters,
  type DateWindow,
  type ExperienceLevel,
  type NormalizedJob,
  type RemoteFilter,
  stableJobId,
  isAllowedApplyUrl,
  dateWindowLabel,
} from "../_shared/jobs.ts";

interface RequestBody {
  query?: string;
  location?: string;
  dateWindow?: DateWindow;
  minSalaryUsd?: number;
  level?: ExperienceLevel;
  remote?: RemoteFilter;
  page?: number;
}

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const PAGE_SIZE = 25;

Deno.serve((req) =>
  withErrorHandler(async () => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");

    const t0 = Date.now();
    const user = await getAuthedUser(req);
    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    // job search burns a lot — use the evaluation kind cap as proxy until we
    // add a "job_search" kind to ai_usage_daily.
    await enforceDailyCap(svc, user.id, "evaluation", isPro);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const query = (body.query ?? "").trim();
    if (query.length < 2) throw new HttpError(400, "query is required");

    const filters = {
      dateWindow: body.dateWindow ?? "7d",
      minSalaryUsd: body.minSalaryUsd,
      level: body.level,
      remote: body.remote ?? "any",
      locationContains: body.location ?? "",
    } as const;

    const page = Math.max(0, body.page ?? 0);

    // 1. Perplexity discovery
    const { jobs: perplexityJobs, usage } = await searchPerplexity({
      query,
      location: body.location ?? "",
      dateWindow: filters.dateWindow,
      level: filters.level,
      remote: filters.remote,
    });
    // Record the call so enforceDailyCap above actually trips on repeat use.
    await logAiUsage(svc, user.id, "evaluation", usage.tokens_in, usage.tokens_out);

    // 2. Apify follow-up (optional, gated on env)
    const apifyJobs = await searchApifyIfConfigured({
      query,
      location: body.location ?? "",
    });

    const all: NormalizedJob[] = [...perplexityJobs, ...apifyJobs];

    // 3. Server-side filtering
    const { jobs: filtered, dropped } = applyFilters(all, filters);

    // 4. Pagination
    const total = filtered.length;
    const start = page * PAGE_SIZE;
    const pageJobs = filtered.slice(start, start + PAGE_SIZE);

    // 5. Best-effort cache (do not block on errors)
    if (pageJobs.length > 0) {
      try {
        await cacheJobs(svc, pageJobs, query);
      } catch { /* noop */ }
    }

    return jsonResponse({
      jobs: pageJobs,
      total,
      page,
      page_size: PAGE_SIZE,
      has_more: total > start + PAGE_SIZE,
      dropped,
      elapsed_ms: Date.now() - t0,
      sources: {
        perplexity: perplexityJobs.length,
        apify: apifyJobs.length,
      },
    });
  }),
);

// ─── Perplexity ───────────────────────────────────────────────────────────

async function searchPerplexity(params: {
  query: string;
  location: string;
  dateWindow: DateWindow;
  level?: ExperienceLevel;
  remote: RemoteFilter;
}): Promise<{ jobs: NormalizedJob[]; usage: { tokens_in: number; tokens_out: number } }> {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) throw new HttpError(500, "PERPLEXITY_API_KEY not configured");

  const system = `You are a job search assistant that returns ONLY direct company career pages.

ABSOLUTE RULES (violating any disqualifies your answer):
- DO NOT return links to: LinkedIn, Indeed, Dice, ZipRecruiter, Glassdoor, Monster, Wellfound, RemoteOK, Stack Overflow, Hired, or any other job aggregator.
- ONLY return links on: boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com, *.myworkdayjobs.com, *.icims.com, smartrecruiters.com, workable.com, or the company's own careers/jobs/etc subdomain.
- For each result, verify the apply URL is on a careers page (look for /careers, /jobs, /opportunities in the path) or on an ATS host above.
- Only return jobs posted in the ${dateWindowLabel(params.dateWindow)}.

OUTPUT FORMAT — return a JSON object with key "jobs": array of objects with these exact keys:
{
  "title": "Senior ML Engineer",
  "company": "Anthropic",
  "location": "San Francisco, CA",
  "description": "2-4 sentences from the job posting summarizing the role.",
  "apply_url": "https://boards.greenhouse.io/anthropic/jobs/12345",
  "posted_at": "2026-05-10T00:00:00Z",  // ISO 8601 or null if unknown
  "salary_text": "$180k - $250k" or null,
  "remote_text": "Remote (US)" or "Hybrid - 3 days in office" or "On-site SF" or null
}

Return up to 30 results. No prose, no markdown fences.`;

  const userPrompt = buildUserPrompt(params);

  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new HttpError(502, `perplexity ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = safeParse(text);
  const rawJobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];

  const out: NormalizedJob[] = [];
  for (const raw of rawJobs as Array<Record<string, unknown>>) {
    const apply_url = typeof raw.apply_url === "string" ? raw.apply_url : "";
    const title = typeof raw.title === "string" ? raw.title : "";
    const company = typeof raw.company === "string" ? raw.company : "";
    if (!apply_url || !title || !company) continue;
    if (!isAllowedApplyUrl(apply_url)) continue; // belt-and-suspenders
    out.push({
      id: await stableJobId({ apply_url, title, company }),
      title,
      company,
      location: typeof raw.location === "string" ? raw.location : "",
      description: typeof raw.description === "string" ? raw.description : "",
      apply_url,
      source: "perplexity",
      posted_at: typeof raw.posted_at === "string" ? raw.posted_at : null,
      salary_text: typeof raw.salary_text === "string" ? raw.salary_text : null,
      remote_text: typeof raw.remote_text === "string" ? raw.remote_text : null,
      raw,
    });
  }
  return {
    jobs: out,
    usage: {
      tokens_in: Number(data.usage?.prompt_tokens) || 0,
      tokens_out: Number(data.usage?.completion_tokens) || 0,
    },
  };
}

function buildUserPrompt(p: {
  query: string;
  location: string;
  dateWindow: DateWindow;
  level?: ExperienceLevel;
  remote: RemoteFilter;
}): string {
  const lines = [`Search for: ${p.query}`];
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.level) lines.push(`Seniority: ${p.level}`);
  if (p.remote !== "any") lines.push(`Work mode: ${p.remote}`);
  lines.push(`Posted: ${dateWindowLabel(p.dateWindow)}`);
  lines.push(``);
  lines.push(`Return up to 30 jobs from direct company career pages only.`);
  return lines.join("\n");
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ─── Apify (optional) ─────────────────────────────────────────────────────

async function searchApifyIfConfigured(params: { query: string; location: string }): Promise<NormalizedJob[]> {
  const token = Deno.env.get("APIFY_TOKEN");
  const actor = Deno.env.get("APIFY_JOB_ACTOR"); // e.g. "username~actor-slug"
  if (!token || !actor) return [];

  // Run actor sync, get dataset items, normalize.
  // Different actors return different shapes — keep parsing permissive.
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=60`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search: params.query, location: params.location, maxItems: 30 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return [];
    const items = await res.json();
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const it of items as Array<Record<string, unknown>>) {
      const apply_url = pickUrl(it);
      const title = pickStr(it, ["title", "jobTitle", "name", "position"]);
      const company = pickStr(it, ["company", "companyName", "employer"]);
      if (!apply_url || !title || !company) continue;
      if (!isAllowedApplyUrl(apply_url)) continue;
      out.push({
        id: await stableJobId({ apply_url, title, company }),
        title,
        company,
        location: pickStr(it, ["location", "city", "place"]),
        description: pickStr(it, ["description", "summary", "snippet"]),
        apply_url,
        source: `apify:${actor}`,
        posted_at: pickStr(it, ["postedAt", "datePosted", "published_at", "date"]) || null,
        salary_text: pickStr(it, ["salary", "salaryText", "compensation"]) || null,
        remote_text: pickStr(it, ["workplaceType", "remote", "locationType"]) || null,
        raw: it,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
function pickUrl(o: Record<string, unknown>): string {
  return pickStr(o, ["applyUrl", "apply_url", "url", "jobUrl", "link"]);
}

// ─── Cache ────────────────────────────────────────────────────────────────

async function cacheJobs(
  svc: ReturnType<typeof serviceClient>,
  jobs: NormalizedJob[],
  query: string,
): Promise<void> {
  // Best-effort upsert into cached_jobs (table may not have these exact cols;
  // we wrap in try in caller). Cast to never to bypass strict typing — the
  // generator may lag actual schema.
  const rows = jobs.map((j) => ({
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description,
    apply_url: j.apply_url,
    source: j.source,
    date_posted: j.posted_at,
    salary: j.salary_text,
    remote: j.remote_text,
    query,
    cached_at: new Date().toISOString(),
  }));
  await (svc as unknown as { from: (t: string) => { upsert: (r: unknown, o: unknown) => unknown } })
    .from("cached_jobs")
    .upsert(rows, { onConflict: "apply_url" });
}

/**
 * career-ops-scan — Zero-LLM portal scanner
 *
 * Ported from santifer/career-ops `scan.mjs`. Fetches Greenhouse / Ashby /
 * Lever public job-board APIs plus the no-key aggregate feeds (Remotive,
 * Arbeitnow) and Adzuna for every enabled company in `scan_companies`,
 * upserts live postings into `scanned_jobs`, and marks stale ones `is_live=false`.
 *
 * Safe to run on a schedule (pg_cron → net.http_post hits this function).
 * No user context; uses service-role key only.
 *
 * Triggers:
 *   - Hourly via pg_cron (jobname: career-ops-hourly-scan)
 *   - Manual admin kick via POST { source: "admin" }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15_000;
const STALE_AFTER_HOURS = 24 * 7; // mark is_live=false if not seen in a week

type ApiType = "greenhouse" | "ashby" | "lever" | "workable" | "remotive" | "arbeitnow" | "adzuna";
interface ScanCompany {
  id: string;
  slug: string;
  name: string;
  api_type: ApiType;
  api_identifier: string;
  enabled: boolean;
}
interface Posting {
  external_id: string;
  title: string;
  location: string | null;
  department: string | null;
  employment_type: string | null;
  remote_policy: string | null;
  compensation_text: string | null;
  description_md: string | null;
  apply_url: string;
  posted_at: string | null;
  raw: unknown;
}

function svc() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "resumepreps-career-ops/1.0" } });
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// ── API fetchers ────────────────────────────────────────────────

async function fetchGreenhouse(ident: string): Promise<Posting[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${ident}/jobs?content=true`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`greenhouse ${res.status}`);
  const json = await res.json();
  const jobs: any[] = json.jobs || [];
  return jobs.map((j) => ({
    external_id: String(j.id),
    title: j.title || "",
    location: j.location?.name ?? null,
    department: j.departments?.[0]?.name ?? null,
    employment_type: j.metadata?.find((m: any) => /employment type/i.test(m?.name))?.value ?? null,
    remote_policy: /remote/i.test(j.location?.name || "") ? "Remote" : null,
    compensation_text: null,
    description_md: stripHtml(j.content),
    apply_url: j.absolute_url,
    posted_at: j.updated_at || null,
    raw: j,
  }));
}

async function fetchAshby(ident: string): Promise<Posting[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${ident}?includeCompensation=true`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`ashby ${res.status}`);
  const json = await res.json();
  const jobs: any[] = json.jobs || [];
  return jobs.map((j) => ({
    external_id: String(j.id),
    title: j.title || "",
    location: j.location || j.locationName || null,
    department: j.department || j.team || null,
    employment_type: j.employmentType || null,
    remote_policy: j.workplaceType || (j.isRemote ? "Remote" : null),
    compensation_text: j.compensation?.compensationTierSummary || null,
    description_md: j.descriptionPlain || stripHtml(j.descriptionHtml || j.jobDescription || ""),
    apply_url: j.jobUrl || j.applyUrl || "",
    posted_at: j.publishedAt || null,
    raw: j,
  })).filter((p) => p.apply_url);
}

async function fetchLever(ident: string): Promise<Posting[]> {
  const url = `https://api.lever.co/v0/postings/${ident}?mode=json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`lever ${res.status}`);
  const json: any[] = await res.json();
  return json.map((j) => ({
    external_id: String(j.id),
    title: j.text || "",
    location: j.categories?.location ?? null,
    department: j.categories?.team ?? null,
    employment_type: j.categories?.commitment ?? null,
    remote_policy: j.workplaceType || null,
    compensation_text: j.salaryRange ? `${j.salaryRange.min}-${j.salaryRange.max} ${j.salaryRange.currency || ""}` : null,
    description_md: stripHtml(j.description || j.descriptionPlain || ""),
    apply_url: j.applyUrl || j.hostedUrl || "",
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    raw: j,
  })).filter((p) => p.apply_url);
}

async function fetchWorkable(ident: string): Promise<Posting[]> {
  // Public listing API (no key): POST /api/v3/accounts/{slug}/jobs with
  // nextPage token pagination, 10 results/page. Workable softly throttles
  // (~100 req/IP), so cap at 3 pages (30 freshest jobs) per hourly scan.
  // NOTE: the listing payload has no description body; description_md stays
  // empty until a detail-endpoint fetch is added.
  const postings: Posting[] = [];
  let token = "";
  for (let page = 0; page < 3; page++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`https://apply.workable.com/api/v3/accounts/${encodeURIComponent(ident)}/jobs`, {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", "User-Agent": "resumepreps-career-ops/1.0" },
        body: JSON.stringify({ query: "", location: [], department: [], worktype: [], remote: [], token }),
      });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) throw new Error(`workable ${res.status}`);
    const json = await res.json();
    const jobs: any[] = json.results || [];
    if (jobs.length === 0) break;
    postings.push(...jobs.map((j) => {
      const loc = [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", ");
      return {
        external_id: String(j.shortcode || j.id),
        title: j.title || "",
        location: loc || null,
        department: j.department?.[0] ?? null,
        employment_type: j.type || null,
        remote_policy: j.remote === true || j.workplace === "remote" ? "Remote" : null,
        compensation_text: null,
        description_md: "",
        apply_url: `https://apply.workable.com/${ident}/j/${j.shortcode}/`,
        posted_at: j.published || null,
        raw: j,
      };
    }).filter((p) => p.title && !p.apply_url.endsWith("/j/undefined/")));
    if (!json.nextPage) break;
    token = String(json.nextPage);
  }
  return postings;
}

async function fetchRemotive(ident: string): Promise<Posting[]> {
  // No key required. ident = Remotive category slug ("software-dev", ...);
  // "all" pulls the full remote feed.
  const url = ident === "all"
    ? "https://remotive.com/api/remote-jobs?limit=500"
    : `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(ident)}&limit=500`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`remotive ${res.status}`);
  const json = await res.json();
  const jobs: any[] = json.jobs || [];
  return jobs.map((j) => ({
    external_id: String(j.id),
    title: j.title || "",
    location: j.candidate_required_location || "Anywhere",
    department: j.category ?? null,
    employment_type: j.job_type ?? null,
    remote_policy: "Remote",
    compensation_text: j.salary || null,
    description_md: stripHtml(j.description),
    apply_url: j.url || "",
    posted_at: j.publication_date || null,
    raw: j,
  })).filter((p) => p.apply_url);
}

async function fetchArbeitnow(_ident: string): Promise<Posting[]> {
  // No key required. Paginated board API (~100/page); first 3 pages keeps
  // the hourly scan bounded while covering fresh postings.
  const postings: Posting[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetchWithTimeout(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    if (!res.ok) throw new Error(`arbeitnow ${res.status}`);
    const json = await res.json();
    const jobs: any[] = json.data || [];
    if (jobs.length === 0) break;
    postings.push(...jobs.map((j) => ({
      external_id: String(j.slug),
      title: j.title || "",
      location: j.location ?? null,
      department: null,
      employment_type: j.job_types?.[0] ?? null,
      remote_policy: j.remote ? "Remote" : null,
      compensation_text: null,
      description_md: stripHtml(j.description),
      apply_url: j.url || "",
      posted_at: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : null,
      raw: j,
    })).filter((p) => p.apply_url));
    if (!json.links?.next) break;
  }
  return postings;
}

// Adzuna free tier: 25 calls/min. Two category pages per scan with a gap
// stays well under the cap. US board, 50 results/page.
const ADZUNA_CATEGORIES = ["it-jobs", "engineering-jobs"] as const;
const ADZUNA_RESULTS_PER_PAGE = 50;
const ADZUNA_REQUEST_GAP_MS = 2_600;

async function fetchAdzuna(ident: string): Promise<Posting[]> {
  const appId = Deno.env.get("ADZUNA_APP_ID");
  const appKey = Deno.env.get("ADZUNA_APP_KEY");
  if (!appId || !appKey) throw new Error("adzuna credentials not configured");
  const country = (ident || "us").toLowerCase(); // ident = Adzuna country code
  const postings: Posting[] = [];
  for (const [i, category] of ADZUNA_CATEGORIES.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, ADZUNA_REQUEST_GAP_MS));
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1`
      + `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}`
      + `&results_per_page=${ADZUNA_RESULTS_PER_PAGE}&category=${category}`
      + `&content-type=application/json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`adzuna ${res.status}`);
    const json = await res.json();
    const jobs: any[] = json.results || [];
    postings.push(...jobs.map((j) => ({
      external_id: String(j.id),
      title: stripHtml(j.title) || "",
      location: j.location?.display_name ?? null,
      department: j.category?.label ?? null,
      employment_type: j.contract_time ?? null,
      remote_policy: /remote/i.test(`${j.title || ""} ${j.description || ""}`) ? "Remote" : null,
      compensation_text: j.salary_min && j.salary_max
        ? `${Math.round(j.salary_min)}-${Math.round(j.salary_max)} ${j.salary_is_predicted ? "(est.)" : ""}`.trim()
        : null,
      description_md: j.description || null,
      apply_url: j.redirect_url || "",
      posted_at: j.created || null,
      raw: j,
    })).filter((p) => p.apply_url));
  }
  return postings;
}

async function fetchCompany(c: ScanCompany): Promise<Posting[]> {
  switch (c.api_type) {
    case "greenhouse": return fetchGreenhouse(c.api_identifier);
    case "ashby":      return fetchAshby(c.api_identifier);
    case "lever":      return fetchLever(c.api_identifier);
    case "workable":   return fetchWorkable(c.api_identifier);
    case "remotive":   return fetchRemotive(c.api_identifier);
    case "arbeitnow":  return fetchArbeitnow(c.api_identifier);
    case "adzuna":     return fetchAdzuna(c.api_identifier);
  }
}

// ── Orchestration ──────────────────────────────────────────────

async function processCompany(db: ReturnType<typeof svc>, c: ScanCompany) {
  const startedAt = new Date();
  try {
    const postings = await fetchCompany(c);
    if (postings.length === 0) {
      await db.from("scan_companies").update({
        last_scanned_at: startedAt.toISOString(),
        last_scan_count: 0,
        last_scan_error: null,
      }).eq("id", c.id);
      return { company: c.slug, upserted: 0 };
    }

    // Upsert in batches of 100 to stay within payload limits
    for (let i = 0; i < postings.length; i += 100) {
      const batch = postings.slice(i, i + 100).map((p) => ({
        company_id: c.id,
        external_id: p.external_id,
        title: p.title,
        location: p.location,
        department: p.department,
        employment_type: p.employment_type,
        remote_policy: p.remote_policy,
        compensation_text: p.compensation_text,
        description_md: p.description_md,
        apply_url: p.apply_url,
        posted_at: p.posted_at,
        last_seen_at: startedAt.toISOString(),
        is_live: true,
        raw: p.raw,
      }));
      const { error } = await db.from("scanned_jobs").upsert(batch, {
        onConflict: "company_id,external_id",
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    await db.from("scan_companies").update({
      last_scanned_at: startedAt.toISOString(),
      last_scan_count: postings.length,
      last_scan_error: null,
    }).eq("id", c.id);
    return { company: c.slug, upserted: postings.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("scan_companies").update({
      last_scanned_at: startedAt.toISOString(),
      last_scan_error: msg.slice(0, 500),
    }).eq("id", c.id);
    return { company: c.slug, error: msg };
  }
}

async function markStale(db: ReturnType<typeof svc>) {
  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 3600_000).toISOString();
  const { error, count } = await db
    .from("scanned_jobs")
    .update({ is_live: false })
    .eq("is_live", true)
    .lt("last_seen_at", cutoff)
    .select("id", { count: "exact", head: true });
  if (error) return { staleError: error.message };
  return { marked_stale: count ?? 0 };
}

async function runScan() {
  const db = svc();
  // Batch per invocation: the stalest N sources only. With many enabled
  // boards, scanning all at once exceeds the edge-function compute limit
  // (WORKER_RESOURCE_LIMIT). Ordered stalest-first, every source is covered
  // across successive scheduled runs.
  const BATCH_SIZE = Number(Deno.env.get("SCAN_BATCH_SIZE") || 15);
  const { data: companies, error } = await db
    .from("scan_companies")
    .select("id,slug,name,api_type,api_identifier,enabled,last_scanned_at")
    .eq("enabled", true)
    .order("last_scanned_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(`load companies: ${error.message}`);
  const queue: ScanCompany[] = (companies || []) as ScanCompany[];

  const results: unknown[] = [];
  // Simple bounded concurrency — no external queue lib needed.
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      results.push(await processCompany(db, c));
    }
  });
  await Promise.all(workers);
  const stale = await markStale(db);
  return { scanned: results.length, results, ...stale };
}

// ── HTTP entry ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Accept the service-role credential used by the scheduler or a verified
    // administrator JWT. Merely sending any Authorization header is not proof
    // of identity.
    const authorization = req.headers.get("authorization") || "";
    const bearer = authorization.replace(/^Bearer\s+/i, "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const workerToken = Deno.env.get("WORKER_AUTH_TOKEN") || "";
    let authorized = Boolean((serviceRole && bearer === serviceRole) || (workerToken && bearer === workerToken));
    if (!authorized && bearer) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } },
      );
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: role } = await svc()
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        authorized = Boolean(role);
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const summary = await runScan();
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("career-ops-scan failed", e);
    return new Response(JSON.stringify({ error: "Job ingestion could not be completed.", code: "INGESTION_FAILED" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

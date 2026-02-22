#!/usr/bin/env node
/**
 * market-domination-map.mjs
 *
 * Generates a snapshot KPI board for the weekly strategy review.
 * Reads live platform counts from Supabase (if credentials are available)
 * and prints a markdown report to stdout and to .openclaw/reports/.
 *
 * Usage:
 *   node scripts/market-domination-map.mjs
 *   node scripts/market-domination-map.mjs --dry-run   # skip Supabase, use zeros
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseOptions(argv) {
  const opts = { dryRun: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

async function fetchPlatformCounts(supabaseUrl, supabaseKey) {
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  async function count(table) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/${table}?select=id`,
        { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } }
      );
      const raw = res.headers.get("content-range") || "";
      const total = raw.split("/")[1];
      return total ? parseInt(total, 10) : 0;
    } catch {
      return 0;
    }
  }

  const [users, resumes, trackedJobs, coverLetters, conversations] = await Promise.all([
    count("profiles"),
    count("resumes"),
    count("tracked_jobs"),
    count("cover_letters"),
    count("conversations"),
  ]);

  return { users, resumes, trackedJobs, coverLetters, conversations };
}

function renderKpiBoard(counts, generatedAt, dryRun) {
  const na = dryRun ? "n/a (dry-run)" : "—";

  const lines = [
    "# ResumePreps — Market Domination KPI Board",
    "",
    `Generated: ${generatedAt}`,
    dryRun ? "> ⚠️  Dry-run mode — Supabase counts not fetched." : "",
    "",
    "## Platform Snapshot (live)",
    `| Metric          | Count |`,
    `|-----------------|-------|`,
    `| Users           | ${counts.users ?? na} |`,
    `| Resumes         | ${counts.resumes ?? na} |`,
    `| Tracked Jobs    | ${counts.trackedJobs ?? na} |`,
    `| Cover Letters   | ${counts.coverLetters ?? na} |`,
    `| Conversations   | ${counts.conversations ?? na} |`,
    "",
    "## Acquisition KPIs",
    "| KPI | 90-Day Target | Validation |",
    "|-----|--------------|------------|",
    "| Weekly new signups | 500 / week | Supabase `profiles` |",
    "| Organic sessions | +100% | Vercel / GA analytics |",
    "| Referral signups | 200 / week | Referral tracking param |",
    "| Social-driven signups | 150 / week | UTM attribution |",
    "",
    "## Activation KPIs",
    "| KPI | Target | Validation |",
    "|-----|--------|------------|",
    "| Time-to-first-resume | < 3 min | `resume_created` event |",
    "| Signup → resume created | ≥ 40% | Funnel analysis |",
    "| Signup → ATS check | ≥ 25% | Funnel analysis |",
    "| Signup → cover letter | ≥ 20% | Funnel analysis |",
    "",
    "## Retention KPIs",
    "| KPI | Target | Validation |",
    "|-----|--------|------------|",
    "| D7 retention | ≥ 30% | Cohort analysis |",
    "| D30 retention | ≥ 20% | Cohort analysis |",
    "| WAU growth | +20% WoW | Session events |",
    "",
    "## Revenue KPIs",
    "| KPI | Target | Validation |",
    "|-----|--------|------------|",
    "| MRR growth | +15% MoM | Stripe |",
    "| Free → paid conversion | ≥ 4% | Stripe |",
    "| ARPU | ≥ $12 / mo | MRR / paying users |",
    "",
    "## Product Quality KPIs",
    "| KPI | Target | Validation |",
    "|-----|--------|------------|",
    "| ATS pass rate | ≥ 70% resumes score ≥ 80 | In-app ATS event |",
    "| NPS | ≥ 45 | In-app monthly survey |",
    "| Error rate | < 0.5% | Sentry / logs |",
    "| Interview Readiness usage | 30% of resume creators | `interview_readiness_viewed` event |",
    "",
    "---",
    "See full strategy: MARKET_DOMINATION_MAP.md",
  ].filter((l) => l !== null);

  return lines.join("\n");
}

async function main() {
  const opts = parseOptions(process.argv);
  const now = new Date();
  const generatedAt = now.toISOString();

  let counts = { users: 0, resumes: 0, trackedJobs: 0, coverLetters: 0, conversations: 0 };

  if (!opts.dryRun) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    if (supabaseUrl && supabaseKey) {
      counts = await fetchPlatformCounts(supabaseUrl, supabaseKey);
    } else {
      console.warn("Warning: SUPABASE_URL / SUPABASE_ANON_KEY not set — platform counts will be 0.");
    }
  }

  const report = renderKpiBoard(counts, generatedAt, opts.dryRun);

  const outDir = path.join(repoRoot, ".openclaw", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const timestamp = now.toISOString().replace(/[.:]/g, "-");
  const outFile = path.join(outDir, `market-domination-kpi-${timestamp}.md`);
  fs.writeFileSync(outFile, report, "utf8");

  console.log(report);
  console.log(`\nReport written: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

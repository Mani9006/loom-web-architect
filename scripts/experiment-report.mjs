#!/usr/bin/env node
/**
 * experiment-report.mjs
 * CLI script: generate a performance summary for all experiments.
 *
 * Usage:
 *   node scripts/experiment-report.mjs [--experiment <id>] [--days <n>]
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseOptions(argv) {
  const opts = { experimentId: null, days: 30 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--experiment" && argv[i + 1]) opts.experimentId = argv[++i];
    if (argv[i] === "--days" && argv[i + 1]) opts.days = parseInt(argv[++i], 10);
  }
  return opts;
}

const opts = parseOptions(process.argv);

// ── Supabase client ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.\n" +
    "Copy supabase/.env.example or set them in your environment."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wilson score confidence interval lower-bound – a standard metric
 * for ranking variants with small sample sizes.
 * @param {number} successes
 * @param {number} trials
 * @param {number} z  – z-score for confidence level (1.96 = 95%)
 */
function wilsonLow(successes, trials, z = 1.96) {
  if (trials === 0) return 0;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  return (centre - spread) / denom;
}

/**
 * Very simple two-proportion z-test (no continuity correction).
 * Returns p-value (two-tailed).
 */
function zTestPValue(p1, n1, p2, n2) {
  if (n1 === 0 || n2 === 0) return 1;
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = Math.abs(p1 - p2) / se;
  // Approximate p-value using complementary error function
  const erfc = (x) => {
    const t = 1 / (1 + 0.3275911 * x);
    const poly =
      t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
  };
  return erfc(z / Math.sqrt(2));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString();

  // Fetch experiments
  let expQuery = supabase.from("experiments").select("id, name, status, variants, started_at");
  if (opts.experimentId) expQuery = expQuery.eq("id", opts.experimentId);
  const { data: experiments, error: expErr } = await expQuery;
  if (expErr) throw expErr;

  if (!experiments || experiments.length === 0) {
    console.log("No experiments found.");
    return;
  }

  const lines = [
    "# Experiment Performance Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Window: last ${opts.days} days (since ${since})`,
    "",
  ];

  for (const exp of experiments) {
    lines.push(`## ${exp.id} — ${exp.name}`);
    lines.push(`Status: ${exp.status} | Started: ${exp.started_at ?? "not started"}`);
    lines.push("");

    // Fetch assignments
    const { data: assignments } = await supabase
      .from("experiment_assignments")
      .select("variant, user_id")
      .eq("experiment_id", exp.id)
      .gte("assigned_at", since);

    // Fetch events
    const { data: events } = await supabase
      .from("experiment_events")
      .select("variant, event_name, user_id")
      .eq("experiment_id", exp.id)
      .gte("occurred_at", since);

    const variantList = Array.isArray(exp.variants) ? exp.variants : ["control", "treatment"];
    const stats = variantList.map((v) => {
      const enrolled = (assignments ?? []).filter((a) => a.variant === v);
      const allEvents = (events ?? []).filter((e) => e.variant === v);
      const uniqueConverters = new Set(
        allEvents.filter((e) => e.event_name === "paid_convert").map((e) => e.user_id)
      ).size;
      const uniqueActivated = new Set(
        allEvents.filter((e) => e.event_name === "onboarding_complete").map((e) => e.user_id)
      ).size;
      const n = enrolled.length;
      return { variant: v, n, uniqueConverters, uniqueActivated };
    });

    // Table header
    lines.push("| Variant | Enrolled | Activated | Activation% | Conversions | Conv% |");
    lines.push("|---------|----------|-----------|-------------|-------------|-------|");
    for (const s of stats) {
      const actPct = s.n > 0 ? ((s.uniqueActivated / s.n) * 100).toFixed(1) : "—";
      const convPct = s.n > 0 ? ((s.uniqueConverters / s.n) * 100).toFixed(1) : "—";
      lines.push(
        `| ${s.variant} | ${s.n} | ${s.uniqueActivated} | ${actPct}% | ${s.uniqueConverters} | ${convPct}% |`
      );
    }
    lines.push("");

    // Statistical significance between control and treatment (if both present)
    const ctrl = stats.find((s) => s.variant === "control");
    const treat = stats.find((s) => s.variant === "treatment");
    if (ctrl && treat && ctrl.n > 0 && treat.n > 0) {
      const pConv = zTestPValue(
        ctrl.uniqueConverters / ctrl.n,
        ctrl.n,
        treat.uniqueConverters / treat.n,
        treat.n
      );
      const wilsonCtrl = wilsonLow(ctrl.uniqueConverters, ctrl.n);
      const wilsonTreat = wilsonLow(treat.uniqueConverters, treat.n);
      const significant = pConv < 0.05 ? "✅ Significant (p<0.05)" : "⏳ Not yet significant";
      const lift =
        ctrl.uniqueConverters > 0
          ? (((treat.uniqueConverters / treat.n - ctrl.uniqueConverters / ctrl.n) /
              (ctrl.uniqueConverters / ctrl.n)) * 100).toFixed(1) + "% relative lift"
          : "—";
      lines.push(`**Significance (conversion):** ${significant} | p=${pConv.toFixed(3)}`);
      lines.push(`**Relative lift:** ${lift}`);
      lines.push(`**Wilson CI lower bound:** control=${wilsonCtrl.toFixed(4)}, treatment=${wilsonTreat.toFixed(4)}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const report = lines.join("\n");
  const outDir = path.join(process.cwd(), ".reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `experiment-report-${new Date().toISOString().replace(/[.:]/g, "-")}.md`
  );
  fs.writeFileSync(outFile, report, "utf8");

  console.log(report);
  console.log(`\nReport saved: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

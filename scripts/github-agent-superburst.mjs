#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, ".openclaw", "reports");
const STATE_FILE = path.join(REPORT_DIR, "github-agent-superburst-state.json");

const INITIATIVES = [
  {
    id: "growth-experiment-fabric",
    title: "Build Growth Experiment Fabric for ResumePreps",
    customAgent: "growth_autopilot",
    prompt: [
      "Design and implement a growth experiment operating system for resumepreps.com.",
      "Deliverables:",
      "1) Top 10 funnel hypotheses (acquisition -> activation -> paid conversion).",
      "2) Experiment backlog with impact/effort scores and owner model.",
      "3) Instrumentation plan tied to Supabase + Vercel analytics.",
      "4) 30-day sprint plan with weekly KPI targets.",
      "Success metrics: activation uplift, conversion uplift, retention delta.",
    ].join("\n"),
  },
  {
    id: "enterprise-readiness-blueprint",
    title: "Create Enterprise Readiness Blueprint",
    customAgent: "enterprise_architect",
    prompt: [
      "Build an enterprise expansion blueprint for ResumePreps.",
      "Deliverables:",
      "1) Phased plan for SSO, RBAC, audit logs, tenant controls, admin portal.",
      "2) Security/compliance control map and gap analysis.",
      "3) Implementation sequence with technical architecture impacts.",
      "4) Pricing/packaging implications for enterprise deals.",
      "Success metrics: enterprise deal readiness score and implementation ETA.",
    ].join("\n"),
  },
  {
    id: "market-domination-map",
    title: "Produce Market Domination Positioning Map",
    customAgent: "market_intelligence",
    prompt: [
      "Build a competitive strategy map that can move ResumePreps to top-tier positioning.",
      "Deliverables:",
      "1) Competitor matrix (features, pricing, moat, GTM channels).",
      "2) Strategic wedges where ResumePreps can decisively win.",
      "3) 90-day action plan linking product, messaging, and growth plays.",
      "4) KPI board for weekly strategy review.",
      "Success metrics: measurable differentiation and growth impact projections.",
    ].join("\n"),
  },
  {
    id: "automation-fabric-rollout",
    title: "Build Autonomous Operations Fabric (Jira/Slack/GitHub/n8n/make)",
    customAgent: "automation_fabric",
    prompt: [
      "Design and implement an automation fabric for company operations.",
      "Deliverables:",
      "1) Event-driven workflow map across Jira, GitHub, Slack, Supabase.",
      "2) n8n/make integration plan with retries, dead-letter handling, alerts.",
      "3) Governance policy for autonomous actions and human approvals.",
      "4) Runbook and reliability SLOs.",
      "Success metrics: manual ops hours reduced and workflow failure rate.",
    ].join("\n"),
  },
  {
    id: "customer-success-engine",
    title: "Create Customer Success Engine for Retention",
    customAgent: "customer_success",
    prompt: [
      "Build a scalable customer success operating model for ResumePreps.",
      "Deliverables:",
      "1) Onboarding journey redesign for first 7 days.",
      "2) High-risk churn detection signals and intervention playbooks.",
      "3) Support automation blueprint with quality gates.",
      "4) Feedback loop from customer pain points to product backlog.",
      "Success metrics: activation improvement, retention lift, support resolution speed.",
    ].join("\n"),
  },
  {
    id: "revenue-ops-system",
    title: "Design Revenue Ops and Pricing Execution System",
    customAgent: "revenue_ops",
    prompt: [
      "Design a revenue operations system to scale monetization with strong unit economics.",
      "Deliverables:",
      "1) Pricing/packaging experiment portfolio.",
      "2) Revenue funnel instrumentation and dashboard spec.",
      "3) Decision framework for CAC/LTV/payback optimization.",
      "4) Monthly operating cadence for revenue experiments.",
      "Success metrics: conversion lift, ARPU trends, and unit economics improvement.",
    ].join("\n"),
  },
];

const USAGE = `Usage:
  node scripts/github-agent-superburst.mjs [--dry-run] [--repo owner/repo]
    [--base branch] [--max 3] [--force] [--ids id1,id2]

Examples:
  node scripts/github-agent-superburst.mjs --dry-run
  node scripts/github-agent-superburst.mjs --max 3 --base codex/release-ticket-deploy
`;

function parseOptions(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function detectDefaultBase() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "main";
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function runGhAgentTaskCreate({ repo, base, agentName, description, dryRun }) {
  const args = ["agent-task", "create", description, "--repo", repo, "--base", base];
  if (agentName) {
    args.push("--custom-agent", agentName);
  }

  if (dryRun) {
    return Promise.resolve({ code: 0, stdout: `[dry-run] gh ${args.join(" ")}`, stderr: "" });
  }

  return new Promise((resolve) => {
    const child = spawn("gh", args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });

    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` });
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function buildDescription(initiative) {
  return [
    `ResumePreps Strategic Initiative: ${initiative.id}`,
    `Title: ${initiative.title}`,
    "",
    initiative.prompt,
    "",
    "Execution expectations:",
    "1) Produce implementation-ready plan with milestones.",
    "2) Make practical code/config/docs updates where relevant.",
    "3) Open or update PR with concrete artifacts.",
    "4) Include measurable KPI targets and validation method.",
  ].join("\n");
}

function reportPath() {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  return path.join(REPORT_DIR, `github-agent-superburst-${stamp}.md`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.h || options["--help"]) {
    console.log(USAGE);
    return;
  }

  const dryRun = Boolean(options["dry-run"]);
  const repo = String(options.repo || process.env.GITHUB_AGENT_REPO || "Mani9006/loom-web-architect");
  const base = String(options.base || process.env.GITHUB_AGENT_BASE || detectDefaultBase());
  const maxLaunch = Math.max(1, Number(options.max || process.env.GITHUB_AGENT_SUPERBURST_MAX || 3));
  const force = Boolean(options.force);
  const onlyIds = normalizeCsvSet(options.ids || process.env.GITHUB_AGENT_SUPERBURST_IDS || "");

  const state = readJson(STATE_FILE, { initiatives: {} });
  const candidatePool = INITIATIVES.filter((initiative) => {
    if (onlyIds.size > 0 && !onlyIds.has(initiative.id)) return false;
    const prev = state.initiatives?.[initiative.id];
    if (!force && prev && prev.mode === "live" && prev.result === "created") return false;
    return true;
  });
  const candidates = candidatePool.slice(0, maxLaunch);

  const actions = [];
  const errors = [];
  const nextState = { ...(state.initiatives || {}) };

  for (const initiative of candidates) {
    const description = buildDescription(initiative);
    let result = await runGhAgentTaskCreate({
      repo,
      base,
      agentName: initiative.customAgent,
      description,
      dryRun,
    });
    let usedCustomAgent = true;

    if (
      !dryRun &&
      result.code !== 0 &&
      /custom agent not found/i.test(`${result.stdout}\n${result.stderr}`)
    ) {
      result = await runGhAgentTaskCreate({
        repo,
        base,
        agentName: "",
        description,
        dryRun,
      });
      usedCustomAgent = false;
    }

    const ok = result.code === 0;
    const modeLabel = usedCustomAgent ? initiative.customAgent : `${initiative.customAgent} (fallback: default)`;
    actions.push(`- ${initiative.id}: ${modeLabel} -> ${ok ? "created" : `failed (${result.code})`}`);

    if (!ok) {
      errors.push(`${initiative.id}: ${result.stderr.trim() || "gh agent-task create failed"}`);
    }

    if (!dryRun) {
      nextState[initiative.id] = {
        title: initiative.title,
        customAgent: initiative.customAgent,
        usedCustomAgent,
        launchedAt: new Date().toISOString(),
        mode: "live",
        result: ok ? "created" : "failed",
        output: result.stdout.trim().slice(0, 1600),
      };
    }
  }

  if (!dryRun) {
    writeJson(STATE_FILE, { initiatives: nextState, lastRunAt: new Date().toISOString() });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = reportPath();
  const report = [
    "# GitHub Agent Superburst Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Dry run: ${dryRun ? "yes" : "no"}`,
    `Repo: ${repo}`,
    `Base: ${base}`,
    `Max launch: ${maxLaunch}`,
    "",
    "## Candidate Summary",
    `- Candidate initiatives: ${candidatePool.length}`,
    `- Launched this run: ${candidates.length}`,
    "",
    "## Actions",
    ...(actions.length ? actions : ["- No initiatives launched."]),
    "",
    "## Errors",
    ...(errors.length ? errors.map((e) => `- ${e}`) : ["- None."]),
    "",
  ].join("\n");
  fs.writeFileSync(file, `${report}\n`, "utf8");

  console.log(`GitHub agent superburst report: ${file}`);
  console.log(`Launched: ${candidates.length} | Errors: ${errors.length} | Dry-run: ${dryRun ? "yes" : "no"}`);
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

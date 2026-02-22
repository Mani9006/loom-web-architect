#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, ".openclaw", "reports");
const STATE_FILE = path.join(REPORT_DIR, "github-agent-dispatch-state.json");
const OWNER_SOURCE_DEFAULT = "HARDENING_SPRINT_OPS.md";
const JIRA_HELPER_DEFAULT = "/Users/maany/.openclaw/bin/jira";

const OWNER_ALIAS_TO_AGENT = {
  atlas: "orchestrator",
  anu: "orchestrator",
  forge: "backend_api",
  pixel: "frontend_ui",
  sentinel: "devops_release",
  prism: "qa_automation",
  scout: "orchestrator",
  lens: "performance_optimizer",
  spark: "resume_domain",
};

const USAGE = `Usage:
  node scripts/github-agent-dispatch.mjs [--dry-run] [--project KAN] [--max 3]
    [--repo Mani9006/loom-web-architect] [--base main]
    [--owner-source HARDENING_SPRINT_OPS.md] [--force]
    [--include-operations] [--exempt-keys KAN-10]

Examples:
  node scripts/github-agent-dispatch.mjs --dry-run
  node scripts/github-agent-dispatch.mjs --max 1 --base codex/release-ticket-deploy
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

function readFromHelper(helperPath, key) {
  try {
    const raw = fs.readFileSync(helperPath, "utf8");
    const pattern = new RegExp(`^${key}="(.*)"$`, "m");
    const match = raw.match(pattern);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function loadJiraConfig(options) {
  const helperPath = String(options["jira-helper"] || process.env.JIRA_HELPER || JIRA_HELPER_DEFAULT);
  const url = String(process.env.JIRA_URL || readFromHelper(helperPath, "JIRA_URL")).trim();
  const user = String(process.env.JIRA_USER || readFromHelper(helperPath, "JIRA_USER")).trim();
  const token = String(process.env.JIRA_TOKEN || readFromHelper(helperPath, "JIRA_TOKEN")).trim();
  if (!url || !user || !token) {
    throw new Error(
      `Missing Jira credentials. Set JIRA_URL/JIRA_USER/JIRA_TOKEN or ensure ${helperPath} contains them.`,
    );
  }
  return { url, user, token };
}

function authHeader(user, token) {
  return `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
}

async function jiraRequest(jira, method, endpoint) {
  const res = await fetch(`${jira.url}/rest/api/3${endpoint}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(jira.user, jira.token),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!text) return {};
  return JSON.parse(text);
}

async function fetchOpenIssues(jira, projectKey) {
  const issues = [];
  let startAt = 0;
  const maxResults = 50;
  const fields = "summary,status,labels,description,updated,comment,parent,issuetype";

  while (true) {
    const jql = encodeURIComponent(`project = ${projectKey} AND status != Done ORDER BY updated DESC`);
    const endpoint = `/search/jql?jql=${jql}&maxResults=${maxResults}&startAt=${startAt}&fields=${fields}`;
    const data = await jiraRequest(jira, "GET", endpoint);
    issues.push(...(data.issues || []));
    const total = Number(data.total || 0);
    startAt += maxResults;
    if (issues.length >= total || (data.issues || []).length === 0) break;
  }
  return issues;
}

function extractTextNode(node) {
  if (!node || typeof node !== "object") return "";
  let out = "";
  if (node.type === "text" && typeof node.text === "string") out += node.text;
  if (Array.isArray(node.content)) {
    for (const child of node.content) out += extractTextNode(child);
  }
  return out;
}

function issueDescription(issue) {
  return extractTextNode(issue?.fields?.description || {}).trim();
}

function issueLastComment(issue) {
  const comments = issue?.fields?.comment?.comments || [];
  if (comments.length === 0) return "";
  return extractTextNode(comments[comments.length - 1]?.body || {}).trim();
}

function parseOwnerMap(ownerFilePath) {
  const ownerByTicket = new Map();
  const raw = fs.existsSync(ownerFilePath) ? fs.readFileSync(ownerFilePath, "utf8") : "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("| KAN-")) continue;
    const parts = line.split("|").map((item) => item.trim());
    if (parts.length < 5) continue;
    const key = parts[1];
    const ownerAlias = parts[3].toLowerCase();
    if (!/^KAN-\d+$/.test(key)) continue;
    if (!/^[a-z0-9_-]+$/.test(ownerAlias)) continue;
    ownerByTicket.set(key, ownerAlias);
  }
  return ownerByTicket;
}

function loadAliasOverrides() {
  const raw = String(process.env.ATLAS_AGENT_ALIAS_MAP || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function keyOf(issue) {
  return String(issue?.key || "").trim();
}

function statusOf(issue) {
  return String(issue?.fields?.status?.name || "").trim();
}

function statusLower(issue) {
  return statusOf(issue).toLowerCase();
}

function issueTypeLower(issue) {
  return String(issue?.fields?.issuetype?.name || "").trim().toLowerCase();
}

function labelsLower(issue) {
  return (issue?.fields?.labels || []).map((item) => String(item).toLowerCase());
}

function shouldDispatch(issue) {
  const lower = statusLower(issue);
  return lower.includes("to do") || lower.includes("in progress") || lower.includes("review");
}

function shouldSkip(issue, opts) {
  const key = keyOf(issue);
  if (opts.exemptKeys.has(key)) return true;
  if (issueTypeLower(issue) === "epic") return true;
  if (!opts.includeOperations && labelsLower(issue).includes("operations")) return true;
  return false;
}

function resolveAgent(issue, ownerByTicket, aliasMap) {
  const key = keyOf(issue);
  const labels = labelsLower(issue);
  const alias = ownerByTicket.get(key);
  if (alias && aliasMap[alias]) return aliasMap[alias];
  for (const label of labels) {
    if (aliasMap[label]) return aliasMap[label];
  }
  return "orchestrator";
}

function buildTaskDescription(issue) {
  const key = keyOf(issue);
  const summary = String(issue?.fields?.summary || "").trim();
  const status = statusOf(issue);
  const labels = (issue?.fields?.labels || []).join(", ") || "none";
  const parent = issue?.fields?.parent?.key || "none";
  const desc = issueDescription(issue).slice(0, 1500) || "No description provided.";
  const lastComment = issueLastComment(issue).slice(0, 1200) || "No comments yet.";

  return [
    `ResumePreps Jira Ticket: ${key}`,
    `Summary: ${summary}`,
    `Status: ${status}`,
    `Labels: ${labels}`,
    `Parent: ${parent}`,
    "",
    "Task requirements:",
    "1) Implement ticket changes in this repository.",
    "2) Run relevant validation commands and include evidence.",
    "3) Commit changes with ticket reference.",
    "4) Open/update PR with concise technical summary.",
    "5) Add Jira comment containing PR/commit/test evidence.",
    "",
    "Description context:",
    desc,
    "",
    "Latest Jira comment context:",
    lastComment,
  ].join("\n");
}

function runGhAgentTaskCreate({ repo, base, agentName, description, dryRun }) {
  const args = ["agent-task", "create", description, "--repo", repo, "--base", base, "--custom-agent", agentName];
  if (dryRun) {
    return Promise.resolve({ code: 0, stdout: `[dry-run] gh ${args.join(" ")}`, stderr: "" });
  }

  return new Promise((resolve) => {
    const child = spawn("gh", args, { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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

function detectDefaultBase() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "main";
  }
}

function reportPath() {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  return path.join(REPORT_DIR, `github-agent-dispatch-${stamp}.md`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.h || options["--help"]) {
    console.log(USAGE);
    return;
  }

  const dryRun = Boolean(options["dry-run"]);
  const project = String(options.project || process.env.PROJECT_KEY || "KAN");
  const repo = String(options.repo || process.env.GITHUB_AGENT_REPO || "Mani9006/loom-web-architect");
  const base = String(options.base || process.env.GITHUB_AGENT_BASE || detectDefaultBase());
  const maxDispatch = Math.max(1, Number(options.max || process.env.GITHUB_AGENT_DISPATCH_MAX || 3));
  const ownerSource = path.resolve(ROOT, String(options["owner-source"] || OWNER_SOURCE_DEFAULT));
  const force = Boolean(options.force);
  const includeOperations = Boolean(options["include-operations"]);
  const exemptKeys = normalizeCsvSet(options["exempt-keys"] || process.env.GITHUB_AGENT_EXEMPT_KEYS || "KAN-10,KAN-22");

  const jira = loadJiraConfig(options);
  const ownerByTicket = parseOwnerMap(ownerSource);
  const aliasMap = { ...OWNER_ALIAS_TO_AGENT, ...loadAliasOverrides() };
  const state = readJson(STATE_FILE, { issues: {} });
  const issues = await fetchOpenIssues(jira, project);

  const candidates = [];
  for (const issue of issues) {
    if (!shouldDispatch(issue)) continue;
    if (shouldSkip(issue, { exemptKeys, includeOperations })) continue;
    const key = keyOf(issue);
    const updated = String(issue?.fields?.updated || "");
    const prev = state.issues?.[key];
    if (!force && prev && prev.updated === updated && prev.mode === "live") continue;
    candidates.push(issue);
    if (candidates.length >= maxDispatch) break;
  }

  const actions = [];
  const errors = [];
  const updatedState = { ...(state.issues || {}) };

  for (const issue of candidates) {
    const key = keyOf(issue);
    const customAgent = resolveAgent(issue, ownerByTicket, aliasMap);
    const description = buildTaskDescription(issue);
    const result = await runGhAgentTaskCreate({
      repo,
      base,
      agentName: customAgent,
      description,
      dryRun,
    });

    const ok = result.code === 0;
    actions.push(`- ${key}: ${customAgent} -> ${ok ? "created" : `failed (${result.code})`}`);
    if (!ok) {
      errors.push(`${key}: ${result.stderr.trim() || "gh agent-task create failed"}`);
    }

    if (!dryRun) {
      updatedState[key] = {
        updated: String(issue?.fields?.updated || ""),
        customAgent,
        dispatchedAt: new Date().toISOString(),
        status: statusOf(issue),
        mode: "live",
        output: result.stdout.trim().slice(0, 1200),
      };
    }
  }

  if (!dryRun) {
    writeJson(STATE_FILE, { issues: updatedState, lastRunAt: new Date().toISOString() });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = reportPath();
  const report = [
    "# GitHub Agent Dispatch Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Dry run: ${dryRun ? "yes" : "no"}`,
    `Project: ${project}`,
    `Repo: ${repo}`,
    `Base: ${base}`,
    `Max dispatch: ${maxDispatch}`,
    "",
    "## Candidate Summary",
    `- Open Jira issues: ${issues.length}`,
    `- Dispatched: ${candidates.length}`,
    "",
    "## Actions",
    ...(actions.length ? actions : ["- No tasks dispatched."]),
    "",
    "## Errors",
    ...(errors.length ? errors.map((e) => `- ${e}`) : ["- None."]),
    "",
  ].join("\n");
  fs.writeFileSync(file, `${report}\n`, "utf8");

  console.log(`GitHub agent dispatch report: ${file}`);
  console.log(`Dispatched: ${candidates.length} | Errors: ${errors.length} | Dry-run: ${dryRun ? "yes" : "no"}`);
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

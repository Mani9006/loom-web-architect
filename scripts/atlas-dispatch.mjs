#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, ".reports");
const AGENTS_FILE = path.join(ROOT, ".github", "agents.json");
const DEFAULT_OWNER_SOURCE = "HARDENING_SPRINT_OPS.md";
const STATE_FILE = path.join(REPORT_DIR, "atlas-dispatch-state.json");
const JIRA_HELPER_DEFAULT = "";

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
  node scripts/atlas-dispatch.mjs [--dry-run] [--project KAN] [--max 9]
    [--owner-source HARDENING_SPRINT_OPS.md] [--force]
    [--include-operations] [--provider auto|openai|anthropic]
    [--model MODEL] [--exempt-keys KAN-10]
    [--timeout-seconds 900] [--kill-delay-ms 5000]
    [--codex-sandbox danger-full-access] [--codex-approval never]

Examples:
  node scripts/atlas-dispatch.mjs --dry-run
  node scripts/atlas-dispatch.mjs --project KAN --max 6
  node scripts/atlas-dispatch.mjs --timeout-seconds 1800 --kill-delay-ms 8000
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

async function jiraRequest(jira, method, endpoint, body = null) {
  const res = await fetch(`${jira.url}/rest/api/3${endpoint}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(jira.user, jira.token),
    },
    body: body ? JSON.stringify(body) : undefined,
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

function descriptionText(issue) {
  return extractTextNode(issue?.fields?.description || {}).trim();
}

function lastCommentText(issue) {
  const comments = issue?.fields?.comment?.comments || [];
  if (comments.length === 0) return "";
  const last = comments[comments.length - 1];
  return extractTextNode(last.body || {}).trim();
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

function loadAliasMapFromEnv() {
  const raw = String(process.env.ATLAS_AGENT_ALIAS_MAP || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
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
  return (issue?.fields?.labels || []).map((value) => String(value).toLowerCase());
}

function normalizeCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function buildPrompt(issue) {
  const key = keyOf(issue);
  const summary = String(issue?.fields?.summary || "").trim();
  const status = statusOf(issue);
  const labels = (issue?.fields?.labels || []).join(", ") || "none";
  const parent = issue?.fields?.parent?.key ? `${issue.fields.parent.key}` : "none";
  const details = descriptionText(issue).slice(0, 800) || "No description provided.";
  const lastComment = lastCommentText(issue).slice(0, 800) || "No comments yet.";

  return [
    `Ticket: ${key}`,
    `Status: ${status}`,
    `Summary: ${summary}`,
    `Labels: ${labels}`,
    `Parent: ${parent}`,
    "",
    "Description:",
    details,
    "",
    "Latest comment context:",
    lastComment,
    "",
    "Execution requirements:",
    "1) Implement the ticket in this repository with production-safe changes.",
    "2) Run local validation for touched areas.",
    "3) Commit changes with a clear message referencing the ticket.",
    "4) Add a Jira comment with implementation summary, commit hash, and validation evidence.",
    "5) If blocked, add a clear blocker comment in Jira with exact dependency.",
  ].join("\n");
}

function reportFilePath() {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  return path.join(REPORT_DIR, `atlas-dispatch-${stamp}.md`);
}

async function runCommand(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd || ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutId = null;

    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });

    const timeoutMs = Number(options.timeoutMs || 0);
    const killDelayMs = Math.max(1000, Number(options.killDelayMs || 5000));
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
        setTimeout(() => {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }, killDelayMs).unref();
      }, timeoutMs);
    }

    child.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` });
    });
    child.on("exit", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) {
        const timeoutNote = `Command timed out after ${Math.round(timeoutMs / 1000)}s and was terminated.`;
        resolve({ code: 124, stdout, stderr: `${stderr}\n${timeoutNote}`.trim() });
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function addJiraComment(jira, key, message) {
  await jiraRequest(jira, "POST", `/issue/${key}/comment`, {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: message }],
        },
      ],
    },
  });
}

function shouldSkipIssue(issue, opts) {
  const key = keyOf(issue);
  if (opts.exemptKeys.has(key)) return true;
  if (issueTypeLower(issue) === "epic") return true;
  if (!opts.includeOperations && labelsLower(issue).includes("operations")) return true;
  return false;
}

function shouldDispatchIssue(issue) {
  const lower = statusLower(issue);
  return lower.includes("to do") || lower.includes("in progress") || lower.includes("review");
}

function resolveAgentId(issue, ownerByTicket, agentSet, aliasMap) {
  const key = keyOf(issue);
  const labels = labelsLower(issue);

  const alias = ownerByTicket.get(key);
  if (alias) {
    const mapped = aliasMap[alias] || alias;
    if (agentSet.has(mapped)) return mapped;
  }

  for (const label of labels) {
    const mapped = aliasMap[label] || label;
    if (agentSet.has(mapped)) return mapped;
  }

  return "orchestrator";
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.h || options["--help"]) {
    console.log(USAGE);
    return;
  }

  const dryRun = Boolean(options["dry-run"]);
  const project = String(options.project || process.env.PROJECT_KEY || "KAN");
  const maxDispatch = Math.max(1, Number(options.max || process.env.ATLAS_DISPATCH_MAX || 9));
  const ownerSource = path.resolve(ROOT, String(options["owner-source"] || DEFAULT_OWNER_SOURCE));
  const force = Boolean(options.force);
  const includeOperations = Boolean(options["include-operations"]);
  const provider = String(options.provider || "auto");
  const model = String(options.model || "").trim();
  const timeoutSeconds = Math.max(30, Number(options["timeout-seconds"] || process.env.ATLAS_DISPATCH_TIMEOUT_SECONDS || 900));
  const killDelayMs = Math.max(1000, Number(options["kill-delay-ms"] || process.env.ATLAS_DISPATCH_KILL_DELAY_MS || 5000));
  const codexSandbox = String(options["codex-sandbox"] || process.env.OPENCLAW_CODEX_SANDBOX || "danger-full-access").trim();
  const codexApproval = String(options["codex-approval"] || process.env.OPENCLAW_CODEX_APPROVAL || "never").trim();
  const exemptKeys = normalizeCsvSet(options["exempt-keys"] || process.env.ATLAS_EXEMPT_KEYS || "KAN-10");
  const aliasOverrides = loadAliasMapFromEnv();
  const aliasMap = { ...OWNER_ALIAS_TO_AGENT, ...aliasOverrides };

  const jira = loadJiraConfig(options);
  const agentsConfig = readJson(AGENTS_FILE, { agents: [] });
  const agentSet = new Set((agentsConfig.agents || []).map((agent) => String(agent.id || "").trim()).filter(Boolean));
  if (agentSet.size === 0) {
    throw new Error(`No agents available in ${AGENTS_FILE}`);
  }

  const ownerByTicket = parseOwnerMap(ownerSource);
  const state = readJson(STATE_FILE, { issues: {} });
  const issues = await fetchOpenIssues(jira, project);

  const candidates = [];
  for (const issue of issues) {
    if (!shouldDispatchIssue(issue)) continue;
    if (shouldSkipIssue(issue, { exemptKeys, includeOperations })) continue;

    const key = keyOf(issue);
    const updated = String(issue?.fields?.updated || "");
    const previous = state.issues?.[key];
    if (!force && previous && previous.updated === updated && previous.mode === "live") continue;

    candidates.push(issue);
    if (candidates.length >= maxDispatch) break;
  }

  const actions = [];
  const errors = [];
  const updatedState = { ...(state.issues || {}) };

  for (const issue of candidates) {
    const key = keyOf(issue);
    const agentId = resolveAgentId(issue, ownerByTicket, agentSet, aliasMap);
    const prompt = buildPrompt(issue);
    const commandArgs = ["scripts/openclaw-agent-runner.mjs", "run", "--agent", agentId, "--task", prompt, "--provider", provider];
    if (model) {
      commandArgs.push("--model", model);
    }
    if (codexSandbox) {
      commandArgs.push("--codex-sandbox", codexSandbox);
    }
    if (codexApproval) {
      commandArgs.push("--codex-approval", codexApproval);
    }
    if (dryRun) {
      commandArgs.push("--dry-run");
    }

    const result = await runCommand("node", commandArgs, { cwd: ROOT, timeoutMs: timeoutSeconds * 1000, killDelayMs });
    const ok = result.code === 0;
    const statusLine = ok ? "OK" : `FAILED (${result.code})`;
    const output = `${result.stdout}\n${result.stderr}`.trim().slice(0, 2400);
    actions.push(`- ${key}: dispatched to ${agentId} -> ${statusLine}`);
    if (!ok) {
      errors.push(`${key}: dispatch failed for ${agentId}`);
    }

    if (!dryRun) {
      updatedState[key] = {
        updated: String(issue?.fields?.updated || ""),
        agentId,
        dispatchedAt: new Date().toISOString(),
        status: statusOf(issue),
        result: ok ? "ok" : "failed",
        mode: "live",
      };
    }

    if (!dryRun) {
      const comment = ok
        ? `Atlas dispatch: ${agentId} executed for ${key}. Status: ${statusOf(issue)}. Automated run completed; review commit evidence before promotion.`
        : `Atlas dispatch failed for ${key} on agent ${agentId}. Check local report and rerun dispatch.`;
      await addJiraComment(jira, key, comment);
    }

    if (!ok) {
      actions.push(`  Output: ${output || "no output"}`);
    }
  }

  if (!dryRun) {
    writeJson(STATE_FILE, { issues: updatedState, lastRunAt: new Date().toISOString() });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = reportFilePath();
  const reportLines = [
    "# Atlas Dispatch Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Dry run: ${dryRun ? "yes" : "no"}`,
    `Project: ${project}`,
    `Max dispatch: ${maxDispatch}`,
    `Owner source: ${path.relative(ROOT, ownerSource) || ownerSource}`,
    `Timeout: ${timeoutSeconds}s | Kill delay: ${killDelayMs}ms`,
    "",
    "## Candidate Summary",
    `- Open issues fetched: ${issues.length}`,
    `- Dispatched this run: ${candidates.length}`,
    "",
    "## Actions",
    ...(actions.length ? actions : ["- No tickets required dispatch."]),
    "",
    "## Errors",
    ...(errors.length ? errors.map((err) => `- ${err}`) : ["- None."]),
    "",
  ];
  fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf8");

  console.log(`Atlas dispatch report: ${reportPath}`);
  console.log(`Candidates: ${candidates.length} | Errors: ${errors.length} | Dry-run: ${dryRun ? "yes" : "no"}`);
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

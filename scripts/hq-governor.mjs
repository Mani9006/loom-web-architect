#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, ".reports");
const JIRA_HELPER_DEFAULT = "";

const USAGE = `Usage:
  node scripts/hq-governor.mjs [--dry-run] [--project KAN] [--wip-limit 5]
    [--repo owner/repo] [--owner-source HARDENING_SPRINT_OPS.md]
    [--auto-demote] [--exempt-keys KAN-10,KAN-14,KAN-22]

Examples:
  node scripts/hq-governor.mjs --dry-run
  node scripts/hq-governor.mjs --project KAN --wip-limit 5
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

async function fetchIssues(jira, projectKey) {
  const issues = [];
  let startAt = 0;
  const maxResults = 50;
  const fields = "summary,status,labels,comment,updated,issuetype,parent,assignee";

  while (true) {
    const jql = encodeURIComponent(`project = ${projectKey} ORDER BY updated DESC`);
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
  if (node.type === "text" && typeof node.text === "string") {
    out += node.text;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      out += extractTextNode(child);
    }
  }
  return out;
}

function issueCommentText(issue) {
  const comments = issue?.fields?.comment?.comments || [];
  return comments
    .map((comment) => extractTextNode(comment?.body || {}))
    .join("\n")
    .trim();
}

function hasDeploymentEvidence(issue) {
  const text = issueCommentText(issue);
  if (!text) return false;
  const patterns = [
    /\b[0-9a-f]{7,40}\b/i,
    /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/commit\/[0-9a-f]{7,40}/i,
    /\bpr\s*#\d+\b/i,
    /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i,
    /\bvercel\b/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

async function updateLabels(jira, key, labels) {
  await jiraRequest(jira, "PUT", `/issue/${key}`, { fields: { labels } });
}

async function updateAssignee(jira, key, accountId) {
  await jiraRequest(jira, "PUT", `/issue/${key}`, {
    fields: { assignee: { accountId } },
  });
}

async function transitionToStatus(jira, key, targetStatusName) {
  const transitions = await jiraRequest(jira, "GET", `/issue/${key}/transitions`);
  const target = (transitions.transitions || []).find((item) => {
    const toName = String(item?.to?.name || "").toLowerCase();
    return toName === String(targetStatusName).toLowerCase();
  });
  if (!target) return false;
  await jiraRequest(jira, "POST", `/issue/${key}/transitions`, { transition: { id: target.id } });
  return true;
}

async function addComment(jira, key, message) {
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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "hq-governor",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchDeploymentState(repo) {
  const latestMain = await fetchJson(`https://api.github.com/repos/${repo}/commits/main`);
  const sha = latestMain?.sha || "";
  if (!sha) {
    return { state: "unknown", url: "", description: "No main branch commit found", sha: "" };
  }

  const status = await fetchJson(`https://api.github.com/repos/${repo}/commits/${sha}/status`);
  const vercel = (status?.statuses || []).find((entry) => String(entry.context || "").includes("Vercel")) || null;
  return {
    state: String(vercel?.state || status?.state || "unknown").toLowerCase(),
    url: String(vercel?.target_url || ""),
    description: String(vercel?.description || "No deployment signal"),
    sha,
  };
}

function parseOwnerMap(ownerFilePath) {
  const out = new Map();
  const ownerSet = new Set();

  let raw = "";
  try {
    raw = fs.readFileSync(ownerFilePath, "utf8");
  } catch {
    return { ownerByTicket: out, owners: ownerSet };
  }

  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("| KAN-")) continue;
    const parts = line.split("|").map((item) => item.trim());
    if (parts.length < 5) continue;

    const key = parts[1];
    const owner = parts[3].toLowerCase();
    if (!/^KAN-\d+$/.test(key)) continue;
    if (!/^[a-z0-9_-]+$/.test(owner)) continue;

    out.set(key, owner);
    ownerSet.add(owner);
  }

  return { ownerByTicket: out, owners: ownerSet };
}

function toIsoNow() {
  return new Date().toISOString();
}

function loadOwnerAccountMap() {
  const raw = String(process.env.JIRA_OWNER_ACCOUNT_MAP || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

function statusLower(issue) {
  return String(issue?.fields?.status?.name || "").trim().toLowerCase();
}

function isDone(issue) {
  return statusLower(issue) === "done";
}

function isReview(issue) {
  return statusLower(issue).includes("review");
}

function isInProgress(issue) {
  return statusLower(issue).includes("in progress");
}

function keyOf(issue) {
  return String(issue?.key || "").trim();
}

function issueType(issue) {
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

function writeReport(reportLines) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const fileName = `hq-governor-${toIsoNow().replace(/[.:]/g, "-")}.md`;
  const fullPath = path.join(REPORT_DIR, fileName);
  fs.writeFileSync(fullPath, `${reportLines.join("\n")}\n`, "utf8");
  return fullPath;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.h || options["--help"]) {
    console.log(USAGE);
    return;
  }

  const dryRun = Boolean(options["dry-run"]);
  const project = String(options.project || process.env.PROJECT_KEY || "KAN");
  const wipLimit = Number(options["wip-limit"] || process.env.HQ_WIP_LIMIT || 5);
  const ownerSource = path.resolve(ROOT, String(options["owner-source"] || "HARDENING_SPRINT_OPS.md"));
  const githubRepo = String(options.repo || process.env.EXECUTIVE_GITHUB_REPO || "Mani9006/loom-web-architect");
  const autoDemote = Boolean(options["auto-demote"]);
  const wipTargetStatus = String(options["wip-target-status"] || "To Do");
  const exemptKeys = normalizeCsvSet(options["exempt-keys"] || process.env.HQ_WIP_EXEMPT_KEYS || "KAN-10,KAN-14,KAN-22");

  const jira = loadJiraConfig(options);
  const ownerAccountMap = loadOwnerAccountMap();
  const { ownerByTicket, owners } = parseOwnerMap(ownerSource);

  const [issues, deploy] = await Promise.all([
    fetchIssues(jira, project),
    fetchDeploymentState(githubRepo),
  ]);

  const openIssues = issues.filter((issue) => !isDone(issue));
  const inProgress = openIssues.filter(isInProgress);
  const nonExemptInProgress = inProgress.filter((issue) => {
    const key = keyOf(issue);
    if (exemptKeys.has(key)) return false;
    if (issueType(issue) === "epic") return false;
    if (labelsLower(issue).includes("operations")) return false;
    return true;
  });
  const reviewIssues = openIssues.filter(isReview);

  const report = [
    "# HQ Governor Report",
    "",
    `Generated: ${toIsoNow()}`,
    `Dry run: ${dryRun ? "yes" : "no"}`,
    `Project: ${project}`,
    `WIP limit: ${wipLimit}`,
    `Owner source: ${path.relative(ROOT, ownerSource) || ownerSource}`,
    "",
    "## Deployment Gate",
    `- Repo: ${githubRepo}`,
    `- State: ${deploy.state}`,
    `- Commit: ${deploy.sha || "n/a"}`,
    `- URL: ${deploy.url || "n/a"}`,
    `- Detail: ${deploy.description}`,
    "",
    "## Jira Snapshot",
    `- Open issues: ${openIssues.length}`,
    `- In progress: ${inProgress.length}`,
    `- In progress (non-exempt): ${nonExemptInProgress.length}`,
    `- Review: ${reviewIssues.length}`,
    "",
  ];

  const actions = [];
  const warnings = [];
  let gateFailed = false;

  if (nonExemptInProgress.length > wipLimit) {
    gateFailed = true;
    const overflow = nonExemptInProgress.length - wipLimit;
    warnings.push(`WIP limit exceeded by ${overflow} ticket(s).`);

    if (autoDemote) {
      const demoteTargets = [...nonExemptInProgress]
        .sort((a, b) => new Date(a.fields.updated).getTime() - new Date(b.fields.updated).getTime())
        .slice(0, overflow);

      for (const issue of demoteTargets) {
        const key = keyOf(issue);
        if (dryRun) {
          actions.push(`[dry-run] WIP demote ${key} -> ${wipTargetStatus}`);
          continue;
        }
        const moved = await transitionToStatus(jira, key, wipTargetStatus);
        if (moved) {
          await addComment(
            jira,
            key,
            `HQ governor auto-adjusted this ticket to ${wipTargetStatus} to enforce WIP <= ${wipLimit}.`,
          );
          actions.push(`WIP demote ${key} -> ${wipTargetStatus}`);
        } else {
          warnings.push(`Could not find transition ${wipTargetStatus} for ${key}.`);
        }
      }
    } else {
      warnings.push("Auto-demotion disabled. Run with --auto-demote to enforce automatically.");
    }
  }

  for (const issue of openIssues) {
    const key = keyOf(issue);
    const expectedOwner = ownerByTicket.get(key);
    if (!expectedOwner) continue;

    const existingLabels = issue.fields.labels || [];
    const ownerLabelsOnIssue = existingLabels.filter((label) => owners.has(String(label).toLowerCase()));
    const hasCorrectOwner = ownerLabelsOnIssue.some((label) => String(label).toLowerCase() === expectedOwner);
    const hasOnlyOneOwner = ownerLabelsOnIssue.length === 1;

    if (!hasCorrectOwner || !hasOnlyOneOwner) {
      const nextLabels = [
        ...existingLabels.filter((label) => !owners.has(String(label).toLowerCase())),
        expectedOwner,
      ];
      if (dryRun) {
        actions.push(`[dry-run] Owner label correction ${key} -> ${expectedOwner}`);
      } else {
        await updateLabels(jira, key, nextLabels);
        actions.push(`Owner label correction ${key} -> ${expectedOwner}`);
      }
    }

    const expectedAccountId = String(ownerAccountMap[expectedOwner] || "").trim();
    const currentAccountId = String(issue.fields?.assignee?.accountId || "").trim();
    if (expectedAccountId && expectedAccountId !== currentAccountId) {
      if (dryRun) {
        actions.push(`[dry-run] Assignee correction ${key} -> ${expectedOwner} (${expectedAccountId})`);
      } else {
        await updateAssignee(jira, key, expectedAccountId);
        actions.push(`Assignee correction ${key} -> ${expectedOwner}`);
      }
    }
  }

  for (const issue of reviewIssues) {
    const key = keyOf(issue);
    const evidence = hasDeploymentEvidence(issue);
    if (deploy.state !== "success") {
      warnings.push(`Review promotion blocked for ${key}: deploy state is ${deploy.state}.`);
      continue;
    }
    if (!evidence) {
      warnings.push(`Review promotion blocked for ${key}: no commit/PR/deploy evidence in comments.`);
      continue;
    }

    if (dryRun) {
      actions.push(`[dry-run] Promote ${key} Review -> Done`);
      continue;
    }

    const moved = await transitionToStatus(jira, key, "Done");
    if (!moved) {
      warnings.push(`Could not transition ${key} to Done.`);
      continue;
    }

    const deployUrl = deploy.url || "n/a";
    const sha = deploy.sha ? deploy.sha.slice(0, 12) : "n/a";
    await addComment(
      jira,
      key,
      `Auto-promoted to Done by HQ governor after deployment gate passed (main ${sha}, Vercel: ${deploy.state}, ${deployUrl}).`,
    );
    actions.push(`Promote ${key} Review -> Done`);
  }

  report.push("## Actions");
  if (actions.length === 0) {
    report.push("- No actions taken.");
  } else {
    for (const action of actions) report.push(`- ${action}`);
  }
  report.push("");

  report.push("## Warnings");
  if (warnings.length === 0) {
    report.push("- None.");
  } else {
    for (const warning of warnings) report.push(`- ${warning}`);
  }
  report.push("");

  const outFile = writeReport(report);

  console.log(`HQ governor report: ${outFile}`);
  console.log(`Open: ${openIssues.length} | InProgress: ${inProgress.length} | Review: ${reviewIssues.length}`);
  console.log(`Deployment: ${deploy.state} (${deploy.sha ? deploy.sha.slice(0, 12) : "n/a"})`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length}`);
  }

  if (gateFailed && !autoDemote) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

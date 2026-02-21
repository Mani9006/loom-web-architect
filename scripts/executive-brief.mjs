#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const jiraCli = process.env.JIRA_CLI || "/Users/maany/.openclaw/bin/jira";
const githubRepo = process.env.EXECUTIVE_GITHUB_REPO || "Mani9006/loom-web-architect";

function safeExec(cmd) {
  try {
    return execSync(cmd, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return null;
  return res.json();
}

function parseJiraList(output) {
  const lines = output.split(/\r?\n/);
  const rows = [];
  const pattern = /^(\S+)\s+\[(.+?)\]\s+(.+)$/;

  for (const line of lines) {
    const m = line.match(pattern);
    if (!m) continue;
    rows.push({ key: m[1], status: m[2].trim(), summary: m[3].trim() });
  }

  const counts = rows.reduce((acc, row) => {
    const s = row.status.toLowerCase();
    if (s.includes("review")) acc.review += 1;
    else if (s.includes("in progress")) acc.inProgress += 1;
    else acc.other += 1;
    return acc;
  }, { review: 0, inProgress: 0, other: 0 });

  return { rows, counts };
}

function score({ deploymentState, jiraCounts }) {
  let releaseReadiness = 50;
  if (deploymentState === "success") releaseReadiness += 30;
  if (deploymentState === "pending") releaseReadiness += 10;
  if (deploymentState === "failure") releaseReadiness -= 25;
  if (jiraCounts.review === 0) releaseReadiness += 10;
  if (jiraCounts.review > 3) releaseReadiness -= 15;

  let operationalHealth = 55;
  if (jiraCounts.inProgress <= 5) operationalHealth += 15;
  if (jiraCounts.inProgress > 10) operationalHealth -= 15;
  if (deploymentState === "failure") operationalHealth -= 20;

  return {
    releaseReadiness: Math.max(0, Math.min(100, Math.round(releaseReadiness))),
    operationalHealth: Math.max(0, Math.min(100, Math.round(operationalHealth))),
  };
}

async function main() {
  const now = new Date();
  const timestamp = now.toISOString();

  const jiraOutput = safeExec(`${jiraCli} list-all`);
  const jira = parseJiraList(jiraOutput);

  const headSha = safeExec("git rev-parse --short HEAD");
  const latestMain = await fetchJson(`https://api.github.com/repos/${githubRepo}/commits/main`);
  const sha = latestMain?.sha || "";
  const status = sha
    ? await fetchJson(`https://api.github.com/repos/${githubRepo}/commits/${sha}/status`)
    : null;

  const vercel = (status?.statuses || []).find((s) => s.context === "Vercel") || null;
  const deploymentState = (vercel?.state || status?.state || "unknown").toLowerCase();
  const deploymentUrl = vercel?.target_url || "";
  const deploymentDescription = vercel?.description || "No deployment signal";

  const recentCommits = safeExec("git log --oneline -n 8 origin/main || git log --oneline -n 8")
    .split(/\r?\n/)
    .filter(Boolean);

  const scores = score({ deploymentState, jiraCounts: jira.counts });

  const priorities = [];
  if (deploymentState === "pending") {
    priorities.push("[HIGH] Atlas: hold new merges until Vercel deployment is success.");
  }
  if (jira.counts.review > 0) {
    priorities.push(`[HIGH] Prism: clear ${jira.counts.review} review ticket(s) with evidence + commits.`);
  }
  if (jira.counts.inProgress > 8) {
    priorities.push(`[MEDIUM] Atlas: reduce WIP from ${jira.counts.inProgress} in-progress tickets to <= 5.`);
  }
  if (priorities.length === 0) {
    priorities.push("[MEDIUM] Spark: run ATS quality benchmark against current top competitors.");
  }

  const report = [
    "# Executive Brief",
    "",
    `Generated: ${timestamp}`,
    `Repo: ${githubRepo}`,
    `Head: ${headSha}`,
    "",
    "## Scorecard",
    `- Release Readiness: ${scores.releaseReadiness}/100`,
    `- Operational Health: ${scores.operationalHealth}/100`,
    "",
    "## Deployment",
    `- State: ${deploymentState}`,
    `- Detail: ${deploymentDescription}`,
    `- URL: ${deploymentUrl || "n/a"}`,
    `- Commit: ${sha ? `https://github.com/${githubRepo}/commit/${sha}` : "n/a"}`,
    "",
    "## Jira Snapshot",
    `- Open (non-done): ${jira.rows.length}`,
    `- In Progress: ${jira.counts.inProgress}`,
    `- Review: ${jira.counts.review}`,
    "",
    "Top Tickets:",
    ...jira.rows.slice(0, 10).map((row) => `- ${row.key} [${row.status}] ${row.summary}`),
    "",
    "## Recent Main Commits",
    ...recentCommits.map((line) => `- ${line}`),
    "",
    "## Priorities",
    ...priorities.map((line) => `- ${line}`),
    "",
    "## Control Loop Checklist",
    "- Release gate: type-check + test + build must pass",
    "- Deployment gate: Vercel must be success before next merge",
    "- Ticket gate: each review ticket includes commit hash + evidence",
    "- ATS gate: no regression in ATS validation suite",
    "",
  ].join("\n");

  const outDir = path.join(repoRoot, ".openclaw", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `executive-brief-${now.toISOString().replace(/[.:]/g, "-")}.md`);
  fs.writeFileSync(file, report, "utf8");

  console.log(`Executive brief written: ${file}`);
  console.log(`Release readiness: ${scores.releaseReadiness} | Operational health: ${scores.operationalHealth}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

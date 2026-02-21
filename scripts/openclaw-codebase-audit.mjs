#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, ".openclaw", "reports");

async function walk(dir, filter) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }

    if (entry.isDirectory()) {
      out.push(...(await walk(full, filter)));
      continue;
    }

    if (!filter || filter(full)) {
      out.push(full);
    }
  }

  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

async function safeRead(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function extractAgentKeys(orchestratorSource) {
  const keys = [];
  const block = orchestratorSource.split("const AGENTS = {")[1]?.split("};")[0] || "";
  const regex = /^\s{2}([a-z_]+):\s*\{/gm;
  let match = regex.exec(block);
  while (match) {
    if (match[1] !== "orchestrator") {
      keys.push(match[1]);
    }
    match = regex.exec(block);
  }
  return keys;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  await mkdir(REPORT_DIR, { recursive: true });

  const [
    pageFiles,
    chatComponentFiles,
    resumeComponentFiles,
    functionEntrypoints,
    allSourceFiles,
    modelSelectorSource,
    aiOrchestratorSource,
    supabaseConfig,
    agentsConfig,
    modelCliConfig,
    chatPageSource,
  ] = await Promise.all([
    walk(path.join(ROOT, "src", "pages"), (p) => p.endsWith(".tsx")),
    walk(path.join(ROOT, "src", "components", "chat"), (p) => p.endsWith(".tsx")),
    walk(path.join(ROOT, "src", "components", "resume"), (p) => p.endsWith(".tsx")),
    walk(path.join(ROOT, "supabase", "functions"), (p) => p.endsWith("index.ts")),
    walk(ROOT, (p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".mjs") || p.endsWith(".md")),
    safeRead(path.join(ROOT, "src", "components", "resume", "ModelSelector.tsx")),
    safeRead(path.join(ROOT, "supabase", "functions", "ai-orchestrator", "index.ts")),
    safeRead(path.join(ROOT, "supabase", "config.toml")),
    safeRead(path.join(ROOT, ".openclaw", "agents.json")),
    safeRead(path.join(ROOT, ".openclaw", "model-clis.json")),
    safeRead(path.join(ROOT, "src", "pages", "Chat.tsx")),
  ]);

  const modelIds = [...modelSelectorSource.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
  const aiOrchestratorAgents = extractAgentKeys(aiOrchestratorSource);
  const hasAiOrchestratorUICall = /functions\/v1\/ai-orchestrator/.test(chatPageSource);

  const findings = [];

  if (!hasAiOrchestratorUICall) {
    findings.push("`ai-orchestrator` exists server-side but frontend calls `functions/v1/chat` directly, so specialized routing is likely bypassed.");
  }

  if (/verify_jwt\s*=\s*false/g.test(supabaseConfig)) {
    findings.push("Multiple Supabase functions are set to `verify_jwt = false`; this is risky for production if left unchanged.");
  }

  if (!agentsConfig) {
    findings.push("Missing `.openclaw/agents.json` (agent workforce config).");
  }

  if (!modelCliConfig) {
    findings.push("Missing `.openclaw/model-clis.json` (model CLI routing config).");
  }

  const report = [
    `# ResumePreps Codebase Audit (${today})`,
    "",
    "## Snapshot",
    `- Source files scanned: ${allSourceFiles.length}`,
    `- Pages: ${pageFiles.length}`,
    `- Chat components: ${chatComponentFiles.length}`,
    `- Resume components: ${resumeComponentFiles.length}`,
    `- Supabase functions: ${functionEntrypoints.length}`,
    "",
    "## Implemented Product Areas",
    "- Resume builder and resume chat flow",
    "- ATS checker flow",
    "- Cover letter generation flow",
    "- Interview prep flow",
    "- Job search flow",
    "- General AI chat experience",
    "- Document parsing and memory-related edge functions",
    "",
    "## AI Runtime Inventory",
    `- User-selectable models in UI (${modelIds.length}): ${modelIds.join(", ") || "none detected"}`,
    `- AI orchestrator specialist agents (${aiOrchestratorAgents.length}): ${aiOrchestratorAgents.join(", ") || "none detected"}`,
    `- Frontend currently wired to ai-orchestrator endpoint: ${hasAiOrchestratorUICall ? "yes" : "no"}`,
    "",
    "## OpenClaw Workforce Inventory",
    "- Agent workforce config: `.openclaw/agents.json`",
    "- Model CLI routing config: `.openclaw/model-clis.json`",
    "- Runner: `scripts/openclaw-agent-runner.mjs`",
    "",
    "## High-Impact Findings",
    ...((findings.length > 0) ? findings.map((item) => `- ${item}`) : ["- No high-impact findings detected in this static pass."]),
    "",
    "## Key Files",
    ...[
      ...pageFiles.slice(0, 8),
      ...functionEntrypoints,
      path.join(ROOT, "src", "components", "resume", "ModelSelector.tsx"),
      path.join(ROOT, "supabase", "functions", "chat", "index.ts"),
      path.join(ROOT, "supabase", "functions", "resume-chat", "index.ts"),
      path.join(ROOT, "supabase", "functions", "ai-orchestrator", "index.ts"),
    ].map((p) => `- ${rel(p)}`),
    "",
  ].join("\n");

  const reportPath = path.join(REPORT_DIR, `implementation-audit-${today}.md`);
  await writeFile(reportPath, report, "utf8");

  console.log(`Wrote audit report: ${rel(reportPath)}`);
  console.log(`Summary: ${pageFiles.length} pages, ${chatComponentFiles.length} chat components, ${functionEntrypoints.length} edge functions.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

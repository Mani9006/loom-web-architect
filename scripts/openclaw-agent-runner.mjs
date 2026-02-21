#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OPENCLAW_DIR = path.join(ROOT, ".openclaw");
const AGENTS_FILE = path.join(OPENCLAW_DIR, "agents.json");
const MODEL_CLIS_FILE = path.join(OPENCLAW_DIR, "model-clis.json");

const USAGE = `Usage:
  node scripts/openclaw-agent-runner.mjs list
  node scripts/openclaw-agent-runner.mjs doctor
  node scripts/openclaw-agent-runner.mjs run --agent <agent_id> --task \"<task prompt>\" [--provider openai|anthropic|auto] [--model <model>] [--dry-run]
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

function commandExists(binary) {
  const result = spawnSync("which", [binary], { encoding: "utf8" });
  return result.status === 0;
}

function resolveExecutable(providerConfig) {
  for (const candidate of providerConfig.candidateExecutables || []) {
    if (commandExists(candidate)) return candidate;
  }
  return null;
}

function buildArgs(template, replacements, modelArg, model) {
  const tokens = [...template];
  const promptIndex = tokens.indexOf("{prompt}");

  if (modelArg && model) {
    const insertAt = promptIndex >= 0 ? promptIndex : tokens.length;
    tokens.splice(insertAt, 0, modelArg, model);
  }

  return tokens.map((token) =>
    token
      .replaceAll("{prompt}", replacements.prompt)
      .replaceAll("{cwd}", replacements.cwd),
  );
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function printAgents(agentsConfig) {
  console.log("OpenClaw agents (9 employees):\n");
  for (const agent of agentsConfig.agents) {
    console.log(`- ${agent.id}`);
    console.log(`  Name: ${agent.name}`);
    console.log(`  Role: ${agent.description}`);
    console.log(`  Preferred: ${agent.preferredProvider} (${agent.defaultModel})`);
    console.log(`  Fallback: ${agent.fallbackProvider}`);
    console.log(`  Profile: ${agent.performanceProfile}`);
  }
}

function printDoctor(modelCliConfig) {
  console.log("OpenClaw model CLI doctor:\n");

  for (const [provider, cfg] of Object.entries(modelCliConfig.providers)) {
    console.log(`- ${provider} (${cfg.displayName})`);

    for (const binary of cfg.candidateExecutables || []) {
      const available = commandExists(binary);
      console.log(`  ${binary}: ${available ? "OK" : "missing"}`);
    }
  }
}

function chooseProvider(agent, modelCliConfig, requestedProvider) {
  const provider = requestedProvider && requestedProvider !== "auto"
    ? requestedProvider
    : agent.preferredProvider;

  if (provider in modelCliConfig.providers) {
    return provider;
  }

  return agent.preferredProvider;
}

async function runAgent(agentsConfig, modelCliConfig, options) {
  const agentId = String(options.agent || "").trim();
  const task = String(options.task || "").trim();
  const requestedProvider = String(options.provider || "auto").trim();

  if (!agentId || !task) {
    console.error("Both --agent and --task are required for run.");
    console.error(USAGE);
    process.exit(1);
  }

  const agent = agentsConfig.agents.find((item) => item.id === agentId);
  if (!agent) {
    console.error(`Unknown agent '${agentId}'. Run 'list' to see valid agents.`);
    process.exit(1);
  }

  let provider = chooseProvider(agent, modelCliConfig, requestedProvider);
  let providerConfig = modelCliConfig.providers[provider];
  let binary = resolveExecutable(providerConfig);

  if (!binary) {
    const fallback = agent.fallbackProvider;
    const fallbackCfg = modelCliConfig.providers[fallback];
    const fallbackBinary = fallbackCfg ? resolveExecutable(fallbackCfg) : null;

    if (!fallbackCfg || !fallbackBinary) {
      console.error(
        `No executable found for ${provider} (or fallback ${fallback || "none"}). Run 'doctor' to inspect availability.`,
      );
      process.exit(1);
    }

    provider = fallback;
    providerConfig = fallbackCfg;
    binary = fallbackBinary;
  }

  const execConfig = providerConfig.executables[binary];
  if (!execConfig || !Array.isArray(execConfig.argsTemplate)) {
    console.error(`Executable config missing for ${provider}.${binary} in .openclaw/model-clis.json`);
    process.exit(1);
  }

  const model = String(options.model || agent.defaultModel || providerConfig.defaultModel || "").trim();

  const composedPrompt = [
    `You are ${agent.name} for the ResumePreps codebase.`,
    `Role: ${agent.description}`,
    `Quality profile: ${agent.performanceProfile}.`,
    "Focus on concrete, implementation-ready output.",
    "",
    "Task:",
    task,
  ].join("\n");

  const args = buildArgs(
    execConfig.argsTemplate,
    { prompt: composedPrompt, cwd: ROOT },
    execConfig.modelArg,
    model,
  );

  const dryRun = Boolean(options["dry-run"]);

  console.log(`Agent: ${agent.id} (${agent.name})`);
  console.log(`Provider: ${provider}`);
  console.log(`Executable: ${binary}`);
  console.log(`Model: ${model}`);
  console.log(`CWD: ${ROOT}`);
  console.log(`Command: ${binary} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);

  if (dryRun) {
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: "inherit",
      cwd: ROOT,
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${binary} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const [, , ...argv] = process.argv;
  const command = argv[0];
  const options = parseOptions(argv.slice(1));

  if (!command || command === "-h" || command === "--help" || command === "help") {
    console.log(USAGE);
    return;
  }

  const [agentsConfig, modelCliConfig] = await Promise.all([
    loadJson(AGENTS_FILE),
    loadJson(MODEL_CLIS_FILE),
  ]);

  if (command === "list") {
    printAgents(agentsConfig);
    return;
  }

  if (command === "doctor") {
    printDoctor(modelCliConfig);
    return;
  }

  if (command === "run") {
    await runAgent(agentsConfig, modelCliConfig, options);
    return;
  }

  console.error(`Unknown command '${command}'.`);
  console.error(USAGE);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const raw = process.env.CODEX_INCIDENT_RESULT || "";
if (!raw || raw.length > 700_000) {
  throw new Error("Codex incident result is missing or too large.");
}

const result = JSON.parse(raw);
if (result.status !== "patch_ready" || typeof result.patch !== "string" || !result.patch.trim()) {
  throw new Error(`No safe patch was proposed: ${String(result.summary || result.status || "unknown")}`);
}

if (result.patch.length > 500_000 || result.patch.includes("GIT binary patch")) {
  throw new Error("Patch exceeds the incident repair safety limits.");
}

const touched = [...result.patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((match) => match[2]);
if (touched.length === 0) throw new Error("Patch does not contain a standard git diff.");

const allowedRoots = ["src/", "supabase/functions/", "scripts/", "qa/"];
const denied = [
  /^\.github\//,
  /^supabase\/migrations\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(?:secrets?|credentials?)(?:\.|\/|$)/i,
];

for (const file of touched) {
  if (!allowedRoots.some((root) => file.startsWith(root)) || denied.some((rule) => rule.test(file))) {
    throw new Error(`Incident patch attempted to modify a protected path: ${file}`);
  }
}

const patchPath = "/tmp/resumepreps-incident.patch";
fs.writeFileSync(patchPath, result.patch, "utf8");

for (const args of [["apply", "--check", patchPath], ["apply", patchPath]]) {
  const run = spawnSync("git", args, { encoding: "utf8", stdio: "inherit" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed.`);
}

fs.writeFileSync("/tmp/resumepreps-incident-summary.txt", String(result.summary || "Incident repair"), "utf8");
console.log(`Applied bounded incident patch to ${touched.length} file(s).`);

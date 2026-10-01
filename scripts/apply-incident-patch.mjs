#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

import {
  assertPatchTextAllowed,
  assertSummaryAllowed,
  isAllowedPatchPath,
  parseNumstatZ,
} from "./incident-patch-guard.mjs";

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

const touched = assertPatchTextAllowed(result.patch);

const patchPath = "/tmp/resumepreps-incident.patch";
fs.writeFileSync(patchPath, result.patch, "utf8");

function git(args, capture = false) {
  const run = spawnSync("git", args, { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed.`);
  return run.stdout || "";
}

// Ask git itself which paths the patch touches, so header tricks the text
// parser misses still cannot reach files outside the allowlist.
for (const file of parseNumstatZ(git(["apply", "--numstat", "-z", patchPath], true))) {
  if (!isAllowedPatchPath(file)) {
    throw new Error(`Incident patch attempted to modify a protected path: ${file}`);
  }
}
assertSummaryAllowed(git(["apply", "--summary", patchPath], true));

git(["apply", "--check", patchPath]);
git(["apply", patchPath]);

fs.writeFileSync("/tmp/resumepreps-incident-summary.txt", String(result.summary || "Incident repair"), "utf8");
console.log(`Applied bounded incident patch to ${touched.length} file(s).`);

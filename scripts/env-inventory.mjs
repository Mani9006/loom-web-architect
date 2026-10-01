#!/usr/bin/env node
/**
 * env-inventory — list every environment variable the codebase reads.
 *
 *   node scripts/env-inventory.mjs            # writes docs/env-inventory.md
 *   node scripts/env-inventory.mjs --check    # exit 1 if the doc is stale (for CI)
 *   node scripts/env-inventory.mjs --stdout   # print instead of writing
 *
 * Detects:
 *   Deno.env.get("X"), requireEnv("X"), optionalEnv("X"), requireEnvs([...])  (edge functions)
 *   process.env.X, process.env["X"], const { X } = process.env                  (node scripts / worker)
 *   import.meta.env.X                                                           (Vite frontend)
 *
 * "Required?" is a static heuristic per usage:
 *   yes      requireEnv/requireEnvs, a non-null assertion (`!`), or a `throw` /
 *            `process.exit` within the next 3 lines
 *   default  followed by `??` or `||` on the same line
 *   no       anything else (read and tolerated when missing)
 * A variable is "yes" if ANY usage is required. Dynamic lookups such as
 * Deno.env.get(name) cannot be resolved statically and are listed separately.
 *
 * No dependencies; deterministic output (sorted) so diffs stay reviewable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "env-inventory.md");
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".claude", "coverage", "playwright-report", "test-results", ".vercel"]);
const VITE_BUILTINS = new Set(["DEV", "PROD", "MODE", "BASE_URL", "SSR"]);

/** Walk the repo, returning repo-relative POSIX paths of source files. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join("/"));
    }
  }
  return out;
}

function runtimeFor(file, kind) {
  if (kind === "vite") return "frontend (Vite)";
  if (file.startsWith("supabase/functions/")) return "edge (Deno)";
  if (file.startsWith("scripts/") || file.startsWith("infra/")) return "node (scripts/worker)";
  return "node (tooling)";
}

const NAME = "[A-Z_][A-Z0-9_]*";
const PATTERNS = [
  { kind: "deno", re: new RegExp(`Deno\\.env\\.get\\(\\s*["'\`](${NAME})["'\`]\\s*\\)`, "g") },
  { kind: "deno", re: new RegExp(`\\b(?:requireEnv|optionalEnv|boolEnv)\\(\\s*["'\`](${NAME})["'\`]`, "g") },
  { kind: "node", re: new RegExp(`process\\.env\\.(${NAME})\\b`, "g") },
  { kind: "node", re: new RegExp(`process\\.env\\[\\s*["'\`](${NAME})["'\`]\\s*\\]`, "g") },
  { kind: "vite", re: new RegExp(`import\\.meta\\.env\\.(${NAME})\\b`, "g") },
  // Pure modules that take an injected lookup: env("X") / envOr(env, "X")
  { kind: "deno", re: new RegExp(`\\b(?:env\\(|envOr\\(\\s*env\\s*,)\\s*["'\`](${NAME})["'\`]`, "g"), only: "supabase/functions/" },
];
const DYNAMIC_RE = /Deno\.env\.get\(\s*(?!["'`])([^)]+)\)|process\.env\[\s*(?!["'`])([^\]]+)\]/g;

function classify(lines, idx, matchEnd, line, matchText) {
  if (/^(?:requireEnv|requireEnvs)\b/.test(matchText)) return "yes";
  if (/^envOr\b/.test(matchText)) return "default";
  const rest = line.slice(matchEnd);
  if (/^\s*!(?!=)/.test(rest)) return "yes";
  if (/^\s*(\?\?|\|\|)/.test(rest)) return "default";
  const lookahead = [line.slice(matchEnd), ...lines.slice(idx + 1, idx + 4)].join("\n");
  if (/\bthrow\b|process\.exit\(/.test(lookahead)) return "yes";
  return "no";
}

const RANK = { yes: 3, default: 2, no: 1 };

export function collect(files = walk(ROOT)) {
  /** @type {Map<string, {runtimes:Set<string>, files:Set<string>, required:string}>} */
  const vars = new Map();
  const dynamic = [];
  const add = (name, file, kind, req) => {
    if (kind === "vite" && VITE_BUILTINS.has(name)) return;
    const v = vars.get(name) ?? { runtimes: new Set(), files: new Set(), required: "no" };
    v.runtimes.add(runtimeFor(file, kind));
    v.files.add(file);
    if (RANK[req] > RANK[v.required]) v.required = req;
    vars.set(name, v);
  };

  for (const file of files) {
    if (file === "scripts/env-inventory.mjs") continue;
    if (/\.test\.[cm]?[jt]sx?$/.test(file) || file.startsWith("src/test/")) continue;
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!/Deno\.env|process\.env|import\.meta\.env|requireEnvs?\(|optionalEnv\(|\benv\(/.test(src)) continue;
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      for (const { kind, re, only } of PATTERNS) {
        if (only && !file.startsWith(only)) continue;
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) {
          add(m[1], file, kind, classify(lines, i, m.index + m[0].length, line, m[0]));
        }
      }
      // requireEnvs(["A", "B"]) → all required
      for (const m of line.matchAll(/\brequireEnvs\(\s*\[([^\]]*)\]/g)) {
        for (const n of m[1].matchAll(new RegExp(`["'\`](${NAME})["'\`]`, "g"))) add(n[1], file, "deno", "yes");
      }
      // const { A, B: b } = process.env
      const destructure = line.match(/\{([^}]+)\}\s*=\s*process\.env\b/);
      if (destructure) {
        for (const part of destructure[1].split(",")) {
          const n = part.split(/[:=]/)[0].trim();
          if (new RegExp(`^${NAME}$`).test(n)) add(n, file, "node", part.includes("=") ? "default" : "no");
        }
      }
      for (const m of line.matchAll(DYNAMIC_RE)) {
        if (file.endsWith("_shared/env.ts")) continue; // the helper itself
        dynamic.push({ file, line: i + 1, expr: (m[1] ?? m[2]).trim() });
      }
    });
  }
  // Feature flags are read dynamically as import.meta.env[`VITE_ENABLE_${name}`];
  // expand them from FLAG_SPECS so they are inventoried too.
  const flagsFile = "src/lib/feature-flags.ts";
  if (files.includes(flagsFile)) {
    const src = fs.readFileSync(path.join(ROOT, flagsFile), "utf8");
    const specs = src.slice(src.indexOf("FLAG_SPECS"));
    for (const m of specs.matchAll(/\bname:\s*["']([A-Z0-9_]+)["']/g)) add(`VITE_ENABLE_${m[1]}`, flagsFile, "vite", "default");
  }
  return { vars, dynamic };
}

/** Frontend VITE_* variables a developer may need to set (for the .env.example check). */
export function frontendVars(vars) {
  return [...vars.entries()]
    .filter(([name, v]) => v.runtimes.has("frontend (Vite)") && name.startsWith("VITE_"))
    .map(([name]) => name)
    .sort();
}

function render({ vars, dynamic }) {
  const rows = [...vars.entries()].sort(([a], [b]) => a.localeCompare(b));
  const fmtFiles = (set) => {
    const list = [...set].sort();
    const shown = list.slice(0, 4).map((f) => `\`${f}\``).join(", ");
    return list.length > 4 ? `${shown}, +${list.length - 4} more` : shown;
  };
  const byRuntime = (r) => rows.filter(([, v]) => v.runtimes.has(r)).length;
  const out = [];
  out.push("# Environment variable inventory");
  out.push("");
  out.push("<!-- GENERATED by scripts/env-inventory.mjs. Do not edit by hand: run `node scripts/env-inventory.mjs`. -->");
  out.push("");
  out.push(
    `${rows.length} variables: ${byRuntime("edge (Deno)")} read by edge functions, ` +
      `${byRuntime("node (scripts/worker)")} by node scripts / the browser worker, ` +
      `${byRuntime("frontend (Vite)")} by the frontend, ${byRuntime("node (tooling)")} by build tooling.`,
  );
  out.push("");
  out.push("- **Edge (Deno)** values are Supabase secrets: `supabase secrets set NAME=...` (read via `_shared/env.ts`).");
  out.push("- **Frontend (Vite)** `VITE_*` values are baked into the public bundle at build time; never put secrets there. Template: `.env.example`.");
  out.push("- **Node** values come from the worker host / GitHub Actions secrets.");
  out.push("- **Required?** is a static heuristic (see the script header): `yes` = fails loudly when unset, `default` = has a fallback, `no` = tolerated when missing.");
  out.push("");
  out.push("| Name | Runtime | Required? | Used in |");
  out.push("|---|---|---|---|");
  for (const [name, v] of rows) {
    out.push(`| \`${name}\` | ${[...v.runtimes].sort().join(", ")} | ${v.required} | ${fmtFiles(v.files)} |`);
  }
  out.push("");
  out.push("## Model registry variables");
  out.push("");
  out.push(
    "`supabase/functions/_shared/models.ts` builds these names at runtime, so they show up below as dynamic lookups: " +
      "`MODEL_FAST`, `MODEL_BALANCED`, `MODEL_DEEP`, `MODEL_SEARCH` (value `provider:model` or a bare model id), " +
      "`MODEL_<TIER>_<PROVIDER>` (e.g. `MODEL_FAST_ANTHROPIC`), `MODEL_AUTO_APPLY`, and the legacy `OPENAI_MODEL_CHEAP|STANDARD|HARD`.",
  );
  out.push("");
  out.push("## Dynamic lookups");
  out.push("");
  out.push("These read a variable whose name is computed at runtime, so they are not in the table above.");
  out.push("");
  if (dynamic.length === 0) out.push("_None._");
  for (const d of dynamic.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    out.push(`- \`${d.file}:${d.line}\` — \`${d.expr}\``);
  }
  out.push("");
  return out.join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const md = render(collect());
  if (process.argv.includes("--stdout")) {
    process.stdout.write(md);
  } else if (process.argv.includes("--check")) {
    let ok = true;
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current !== md) {
      console.error("docs/env-inventory.md is stale. Run: node scripts/env-inventory.mjs");
      ok = false;
    }
    const examplePath = path.join(ROOT, ".env.example");
    const example = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, "utf8") : "";
    const missing = frontendVars(collect().vars).filter((n) => !new RegExp(`^#?\\s*${n}=`, "m").test(example));
    if (missing.length) {
      console.error(`.env.example is missing frontend variables: ${missing.join(", ")}`);
      ok = false;
    }
    if (!ok) process.exit(1);
    console.log("docs/env-inventory.md and .env.example are up to date.");
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, md);
    console.log(`Wrote ${path.relative(ROOT, OUT)} (${collect().vars.size} variables).`);
  }
}

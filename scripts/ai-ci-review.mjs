#!/usr/bin/env node
/**
 * Cost-capped AI review for CI.
 *
 * This is intentionally advisory and opt-in. Deterministic checks remain the
 * merge gate. The reviewer receives only a redacted, size-capped git diff and
 * uses the smallest configured model to find correctness/security regressions.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const diffPath = process.env.AI_REVIEW_DIFF_PATH || "/tmp/ai-review.diff";
const outputPath = process.env.AI_REVIEW_OUTPUT_PATH || ".reports/ai-review.md";
const model = process.env.AI_REVIEW_MODEL || "gpt-5.4-nano";
const maxInputChars = clamp(Number(process.env.AI_REVIEW_MAX_INPUT_CHARS || 30_000), 4_000, 60_000);
const maxOutputTokens = clamp(Number(process.env.AI_REVIEW_MAX_OUTPUT_TOKENS || 900), 300, 1_500);
const apiKey = process.env.OPENAI_API_KEY || "";
const dryRun = process.env.AI_REVIEW_DRY_RUN === "true";

let diff;
try {
  diff = await readFile(diffPath, "utf8");
} catch {
  console.log(`AI review skipped: no diff at ${diffPath}`);
  process.exit(0);
}

if (!diff.trim()) {
  console.log("AI review skipped: diff is empty");
  process.exit(0);
}

const redacted = redactSecrets(diff);
const truncated = redacted.length > maxInputChars;
const boundedDiff = redacted.slice(0, maxInputChars);
const estimatedInputTokens = Math.ceil(boundedDiff.length / 4);

if (dryRun) {
  await saveReport([
    "<!-- resumepreps-ai-review -->",
    "## Budget AI review dry run",
    "",
    `Prepared ${boundedDiff.length.toLocaleString()} characters (~${estimatedInputTokens.toLocaleString()} input tokens) for \`${model}\`.`,
    truncated ? "The diff was truncated to the configured input budget." : "The diff fits within the configured input budget.",
  ].join("\n"));
  console.log(`Dry run prepared for ${model}: ~${estimatedInputTokens} input tokens`);
  process.exit(0);
}

if (!apiKey) {
  console.log("AI review skipped: OPENAI_API_KEY is not configured");
  process.exit(0);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);

let response;
try {
  response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      reasoning_effort: "low",
      max_completion_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a conservative pull-request reviewer.",
            "Review only the supplied diff for correctness, security, privacy, data-loss, authorization, deployment, and regression risks.",
            "Do not report style preferences, formatting, missing comments, or speculative issues.",
            "Do not assume code outside the diff is wrong. If evidence is insufficient, omit the finding.",
            "Return JSON with: verdict ('pass' or 'concerns'), summary (string), findings (array of at most 5 objects with severity 'high'|'medium'|'low', file, line number or null, title, detail).",
          ].join(" "),
        },
        {
          role: "user",
          content: `Repository: ResumePreps\nBase: ${process.env.AI_REVIEW_BASE_SHA || "unknown"}\nHead: ${process.env.AI_REVIEW_HEAD_SHA || "unknown"}\nDiff${truncated ? " (truncated by budget)" : ""}:\n\n${boundedDiff}`,
        },
      ],
    }),
  });
} finally {
  clearTimeout(timeout);
}

if (!response.ok) {
  const body = await response.text();
  throw new Error(`OpenAI review failed (${response.status}): ${body.slice(0, 300)}`);
}

const payload = await response.json();
const raw = payload.choices?.[0]?.message?.content || "";
let review;
try {
  review = JSON.parse(raw);
} catch {
  throw new Error(`AI review returned invalid JSON: ${String(raw).slice(0, 200)}`);
}

const findings = Array.isArray(review.findings) ? review.findings.slice(0, 5) : [];
const usage = payload.usage || {};
const report = [
  "<!-- resumepreps-ai-review -->",
  "## Budget AI review",
  "",
  `**Verdict:** ${review.verdict === "concerns" ? "⚠️ Concerns" : "✅ Pass"}`,
  "",
  String(review.summary || "No summary returned."),
  "",
  ...renderFindings(findings),
  findings.length === 0 ? "No actionable findings." : "",
  "",
  `Model: \`${model}\` · input: ${Number(usage.prompt_tokens || 0).toLocaleString()} tokens · output: ${Number(usage.completion_tokens || 0).toLocaleString()} tokens${truncated ? " · diff truncated" : ""}`,
  "",
  "Advisory only: deterministic tests, security checks, and human review remain authoritative.",
].filter((line) => line !== undefined).join("\n");

await saveReport(report);
console.log(`AI review complete with ${findings.length} finding(s)`);

function renderFindings(findings) {
  if (findings.length === 0) return [];
  return findings.flatMap((finding, index) => {
    const severity = ["high", "medium", "low"].includes(finding?.severity) ? finding.severity : "low";
    const file = typeof finding?.file === "string" ? finding.file : "unknown file";
    const line = Number.isInteger(finding?.line) ? `:${finding.line}` : "";
    return [
      `### ${index + 1}. [${severity.toUpperCase()}] ${String(finding?.title || "Potential issue")}`,
      "",
      `\`${file}${line}\` — ${String(finding?.detail || "No detail returned.")}`,
      "",
    ];
  });
}

function redactSecrets(value) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "<redacted-openai-key>")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<redacted-jwt>")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?)[^\s"']{12,}/gi, "$1<redacted>");
}

async function saveReport(contents) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${contents.trim()}\n`, "utf8");
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

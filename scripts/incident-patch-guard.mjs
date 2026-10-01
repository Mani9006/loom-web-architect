// Pure path/shape checks for model-proposed incident patches.
// Kept free of side effects so it can be unit tested.

export const ALLOWED_ROOTS = ["src/", "supabase/functions/", "scripts/", "qa/"];

const DENIED = [
  /^\.github\//,
  /^supabase\/migrations\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(?:secrets?|credentials?)(?:\.|\/|$)/i,
];

const FORBIDDEN_HEADER =
  /^(?:rename from|rename to|copy from|copy to|old mode|new mode|similarity index|dissimilarity index) /;

// Mimic `git apply -p1`: drop the first path component.
function stripPrefix(path) {
  const trimmed = path.replace(/^"(.*)"$/, "$1");
  const slash = trimmed.indexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Return the patch lines that sit outside hunk bodies. Hunk line counts are
 * honoured so that content lines such as "--- foo" are not treated as headers.
 */
export function patchHeaderLines(patch) {
  const headers = [];
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of patch.split("\n")) {
    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith("\\")) continue;
      if (line.startsWith("-")) oldLeft -= 1;
      else if (line.startsWith("+")) newLeft -= 1;
      else {
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      continue;
    }
    headers.push(line);
  }
  return headers;
}

/**
 * Collect every path a patch can touch: both sides of `diff --git` headers and
 * every plain unified-diff `---` / `+++` header.
 */
export function collectPatchPaths(patch) {
  const paths = new Set();
  for (const line of patchHeaderLines(patch)) {
    const git = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (git) {
      paths.add(git[1]);
      paths.add(git[2]);
      continue;
    }
    const file = /^(?:---|\+\+\+) (.+)$/.exec(line);
    if (!file) continue;
    const raw = file[1].replace(/\t.*$/, "").trim();
    if (raw === "/dev/null") continue;
    paths.add(stripPrefix(raw));
  }
  return [...paths];
}

export function isAllowedPatchPath(file) {
  if (!file || file.startsWith("/") || file.split("/").includes("..")) return false;
  return ALLOWED_ROOTS.some((root) => file.startsWith(root)) && !DENIED.some((rule) => rule.test(file));
}

/** Throws when the patch text is outside the incident repair safety bounds. Returns touched paths. */
export function assertPatchTextAllowed(patch) {
  const headers = patchHeaderLines(patch);
  const sections = headers.filter((line) => line.startsWith("diff --git ")).length;
  if (sections === 0) throw new Error("Patch does not contain a standard git diff.");
  if (headers.some((line) => FORBIDDEN_HEADER.test(line))) {
    throw new Error("Incident patch may not rename, copy, or change file modes.");
  }
  const fileHeaders = headers.filter((line) => line.startsWith("+++ ")).length;
  if (fileHeaders > sections) {
    throw new Error("Incident patch contains unified-diff sections without a git header.");
  }
  const paths = collectPatchPaths(patch);
  for (const file of paths) {
    if (!isAllowedPatchPath(file)) {
      throw new Error(`Incident patch attempted to modify a protected path: ${file}`);
    }
  }
  return paths;
}

/**
 * Parse `git apply --numstat -z` output into every path git will touch
 * (both sides of any rename/copy).
 */
export function parseNumstatZ(output) {
  const tokens = output.split("\0");
  const paths = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const match = /^(?:\d+|-)\t(?:\d+|-)\t([\s\S]*)$/.exec(tokens[i]);
    if (!match) continue;
    if (match[1]) {
      paths.push(match[1]);
    } else {
      paths.push(tokens[i + 1], tokens[i + 2]);
      i += 2;
    }
  }
  return paths.filter(Boolean);
}

/** Reject `git apply --summary` lines for renames, copies, mode changes, or non-regular new files. */
export function assertSummaryAllowed(summary) {
  for (const line of summary.split("\n").map((value) => value.trim()).filter(Boolean)) {
    if (/^(?:rename|copy|mode change) /.test(line)) {
      throw new Error(`Incident patch may not rename, copy, or change file modes: ${line}`);
    }
    const create = /^create mode (\d+) /.exec(line);
    if (create && create[1] !== "100644") {
      throw new Error(`Incident patch may only create regular files: ${line}`);
    }
  }
}

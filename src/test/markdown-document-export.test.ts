import { describe, it, expect } from "vitest";
import { parseInlineSegments, parseMarkdownLines } from "@/lib/markdown-document-export";

describe("parseInlineSegments", () => {
  it("returns a single plain segment for text with no bold markers", () => {
    expect(parseInlineSegments("Senior ML Engineer")).toEqual([
      { text: "Senior ML Engineer", bold: false },
    ]);
  });

  it("splits a single bold span out of surrounding plain text", () => {
    expect(parseInlineSegments("**Senior ML Engineer** — Stripe")).toEqual([
      { text: "Senior ML Engineer", bold: true },
      { text: " — Stripe", bold: false },
    ]);
  });

  it("handles multiple bold spans on one line", () => {
    expect(parseInlineSegments("**Role** at **Company**")).toEqual([
      { text: "Role", bold: true },
      { text: " at ", bold: false },
      { text: "Company", bold: true },
    ]);
  });
});

describe("parseMarkdownLines", () => {
  it("classifies headings, bullets, blanks, and plain text", () => {
    const md = ["# Jane Doe", "", "## Experience", "**Senior Engineer** — Acme", "- Shipped the thing", "Just a line"].join(
      "\n",
    );
    const lines = parseMarkdownLines(md);
    expect(lines.map((l) => l.kind)).toEqual(["h1", "blank", "h2", "text", "bullet", "text"]);
    expect(lines[4].segments).toEqual([{ text: "Shipped the thing", bold: false }]);
  });

  it("strips the leading dash/star and marker space from bullets", () => {
    const lines = parseMarkdownLines("* Led a team of 5\n- Cut latency by 30%");
    expect(lines[0]).toEqual({ kind: "bullet", segments: [{ text: "Led a team of 5", bold: false }] });
    expect(lines[1]).toEqual({ kind: "bullet", segments: [{ text: "Cut latency by 30%", bold: false }] });
  });
});

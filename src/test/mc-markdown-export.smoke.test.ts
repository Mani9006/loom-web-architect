import { describe, it, expect } from "vitest";
import { parseInlineBold, markdownToPdfBlob, downloadMarkdownAsDocx } from "@/lib/mc-markdown-export";

describe("mc-markdown-export smoke test", () => {
  it("parses inline bold segments", () => {
    expect(parseInlineBold("**Acme Corp** — Senior Engineer")).toEqual([
      { text: "Acme Corp", bold: true },
      { text: " — Senior Engineer", bold: false },
    ]);
    expect(parseInlineBold("plain text")).toEqual([{ text: "plain text", bold: false }]);
  });

  it("renders a markdown resume to a non-empty PDF blob", async () => {
    const md = [
      "# Jane Doe",
      "jane@example.com · 555-1234",
      "",
      "## Experience",
      "**Senior Engineer** — Acme Corp",
      "2020 – Present",
      "- Shipped a thing that mattered",
      "- Led a team of engineers",
    ].join("\n");
    const blob = await markdownToPdfBlob(md);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("application/pdf");
  });

  it("generates a docx file without throwing", async () => {
    // jsdom doesn't implement these — file-saver needs them to trigger a download.
    URL.createObjectURL = URL.createObjectURL ?? (() => "blob:mock");
    URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
    await expect(downloadMarkdownAsDocx("# Jane Doe\n\n## Experience\n- Did a thing", "jane-doe")).resolves.not.toThrow();
  });
});

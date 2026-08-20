import { describe, expect, it } from "vitest";
import { safeFileName } from "@/components/my-collection/ResumesTab";

describe("safeFileName", () => {
  it("strips path separators that would break the download", () => {
    // Tailored resumes are named "<company>, <job title>", and titles like
    // "Frontend / Backend Engineer" are common.
    expect(safeFileName("Acme, Frontend / Backend Engineer")).toBe(
      "Acme, Frontend - Backend Engineer",
    );
    expect(safeFileName("A\\B")).toBe("A-B");
  });

  it("strips the remaining characters Windows rejects in a filename", () => {
    expect(safeFileName('a:b*c?d"e<f>g|h')).toBe("a-b-c-d-e-f-g-h");
  });

  it("leaves an ordinary name alone", () => {
    expect(safeFileName("Stripe, Senior ML Engineer")).toBe("Stripe, Senior ML Engineer");
  });

  it("falls back to a usable name when nothing survives", () => {
    expect(safeFileName("")).toBe("resume");
    expect(safeFileName("   ")).toBe("resume");
  });
});

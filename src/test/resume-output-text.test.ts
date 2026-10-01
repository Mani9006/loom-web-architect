import { describe, expect, it } from "vitest";
import { cleanResumeBulletText, cleanResumeDisplayText } from "@/lib/resume-output-text";

describe("cleanResumeDisplayText", () => {
  it("keeps the space after a colon", () => {
    expect(cleanResumeDisplayText("Tools: React, Node")).toBe("Tools: React, Node");
    expect(cleanResumeBulletText("Led migration: reduced cost by 30%")).toBe("Led migration: reduced cost by 30%");
  });

  it("keeps the space before a leading period such as .NET", () => {
    expect(cleanResumeBulletText("Built APIs in C# and .NET Core")).toBe("Built APIs in C# and .NET Core");
  });

  it("keeps parenthesized content intact while trimming inner padding", () => {
    expect(cleanResumeDisplayText("Frontend (React)")).toBe("Frontend (React)");
    expect(cleanResumeDisplayText("Frontend ( React )")).toBe("Frontend (React)");
  });

  it("still removes stray spaces before trailing punctuation", () => {
    expect(cleanResumeDisplayText("Shipped features , improved latency .")).toBe("Shipped features, improved latency.");
    expect(cleanResumeDisplayText("Skills : TypeScript ; Go")).toBe("Skills: TypeScript; Go");
  });

  it("does not collapse newlines before punctuation", () => {
    expect(cleanResumeDisplayText("Line one\n.NET experience")).toBe("Line one\n.NET experience");
  });

  it("preserves CI/CD and R&D", () => {
    expect(cleanResumeBulletText("- Built CI/CD for R&D teams")).toBe("Built CI/CD for R&D teams");
  });
});

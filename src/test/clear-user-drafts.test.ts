import { beforeEach, describe, expect, it } from "vitest";
import { clearUserDrafts } from "@/lib/clear-user-drafts";

describe("clearUserDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("removes cover letter and ATS drafts from both storages", () => {
    localStorage.setItem("coverLetter.resumeText", JSON.stringify("Jane Doe, 555-0100"));
    localStorage.setItem("coverLetter.jobDescription", JSON.stringify("JD"));
    localStorage.setItem("atsChecker.resumeText", JSON.stringify("resume"));
    sessionStorage.setItem("coverLetter.result", JSON.stringify("letter"));
    localStorage.setItem("interviewPrep.model", JSON.stringify("gemini-flash"));
    sessionStorage.setItem("jobSearch.query", JSON.stringify("engineer"));

    clearUserDrafts();

    expect(localStorage.getItem("coverLetter.resumeText")).toBeNull();
    expect(localStorage.getItem("coverLetter.jobDescription")).toBeNull();
    expect(localStorage.getItem("atsChecker.resumeText")).toBeNull();
    expect(sessionStorage.getItem("coverLetter.result")).toBeNull();
    expect(localStorage.getItem("interviewPrep.model")).not.toBeNull();
    expect(sessionStorage.getItem("jobSearch.query")).not.toBeNull();
  });

  it("swallows storage errors", () => {
    const broken = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => undefined,
    };
    expect(() => clearUserDrafts([broken])).not.toThrow();
  });
});

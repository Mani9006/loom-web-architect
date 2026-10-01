import { describe, it, expect, beforeEach } from "vitest";
import { clearPersistedState, PERSISTED_STATE_PREFIXES } from "@/hooks/use-persisted-state";

describe("clearPersistedState", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("removes page-prefixed keys from both storages", () => {
    window.localStorage.setItem("atsChecker.resumeText", JSON.stringify("Jane Doe resume"));
    window.localStorage.setItem("coverLetter.jobDescription", JSON.stringify("JD"));
    window.sessionStorage.setItem("jobSearch.query", JSON.stringify("engineer"));
    window.sessionStorage.setItem("interviewPrep.messages", JSON.stringify([]));

    clearPersistedState();

    expect(window.localStorage.getItem("atsChecker.resumeText")).toBeNull();
    expect(window.localStorage.getItem("coverLetter.jobDescription")).toBeNull();
    expect(window.sessionStorage.getItem("jobSearch.query")).toBeNull();
    expect(window.sessionStorage.getItem("interviewPrep.messages")).toBeNull();
  });

  it("leaves unrelated keys untouched", () => {
    window.localStorage.setItem("theme", "dark");
    window.localStorage.setItem("sb-project-auth-token", "x");
    window.localStorage.setItem("atsChecker.result", "{}");

    clearPersistedState();

    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(window.localStorage.getItem("sb-project-auth-token")).toBe("x");
    expect(window.localStorage.getItem("atsChecker.result")).toBeNull();
  });

  it("covers the ATS checker and cover letter prefixes", () => {
    expect(PERSISTED_STATE_PREFIXES).toContain("atsChecker.");
    expect(PERSISTED_STATE_PREFIXES).toContain("coverLetter.");
  });
});

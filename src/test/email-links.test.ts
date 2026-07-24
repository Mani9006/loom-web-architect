import { describe, expect, it } from "vitest";
import { formatLinkedJobLabel, pickEmailLinkTarget } from "@/lib/email-links";

const trackedJob = {
  apply_url: "https://jobs.example.com/apply/123",
  session_id: "session-1",
};

describe("pickEmailLinkTarget", () => {
  it("returns null when the email has no tracked job", () => {
    expect(pickEmailLinkTarget(null, "draft-1")).toBeNull();
    expect(pickEmailLinkTarget(undefined, "draft-1")).toBeNull();
  });

  it("prefers the in-app draft review over every fallback", () => {
    expect(pickEmailLinkTarget(trackedJob, "draft-9")).toEqual({
      kind: "draft",
      href: "/applications/draft-9",
      draftId: "draft-9",
    });
  });

  it("falls back to the external apply URL when no draft exists", () => {
    expect(pickEmailLinkTarget(trackedJob, null)).toEqual({
      kind: "external",
      href: "https://jobs.example.com/apply/123",
    });
  });

  it("falls back to the My Collection board when there is no apply URL", () => {
    expect(pickEmailLinkTarget({ apply_url: null, session_id: "session-7" }, null)).toEqual({
      kind: "session",
      href: "/my-collection/session-7?tab=board",
    });
  });

  it("returns null when nothing links", () => {
    expect(pickEmailLinkTarget({ apply_url: null, session_id: null }, null)).toBeNull();
  });
});

describe("formatLinkedJobLabel", () => {
  it("joins title and company", () => {
    expect(formatLinkedJobLabel({ job_title: "Frontend Engineer", company: "Acme" })).toBe("Frontend Engineer @ Acme");
  });

  it("survives missing parts", () => {
    expect(formatLinkedJobLabel({ job_title: "Frontend Engineer", company: "" })).toBe("Frontend Engineer");
    expect(formatLinkedJobLabel({ job_title: "", company: "Acme" })).toBe("Acme");
    expect(formatLinkedJobLabel({ job_title: "", company: "" })).toBeNull();
    expect(formatLinkedJobLabel(null)).toBeNull();
  });
});

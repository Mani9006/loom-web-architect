import { describe, it, expect } from "vitest";
import {
  destinations,
  resolveRoute,
  destinationByShortcut,
  destinationPages,
} from "@/components/layout/navigation";

describe("primary navigation", () => {
  it("has five destinations in order", () => {
    expect(destinations.map((d) => d.label)).toEqual(["Today", "Jobs", "Pipeline", "Resume", "Activity"]);
    expect(destinations.map((d) => d.path)).toEqual(["/home", "/matches", "/applications", "/resume-builder", "/agent"]);
  });

  it("uses unique single-key shortcuts", () => {
    const keys = destinations.map((d) => d.shortcut);
    expect(new Set(keys).size).toBe(keys.length);
    expect(destinationByShortcut("P")?.id).toBe("pipeline");
    expect(destinationByShortcut("x")).toBeUndefined();
  });
});

describe("resolveRoute", () => {
  const cases: Array<[string, string | null, string]> = [
    ["/home", "today", "Today"],
    ["/matches", "jobs", "Jobs"],
    ["/job-search", "jobs", "Job search"],
    ["/applications", "pipeline", "Pipeline"],
    ["/applications/abc-123", "pipeline", "Pipeline"],
    ["/job-tracker", "pipeline", "Job tracker"],
    ["/my-collection/session-1", "pipeline", "Saved jobs"],
    ["/inbox", "pipeline", "Inbox"],
    ["/analytics", "pipeline", "Analytics"],
    ["/resume-builder", "resume", "Resume"],
    ["/resume-builder/v2/xyz", "resume", "Resume"],
    ["/resume-builder/abc", "resume", "Resume"],
    ["/ats-checker", "resume", "ATS checker"],
    ["/cover-letters", "resume", "Cover letters"],
    ["/agent", "activity", "Activity"],
    ["/agent/", "activity", "Activity"],
  ];

  it.each(cases)("%s highlights %s", (path, destination, title) => {
    const match = resolveRoute(path);
    expect(match.destination?.id ?? null).toBe(destination);
    expect(match.title).toBe(title);
  });

  it("does not match on partial segments", () => {
    expect(resolveRoute("/homework").destination).toBeNull();
    expect(resolveRoute("/agents").destination).toBeNull();
  });

  it("resolves account and admin pages outside the destinations", () => {
    expect(resolveRoute("/settings")).toMatchObject({ area: "account", title: "Settings", destination: null });
    expect(resolveRoute("/profile-setup")).toMatchObject({ area: "account", title: "Profile" });
    expect(resolveRoute("/admin/flags")).toMatchObject({ area: "admin", title: "Feature flags" });
    expect(resolveRoute("/admin")).toMatchObject({ area: "admin", title: "Admin" });
  });

  it("hides admin titles from non-admins", () => {
    expect(resolveRoute("/control-center", { includeAdmin: false }).title).toBe("");
  });

  it("lists the destination's own page first in its switcher", () => {
    const pipeline = destinations.find((d) => d.id === "pipeline")!;
    expect(destinationPages(pipeline).map((p) => p.label)).toEqual([
      "Board",
      "Job tracker",
      "Saved jobs",
      "Inbox",
      "Analytics",
    ]);
  });
});

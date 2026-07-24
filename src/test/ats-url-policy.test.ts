import { describe, expect, it } from "vitest";

import {
  classifyAtsApplyUrl,
  hostnameMatchesDomain,
  normalizePublicHttpsUrl,
} from "../../supabase/functions/_shared/ats-url-policy";

describe("ATS URL policy", () => {
  it("accepts provider-owned hosts with a usable tenant identifier", () => {
    expect(classifyAtsApplyUrl("https://job-boards.greenhouse.io/acme/jobs/123")).toMatchObject({
      type: "greenhouse",
      identifier: "acme",
      supported: true,
    });
    expect(classifyAtsApplyUrl("https://jobs.lever.co/acme/123")).toMatchObject({
      type: "lever",
      identifier: "acme",
      supported: true,
    });
    expect(classifyAtsApplyUrl("https://jobs.ashbyhq.com/acme/123")).toMatchObject({
      type: "ashby",
      identifier: "acme",
      supported: true,
    });
    expect(classifyAtsApplyUrl("https://apply.workable.com/acme/j/ABC123/")).toMatchObject({
      type: "workable",
      identifier: "acme",
      supported: true,
    });
  });

  it("rejects lookalike, userinfo, non-TLS, private, and incomplete URLs", () => {
    const rejected = [
      "https://evilgreenhouse.io/acme/jobs/123",
      "https://notlever.co/acme/123",
      "https://greenhouse.io.evil.example/acme/jobs/123",
      "https://jobs.lever.co@evil.example/acme/123",
      "http://jobs.lever.co/acme/123",
      "https://jobs.lever.co:8443/acme/123",
      "https://127.0.0.1/jobs/123",
      "https://10.0.0.2/jobs/123",
      "https://localhost/jobs/123",
      "https://jobs.lever.co/",
      "https://www.lever.co/acme/123",
      "https://support.greenhouse.io/hc/en-us/requests/new",
      "https://api.ashbyhq.com/jobPosting.list",
      "https://help.workable.com/hc/en-us/requests/new",
      "https://apply.workable.com/acme",
    ];
    for (const value of rejected) expect(classifyAtsApplyUrl(value).supported, value).toBe(false);
  });

  it("keeps unknown public HTTPS links manual-only", () => {
    expect(classifyAtsApplyUrl("https://careers.example.com/jobs/123")).toEqual({
      normalizedUrl: "https://careers.example.com/jobs/123",
      type: "manual",
      identifier: "",
      supported: false,
    });
  });

  it("uses an exact hostname boundary", () => {
    expect(hostnameMatchesDomain("jobs.lever.co", "lever.co")).toBe(true);
    expect(hostnameMatchesDomain("notlever.co", "lever.co")).toBe(false);
  });

  it("removes fragments from normalized manual links", () => {
    expect(normalizePublicHttpsUrl("https://careers.example.com/jobs/123#apply")).toBe(
      "https://careers.example.com/jobs/123",
    );
  });
});

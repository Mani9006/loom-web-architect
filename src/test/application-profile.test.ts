import { describe, expect, it } from "vitest";

import {
  buildApplypassPayload,
  computeCompleteness,
  emptyForm,
  formFromApplypass,
  prefillFromResume,
  splitLocation,
  type ApplicationProfileForm,
} from "@/lib/application-profile";

function fullForm(): ApplicationProfileForm {
  const form = emptyForm();
  form.phone = "+1 555 123 4567";
  form.country = "United States";
  form.city = "Austin";
  form.linkedinUrl = "https://www.linkedin.com/in/jane";
  form.currentCompany = "Acme Corp";
  form.currentTitle = "Senior Analyst";
  form.yearsExperience = "3-5";
  form.workAuthorization = "US Citizen";
  form.requiresSponsorship = "no";
  form.expectedSalary = "$140,000";
  form.discoverySource = "Job board";
  form.privacyConsent = true;
  return form;
}

describe("computeCompleteness", () => {
  it("counts only the eight worker-critical answers", () => {
    const empty = computeCompleteness(emptyForm());
    expect(empty.total).toBe(8);
    // Default country counts as answered; everything else starts blank.
    expect(empty.filled).toBe(1);
    expect(empty.percent).toBe(13);
  });

  it("reaches 100% when every worker-critical answer is present", () => {
    const result = computeCompleteness(fullForm());
    expect(result.filled).toBe(8);
    expect(result.percent).toBe(100);
  });

  it("does not count an unchecked privacy consent", () => {
    const form = fullForm();
    form.privacyConsent = false;
    expect(computeCompleteness(form).filled).toBe(7);
  });
});

describe("splitLocation", () => {
  it("maps US city/state locations to United States", () => {
    expect(splitLocation("Austin, TX")).toEqual({ city: "Austin", country: "United States" });
  });

  it("detects an explicit country", () => {
    expect(splitLocation("Toronto, Canada")).toEqual({ city: "Toronto", country: "Canada" });
  });
});

describe("prefillFromResume", () => {
  const resume = {
    personal_info: {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 555 000 1111",
      linkedin: "https://www.linkedin.com/in/janedoe",
      location: "Austin, TX",
      title: "Data Analyst",
    },
    experience: [{ company_or_client: "Acme Corp", role: "Senior Analyst" }],
  };

  it("fills empty fields from the latest resume", () => {
    const next = prefillFromResume(resume, emptyForm());
    expect(next.phone).toBe("+1 555 000 1111");
    expect(next.linkedinUrl).toBe("https://www.linkedin.com/in/janedoe");
    expect(next.currentCompany).toBe("Acme Corp");
    expect(next.currentTitle).toBe("Senior Analyst");
    expect(next.city).toBe("Austin");
    expect(next.country).toBe("United States");
  });

  it("never overwrites answers the user already stored", () => {
    const current = emptyForm();
    current.phone = "+1 999 888 7777";
    current.currentCompany = "Stored Inc";
    const next = prefillFromResume(resume, current);
    expect(next.phone).toBe("+1 999 888 7777");
    expect(next.currentCompany).toBe("Stored Inc");
  });
});

describe("buildApplypassPayload", () => {
  it("writes the exact profile keys career-ops-submit reads", () => {
    const stored = { fullName: "Jane Doe", email: "jane@example.com", portfolioUrl: "https://jane.dev", noticePeriod: "2 weeks" };
    const payload = buildApplypassPayload(fullForm(), stored, new Date("2026-07-21T00:00:00Z"));
    const profile = payload.profile as Record<string, unknown>;
    expect(profile.fullName).toBe("Jane Doe");
    expect(profile.email).toBe("jane@example.com");
    expect(profile.portfolioUrl).toBe("https://jane.dev");
    expect(profile.noticePeriod).toBe("2 weeks");
    expect(profile.phone).toBe("+1 555 123 4567");
    expect(profile.location).toBe("Austin, United States");
    expect(profile.currentTitle).toBe("Senior Analyst");
    expect(profile.currentCompany).toBe("Acme Corp");
    expect(profile.yearsExperience).toBe("3-5");
    expect(profile.linkedinUrl).toBe("https://www.linkedin.com/in/jane");
    expect(profile.expectedSalary).toBe("$140,000");
    expect(profile.workAuthorization).toBe("US Citizen");
    expect(profile.requiresSponsorship).toBe(false);
    expect(profile.discoverySource).toBe("Job board");
  });

  it("stores eeo, privacyConsent, consent and screening alongside profile", () => {
    const payload = buildApplypassPayload(fullForm(), {}, new Date("2026-07-21T00:00:00Z"));
    expect(payload.privacyConsent).toBe(true);
    expect((payload.consent as Record<string, unknown>).privacyConsent).toBe(true);
    const eeo = payload.eeo as Record<string, unknown>;
    expect(eeo.gender).toBe("Decline to self identify");
    expect(eeo.ethnicity).toBe("Decline to self identify");
    const screening = payload.screening as Record<string, unknown>;
    expect(screening.workAuthorization).toBe("US Citizen");
    expect(screening.requiresSponsorship).toBe(false);
    expect(screening.updatedAt).toBe("2026-07-21T00:00:00.000Z");
  });

  it("keeps a stored sponsorship answer when the user has not chosen one", () => {
    const form = fullForm();
    form.requiresSponsorship = "";
    const payload = buildApplypassPayload(form, { requiresSponsorship: true });
    expect((payload.profile as Record<string, unknown>).requiresSponsorship).toBe(true);
  });
});

describe("formFromApplypass round-trip", () => {
  it("restores saved answers including eeo and consent", () => {
    const form = fullForm();
    form.eeo.gender = "Female";
    const payload = buildApplypassPayload(form, { fullName: "Jane Doe" });
    const restored = formFromApplypass(payload);
    expect(restored.phone).toBe(form.phone);
    expect(restored.city).toBe("Austin");
    expect(restored.country).toBe("United States");
    expect(restored.requiresSponsorship).toBe("no");
    expect(restored.workAuthorization).toBe("US Citizen");
    expect(restored.privacyConsent).toBe(true);
    expect(restored.eeo.gender).toBe("Female");
    expect(computeCompleteness(restored).percent).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import { calculateResumeExperienceYears, inferApplicationProfileFromResume } from "@/lib/resume-profile-autofill";

describe("resume-first application profile", () => {
  const now = new Date("2026-07-18T00:00:00Z");

  it("calculates unioned experience without double-counting overlapping roles", () => {
    const years = calculateResumeExperienceYears([
      { start_date: "Jan 2022", end_date: "Present" },
      { start_date: "Jan 2023", end_date: "Dec 2024" },
    ], now);
    expect(years).toBeCloseTo(4.6, 1);
  });

  it("infers reusable identity and role targets from the complete resume", () => {
    const result = inferApplicationProfileFromResume({
      personal_info: { name: "Asha Rao", email: "asha@example.com", phone: "555-0100", location: "Austin, Texas", linkedin: "https://linkedin.com/in/asha" },
      experience: [
        { role: "Senior Data Engineer", company_or_client: "Acme", start_date: "Jan 2022", end_date: "Present" },
        { role: "Data Analyst", company_or_client: "Beta", start_date: "Jan 2020", end_date: "Dec 2021" },
      ],
    }, "account@example.com", now);
    expect(result.fullName).toBe("Asha Rao");
    expect(result.currentTitle).toBe("Senior Data Engineer");
    expect(result.targetRoles).toEqual(["Senior Data Engineer", "Data Analyst"]);
    expect(result.targetCountries).toEqual(["United States"]);
    expect(Number(result.yearsExperience)).toBeGreaterThan(6);
  });

  it("does not mistake a resume filename for a target role", () => {
    const result = inferApplicationProfileFromResume({ title: "Asha_Rao_Resume_2026" }, "asha@example.com", now);
    expect(result.currentTitle).toBe("");
    expect(result.targetRoles).toEqual([]);
  });
});

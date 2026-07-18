import { describe, expect, it } from "vitest";
import {
  buildCandidateCareerProfile,
  calculateExperienceYears,
  evaluateCareerFit,
  isRoleFamilyCompatible,
} from "../../supabase/functions/_shared/career-fit";

const fourYearResume = {
  personal_info: { title: "Software Engineer" },
  experience: [
    {
      role: "Software Engineer",
      company: "Acme",
      start_date: "Jul 2022",
      end_date: "Present",
      bullets: ["Built React and TypeScript products on AWS."],
    },
  ],
  skills: { languages: ["TypeScript", "JavaScript"], cloud: ["AWS"], frontend: ["React"] },
};

describe("career fit gate", () => {
  it("counts a resume timeline without double-counting overlapping roles", () => {
    const years = calculateExperienceYears([
      { start_date: "Jan 2020", end_date: "Dec 2022" },
      { start_date: "Jan 2022", end_date: "Dec 2023" },
    ], new Date("2026-07-01T00:00:00Z"));

    expect(years).toBe(4);
  });

  it("blocks a director role for a four-year individual-contributor resume", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Software Engineer"],
      work_modes: ["remote", "hybrid"],
      seniority_levels: ["mid", "senior"],
      max_stretch_years: 2,
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Director of Software Engineering",
      company: "Example Corp",
      location: "Remote - US",
      remotePolicy: "Remote",
      description: "Lead the engineering organization. Requires 10+ years of experience with React, TypeScript, and AWS.",
    });

    expect(fit.eligible).toBe(false);
    expect(fit.score).toBeLessThan(55);
    expect(fit.hardFilters.join(" ")).toMatch(/director|experience/i);
  });

  it("scores an evidence-backed role highly and exposes dimension evidence", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Frontend Engineer", "Software Engineer"],
      work_modes: ["remote"],
      seniority_levels: ["mid", "senior"],
      max_stretch_years: 2,
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Senior Frontend Engineer",
      location: "United States - Remote",
      remotePolicy: "Remote",
      compensationText: "$130,000 - $170,000",
      description: "Build React applications with TypeScript and JavaScript on AWS. Requires 4+ years of experience.",
    });

    expect(fit.eligible).toBe(true);
    expect(fit.score).toBeGreaterThanOrEqual(80);
    expect(fit.matchedSkills).toEqual(expect.arrayContaining(["react", "typescript", "aws"]));
    expect(fit.dimensions).toHaveLength(6);
    expect(fit.inferred.salaryMin).toBe(130_000);
    expect(fit.inferred.salaryMax).toBe(170_000);
  });

  it("uses prior client roles and tool evidence instead of only the current title", () => {
    const candidate = buildCandidateCareerProfile({
      personal_info: { title: "Business Systems Analyst" },
      experience: [
        {
          role: "Business Systems Analyst",
          company_or_client: "Current Client",
          start_date: "Jan 2025",
          end_date: "Present",
          bullets: ["Translated reporting requirements for finance stakeholders."],
        },
        {
          role: "Data Engineer",
          company_or_client: "Prior Client",
          start_date: "Jan 2020",
          end_date: "Dec 2024",
          bullets: ["Built production pipelines with Python, SQL, Airflow, and AWS."],
          environment: "Python, SQL, Airflow, AWS",
        },
      ],
      skills: { data: ["Python", "SQL", "Airflow"], cloud: ["AWS"] },
    }, { years_of_experience: 6.5 });

    const fit = evaluateCareerFit(candidate, {
      title: "Senior Data Engineer",
      location: "Remote - United States",
      remotePolicy: "Remote",
      description: "Build Python and SQL data pipelines using Airflow on AWS. Requires 6+ years of experience.",
    });

    expect(candidate.roleHistory.map((role) => role.title)).toContain("Data Engineer");
    expect(candidate.yearsExperience).toBe(6.5);
    expect(candidate.yearsExperienceSource).toBe("profile");
    expect(fit.score).toBeGreaterThanOrEqual(80);
    expect(fit.dimensions.find((dimension) => dimension.key === "role")?.evidence.join(" ")).toMatch(/Prior Client/);
    expect(fit.dimensions.find((dimension) => dimension.key === "skills")?.evidence.join(" ")).toMatch(/Prior Client/);
  });

  it("blocks a no-sponsorship posting when sponsorship is required", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Software Engineer"],
      work_modes: ["remote"],
      requires_sponsorship: true,
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Software Engineer",
      remotePolicy: "Remote",
      description: "Applicants must be authorized to work in the United States. We are unable to provide visa sponsorship.",
    });

    expect(fit.eligible).toBe(false);
    expect(fit.hardFilters.join(" ")).toMatch(/sponsorship/i);
  });

  it("treats full-time portal labels as the selected full_time preference", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Software Engineer"],
      work_modes: ["remote"],
      employment_types: ["full_time", "contract"],
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Software Engineer",
      remotePolicy: "Remote",
      employmentType: "Full-time",
      description: "Build React and TypeScript products on AWS. Requires 4+ years of experience.",
    });

    expect(fit.eligible).toBe(true);
    expect(fit.hardFilters.join(" ")).not.toMatch(/employment types/i);
  });

  it("blocks onsite jobs when the candidate selected remote only", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Software Engineer"],
      work_modes: ["remote"],
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Software Engineer",
      location: "Austin, TX",
      remotePolicy: "On-site",
      description: "Work from our Austin office five days per week.",
    });

    expect(fit.eligible).toBe(false);
    expect(fit.hardFilters.join(" ")).toMatch(/onsite/i);
  });

  it("blocks a role in a different country even when it says remote", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Software Engineer"],
      target_countries: ["United States"],
      work_modes: ["remote"],
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Software Engineer",
      location: "Toronto, Canada (Remote)",
      remotePolicy: "Remote in Canada",
      description: "This remote role is open to candidates located in Canada.",
    });

    expect(fit.eligible).toBe(false);
    expect(fit.inferred.country).toBe("canada");
    expect(fit.hardFilters.join(" ")).toMatch(/country|canada/i);
  });

  it("recognizes city-only international locations before applying country preferences", () => {
    const candidate = buildCandidateCareerProfile(fourYearResume, {
      target_roles: ["Software Engineer"],
      target_countries: ["United States"],
      work_modes: ["remote"],
    });
    const fit = evaluateCareerFit(candidate, {
      title: "Software Engineer",
      location: "London, UK",
      remotePolicy: "Remote in the UK",
      description: "Build React services for customers across England.",
    });

    expect(fit.inferred.country).toBe("united kingdom");
    expect(fit.eligible).toBe(false);
    expect(fit.hardFilters.join(" ")).toMatch(/outside selected countries/i);
  });

  it("does not let generic AI skills authorize an unsupported sales career switch", () => {
    expect(isRoleFamilyCompatible(
      "Account Executive, AI Sales",
      ["Senior AI Engineer", "Data Scientist", "Machine Learning Engineer"],
    )).toBe(false);
    expect(isRoleFamilyCompatible(
      "Account Executive, AI Sales",
      ["Sales Engineer", "Account Executive"],
    )).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { calculateATSScore } from "@/lib/ats-scorer";
import {
  computeResumeQualityScore,
  deterministicAnalysis,
  scoreResumeDeterministic,
} from "../../supabase/functions/_shared/ats-deterministic";
import type { ResumeJSON } from "@/types/resume";

const structuredResume = {
  personal_info: {
    fullName: "Avery Candidate",
    title: "Platform Engineer",
    location: "Chicago, IL",
  },
  summary: "Platform engineer delivering reliable cloud services and measurable developer productivity improvements.",
  experience: [{
    role: "Platform Engineer",
    company_or_client: "Example Co",
    bullets: [
      "Automated Kubernetes deployment workflows and reduced release lead time by 35 percent across 20 services.",
      "Built TypeScript observability tooling that improved incident detection coverage for production systems.",
    ],
  }],
  education: [{ degree: "BS Computer Science", institution: "Example University" }],
  skills: {
    programming_languages: ["TypeScript", "Python", "SQL"],
    cloud_devops: ["Kubernetes", "Docker", "AWS", "Terraform"],
  },
};

const builderResume = {
  header: {
    name: "Avery Candidate",
    email: "avery@example.com",
    phone: "312-555-0123",
    location: "Chicago, IL",
    linkedin: "https://linkedin.com/in/avery",
  },
  summary: "Platform engineer with extensive experience delivering reliable cloud services and measurable developer productivity improvements.",
  experience: [{
    id: "exp-1",
    company: "Example Co",
    role: "Platform Engineer",
    location: "Chicago, IL",
    startDate: "Jan 2022",
    endDate: "Present",
    current: true,
    bullets: [
      "Automated Kubernetes deployment workflows and reduced release lead time by 35% across 20 services.",
      "Built TypeScript observability tooling that improved incident detection coverage for production systems.",
    ],
  }],
  education: [{
    id: "edu-1",
    institution: "Example University",
    degree: "BS Computer Science",
    location: "Chicago, IL",
    graduationDate: "May 2021",
  }],
  skills: { cloud: ["Kubernetes", "Docker", "AWS", "Terraform"], languages: ["TypeScript", "Python", "SQL", "Bash"] },
  projects: [],
  certifications: [],
  sectionOrder: ["summary", "experience", "education", "skills"],
} as unknown as ResumeJSON;

describe("ATS score truth model", () => {
  it("keeps generic résumé quality independent from the target JD", () => {
    const first = scoreResumeDeterministic(structuredResume, ["Kubernetes", "TypeScript"]);
    const second = scoreResumeDeterministic(structuredResume, ["Registered nurse", "Epic"]);

    expect(first.resume_quality_score).toBe(second.resume_quality_score);
    expect(first.resume_quality_score).toBe(computeResumeQualityScore(deterministicAnalysis(structuredResume)));
    expect(first.job_match_score).not.toBe(second.job_match_score);
  });

  it("publishes JD requirement coverage as the effective job-scoped score", () => {
    const score = scoreResumeDeterministic(
      structuredResume,
      ["Kubernetes", "TypeScript", "Terraform", "Registered nurse"],
    );

    expect(score.score_kind).toBe("job_match");
    expect(score.job_match_basis).toBe("jd_requirement_coverage");
    expect(score.job_match_score).toBe(75);
    expect(score.overall).toBe(score.job_match_score);
    expect(score.matched_keywords).toEqual(["Kubernetes", "TypeScript", "Terraform"]);
    expect(score.missing_keywords).toEqual(["Registered nurse"]);
  });

  it("marks job match unavailable, rather than zero, when there is no JD", () => {
    const score = scoreResumeDeterministic(structuredResume, []);

    expect(score.score_kind).toBe("resume_quality");
    expect(score.job_match_score).toBeNull();
    expect(score.job_match_basis).toBeNull();
    expect(score.overall).toBe(score.resume_quality_score);
  });

  it("prevents the client quality preview from impersonating a JD match", () => {
    const quality = calculateATSScore(builderResume);
    expect(quality.scoreKind).toBe("resume_quality");
    expect(quality.jobMatchScore).toBeNull();
    expect(quality.methodologyVersion).toBe("resume-quality-v2");

    expect(() => calculateATSScore(builderResume, "Kubernetes platform engineer ".repeat(10)))
      .toThrow(/career-ops-ats/);
  });
});

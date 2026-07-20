import { describe, expect, it } from "vitest";
import { normalizeResumeSkills } from "@/lib/resume-skills";

describe("canonical resume skills", () => {
  it("turns a duplicated catch-all import into compact evidence-based categories", () => {
    const normalized = normalizeResumeSkills({
      Tools: [
        "Python, SQL, AWS, Docker, Kubernetes, Git, PyTorch, LangGraph, Airflow, PostgreSQL, FastAPI, pytest, Power BI",
      ],
      DevOps: ["Docker", "Kubernetes", "Git", "CI/CD"],
      "Cloud & MLOps": ["AWS", "MLflow", "Docker"],
      "Soft Skills": ["workflow orchestration", "state management", "guardrails", "Communication"],
      "Project Management": ["acceptance criteria, test coverage, deployment readiness reviews"],
    });

    expect(normalized).toEqual({
      programming_languages: ["Python", "SQL"],
      ai_ml: ["PyTorch", "LangGraph", "MLflow", "guardrails"],
      data_engineering: ["Apache Airflow", "workflow orchestration"],
      cloud_devops: ["AWS", "Docker", "Kubernetes", "CI/CD"],
      databases: ["PostgreSQL"],
      frameworks_apis: ["FastAPI", "state management"],
      analytics_bi: ["Power BI"],
      testing_observability: ["pytest", "test coverage"],
      delivery_methods: ["acceptance criteria"],
      tools_platforms: ["Git"],
    });

    const all = Object.values(normalized).flat().map((skill) => skill.toLowerCase());
    expect(all.length).toBe(new Set(all).size);
    expect(all).not.toContain("communication");
    expect(all).not.toContain("deployment readiness reviews");
  });

  it("keeps unknown concrete source skills without dumping known technologies into Tools", () => {
    expect(normalizeResumeSkills({ tools: ["Proprietary Risk Engine", "React", "MongoDB", "Selenium"] })).toEqual({
      databases: ["MongoDB"],
      frameworks_apis: ["React"],
      testing_observability: ["Selenium"],
      tools_platforms: ["Proprietary Risk Engine"],
    });
  });
});

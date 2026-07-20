import { describe, expect, it } from "vitest";
import {
  collectImpactBullets,
  computeImpactScore,
  extractEntryBullets,
  isQuantifiedBullet,
} from "../../supabase/functions/_shared/ats-impact";

const strongMlResume = {
  summary: "ML engineer with 6 years shipping production models.",
  experience: [
    {
      role: "Machine Learning Engineer",
      company_or_client: "Acme AI",
      bullets: [
        "Reduced model inference latency by 43% by quantizing transformer checkpoints.",
        "Scaled a feature store to 10M+ daily events on Kubernetes.",
        "Led a team of 4 engineers building the retraining pipeline.",
        "Partnered with product to define evaluation criteria for ranking models.",
        "Automated dataset validation, cutting labeling rework by half across releases.",
      ],
    },
    {
      role: "Data Scientist",
      company_or_client: "DataCo",
      bullets: [
        "Improved churn prediction AUC from 0.71 to 0.84.",
        "Presented findings to executive stakeholders.",
        "Built dashboards for campaign analysis.",
      ],
    },
  ],
  projects: [
    {
      title: "Open-source RAG toolkit",
      bullets: ["Grew adoption to 2,000 GitHub stars in six months."],
    },
  ],
};

describe("ats impact scoring", () => {
  it("gives a strong quantified resume full impact credit", () => {
    const result = computeImpactScore(collectImpactBullets(strongMlResume));
    // 5 of 9 bullets carry metrics — comfortably past the 40% full-credit bar.
    expect(result.total).toBe(9);
    expect(result.quantified).toBeGreaterThanOrEqual(5);
    expect(result.score).toBe(100);
  });

  it("scales linearly below the 40% full-credit ratio", () => {
    const bullets = [
      "Cut infra spend by 30%.",
      "Maintained CI pipelines.",
      "Collaborated with design.",
      "Wrote onboarding documentation.",
      "Reviewed pull requests.",
    ];
    // 1/5 quantified = 20% ratio → half of full credit.
    expect(computeImpactScore(bullets).score).toBe(50);
  });

  it("scores zero for no bullets and low for unquantified bullets", () => {
    expect(computeImpactScore([]).score).toBe(0);
    const unquantified = computeImpactScore([
      "Responsible for backend services.",
      "Worked on internal tooling.",
    ]);
    expect(unquantified.quantified).toBe(0);
    expect(unquantified.score).toBe(0);
  });

  it("extracts bullets stored as editor objects", () => {
    const bullets = extractEntryBullets({
      bullets: [{ text: "Shipped 12 experiments per quarter." }, { text: "Mentored new hires." }],
    });
    expect(bullets).toEqual([
      "Shipped 12 experiments per quarter.",
      "Mentored new hires.",
    ]);
  });

  it("splits a multi-line description block into individual bullets", () => {
    const bullets = extractEntryBullets({
      description: "Reduced costs by 18%\nLed migration to Kubernetes\n• Grew team from 3 to 9",
    });
    expect(bullets).toHaveLength(3);
    const result = computeImpactScore(bullets);
    expect(result.quantified).toBe(2);
    expect(result.score).toBe(100);
  });

  it("counts quantified achievements that live in the projects section", () => {
    const resume = {
      experience: [{ role: "Engineer", bullets: ["Maintained internal platform tooling."] }],
      projects: [{ title: "Benchmarks", bullets: ["Doubled throughput on the eval harness."] }],
    };
    const result = computeImpactScore(collectImpactBullets(resume));
    expect(result.total).toBe(2);
    expect(result.quantified).toBe(1);
    expect(result.score).toBe(100);
  });

  it("recognizes spelled-out and symbolic metrics", () => {
    expect(isQuantifiedBullet("Saved $2M annually")).toBe(true);
    expect(isQuantifiedBullet("Tripled conversion across onboarding")).toBe(true);
    expect(isQuantifiedBullet("Processed millions of records nightly")).toBe(true);
    expect(isQuantifiedBullet("Improved reliability of the platform")).toBe(false);
  });
});

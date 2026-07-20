import { describe, expect, it } from "vitest";

import {
  buildTailoringChanges,
  bulletSimilarity,
  computeKeywordDelta,
  pairBullets,
  TailoringReportRequestError,
  validateTailorReportRequest,
  wordDiff,
} from "../../supabase/functions/_shared/tailoring-report-core.ts";

// ── Request validation (career-ops-tailor-report) ───────────────────────────

describe("validateTailorReportRequest", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts a valid draft_application_id", () => {
    expect(validateTailorReportRequest({ draft_application_id: uuid })).toEqual({
      draft_application_id: uuid,
      refresh: false,
    });
  });

  it("trims whitespace and honors the refresh flag", () => {
    const parsed = validateTailorReportRequest({ draft_application_id: ` ${uuid} `, refresh: true });
    expect(parsed.draft_application_id).toBe(uuid);
    expect(parsed.refresh).toBe(true);
  });

  it("passes through a valid service user_id", () => {
    const parsed = validateTailorReportRequest({ draft_application_id: uuid, user_id: uuid });
    expect(parsed.user_id).toBe(uuid);
  });

  it("drops an invalid user_id instead of failing the request", () => {
    const parsed = validateTailorReportRequest({ draft_application_id: uuid, user_id: "not-a-uuid" });
    expect(parsed.user_id).toBeUndefined();
  });

  it.each([
    ["missing body", undefined],
    ["null body", null],
    ["array body", []],
    ["missing id", {}],
    ["empty id", { draft_application_id: "  " }],
    ["non-string id", { draft_application_id: 42 }],
    ["malformed uuid", { draft_application_id: "abc" }],
  ])("rejects %s with a 400", (_label, body) => {
    try {
      validateTailorReportRequest(body);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TailoringReportRequestError);
      expect((error as TailoringReportRequestError).status).toBe(400);
    }
  });
});

// ── Word-level diff ─────────────────────────────────────────────────────────

describe("wordDiff", () => {
  it("marks identical text as all same", () => {
    const { before, after } = wordDiff("Led the team", "Led the team");
    expect(before.every((t) => t.kind === "same")).toBe(true);
    expect(after.every((t) => t.kind === "same")).toBe(true);
  });

  it("marks inserted words as added on the after side", () => {
    const { after } = wordDiff("Led team", "Led the team");
    expect(after.some((t) => t.kind === "added" && t.text.includes("the"))).toBe(true);
  });

  it("marks deleted words as removed on the before side", () => {
    const { before } = wordDiff("Led the big team", "Led team");
    const removed = before.filter((t) => t.kind === "removed").map((t) => t.text).join("");
    expect(removed).toContain("the");
    expect(removed).toContain("big");
  });

  it("handles a full rewrite without crashing", () => {
    const { before, after } = wordDiff("alpha beta gamma", "delta epsilon");
    expect(before.every((t) => t.kind !== "added")).toBe(true);
    expect(after.every((t) => t.kind !== "removed")).toBe(true);
    expect(after.map((t) => t.text).join("")).toContain("delta");
  });

  it("handles empty inputs", () => {
    expect(wordDiff("", "").before).toEqual([]);
    expect(wordDiff("", "new").after.some((t) => t.kind === "added")).toBe(true);
    expect(wordDiff("old", "").before.some((t) => t.kind === "removed")).toBe(true);
  });
});

// ── Bullet pairing ──────────────────────────────────────────────────────────

describe("pairBullets / bulletSimilarity", () => {
  it("pairs rephrased bullets by similarity, not position", () => {
    const master = ["Built data pipeline processing 2M events daily", "Mentored 4 junior engineers"];
    const tailored = ["Mentored four junior engineers on the team", "Built data pipeline processing 2M events daily with Kafka"];
    const pairs = pairBullets(master, tailored);
    expect(pairs[0]).toEqual([0, 1]);
    expect(pairs[1]).toEqual([1, 0]);
  });

  it("returns null for bullets with no reasonable master match", () => {
    const pairs = pairBullets(["Shipped React dashboard"], ["Orchestrated Kubernetes rollout"]);
    expect(pairs[0][1]).toBeNull();
  });

  it("scores identical text at 1 and disjoint text at 0", () => {
    expect(bulletSimilarity("built a thing", "built a thing")).toBe(1);
    expect(bulletSimilarity("alpha beta", "gamma delta")).toBe(0);
  });
});

// ── Change builder ──────────────────────────────────────────────────────────

const masterResume = {
  id: "master-1",
  summary: "Engineer with 6 years building backend systems.",
  experience: [
    {
      id: "exp-1",
      role: "Senior Engineer",
      company_or_client: "Acme",
      bullets: [
        "Built data pipeline processing 2M events daily",
        "Mentored 4 junior engineers",
      ],
    },
    {
      id: "exp-2",
      role: "Engineer",
      company_or_client: "Beta",
      bullets: ["Shipped internal tooling for support teams"],
    },
  ],
  skills: { programming_languages: ["Python", "Go"] },
  projects: [],
};

const tailoredResume = {
  id: "tailored-1",
  summary: "Senior engineer with 6 years building distributed backend systems and Kubernetes platforms.",
  experience: [
    {
      id: "exp-2",
      role: "Engineer",
      company_or_client: "Beta",
      bullets: ["Shipped internal tooling for support teams"],
    },
    {
      id: "exp-1",
      role: "Senior Engineer",
      company_or_client: "Acme",
      bullets: [
        "Built Kubernetes data pipeline processing 2M events daily",
        "Mentored 4 junior engineers",
      ],
    },
  ],
  skills: { programming_languages: ["Go", "Python"] },
  projects: [],
};

describe("buildTailoringChanges", () => {
  it("flags a rewritten summary and tags introduced JD keywords", () => {
    const changes = buildTailoringChanges(masterResume, tailoredResume, ["Kubernetes", "distributed"]);
    const summary = changes.find((c) => c.type === "summary_rewritten");
    expect(summary).toBeDefined();
    expect(summary!.section).toBe("summary");
    expect(summary!.before).toContain("backend systems");
    expect(summary!.after).toContain("Kubernetes");
    expect(summary!.jd_keywords).toContain("Kubernetes");
  });

  it("matches entries by stable id even when entry order changes", () => {
    const changes = buildTailoringChanges(masterResume, tailoredResume, ["Kubernetes"]);
    const acmeChanges = changes.filter((c) => c.entry_id === "exp-1");
    // Only the rephrased pipeline bullet should surface for exp-1.
    expect(acmeChanges).toHaveLength(1);
    expect(acmeChanges[0].type).toBe("bullet_rephrased");
    expect(acmeChanges[0].before).toContain("2M events");
    expect(acmeChanges[0].after).toContain("Kubernetes");
    expect(acmeChanges[0].jd_keywords).toEqual(["Kubernetes"]);
    // exp-2 bullets are untouched.
    expect(changes.filter((c) => c.entry_id === "exp-2")).toHaveLength(0);
  });

  it("detects a pure bullet reorder as bullet_reordered", () => {
    const tailored = {
      ...tailoredResume,
      experience: [{
        id: "exp-1",
        role: "Senior Engineer",
        company_or_client: "Acme",
        bullets: [...masterResume.experience[0].bullets].reverse(),
      }],
    };
    const changes = buildTailoringChanges(masterResume, tailored, []);
    expect(changes.some((c) => c.type === "bullet_reordered" && c.entry_id === "exp-1")).toBe(true);
    expect(changes.some((c) => c.type === "bullet_rephrased")).toBe(false);
  });

  it("classifies brand-new JD-keyword bullets as keyword_added", () => {
    const tailored = {
      ...tailoredResume,
      experience: [{
        id: "exp-1",
        role: "Senior Engineer",
        company_or_client: "Acme",
        bullets: [...masterResume.experience[0].bullets, "Operated Kubernetes clusters across 3 regions"],
      }],
    };
    const changes = buildTailoringChanges(masterResume, tailored, ["Kubernetes"]);
    const added = changes.find((c) => c.type === "keyword_added");
    expect(added).toBeDefined();
    expect(added!.before).toBeNull();
    expect(added!.after).toContain("Kubernetes");
    expect(added!.jd_keywords).toEqual(["Kubernetes"]);
  });

  it("detects skills reordering when the set is unchanged", () => {
    const changes = buildTailoringChanges(masterResume, tailoredResume, []);
    expect(changes.some((c) => c.type === "skills_reordered")).toBe(true);
  });

  it("emits section_added when the master had no summary", () => {
    const master = { ...masterResume, summary: "" };
    const changes = buildTailoringChanges(master, tailoredResume, []);
    expect(changes.some((c) => c.type === "section_added" && c.section === "summary")).toBe(true);
  });

  it("returns no changes for identical resumes", () => {
    expect(buildTailoringChanges(masterResume, masterResume, [])).toEqual([]);
  });
});

// ── Keyword delta ───────────────────────────────────────────────────────────

describe("computeKeywordDelta", () => {
  it("buckets matched keywords into added vs covered_now", () => {
    const masterText = "Senior engineer skilled in Python and Postgres at scale. Built pipelines.";
    const delta = computeKeywordDelta(["Python", "Kubernetes", "Postgres"], ["Rust"], masterText);
    expect(delta.covered_now).toEqual(["Python", "Postgres"]);
    expect(delta.added).toEqual(["Kubernetes"]);
    expect(delta.still_missing).toEqual(["Rust"]);
  });

  it("matches multi-word keywords against master text", () => {
    const delta = computeKeywordDelta(["machine learning"], [], "Experience with machine learning systems.");
    expect(delta.covered_now).toEqual(["machine learning"]);
    expect(delta.added).toEqual([]);
  });

  it("is case-insensitive", () => {
    const delta = computeKeywordDelta(["AWS"], [], "deployed on aws");
    expect(delta.covered_now).toEqual(["AWS"]);
  });

  it("handles empty inputs", () => {
    expect(computeKeywordDelta([], [], "")).toEqual({ added: [], covered_now: [], still_missing: [] });
  });
});

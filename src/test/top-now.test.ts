import { describe, expect, it } from "vitest";
import { selectAppliableNow, selectTopNow } from "@/lib/top-now";

// Pool arrives pre-sorted by fit_score desc (eligible, fit >= 50) from the query.
const pool = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
  { id: "e" },
  { id: "f" },
  { id: "g" },
];

describe("selectTopNow", () => {
  it("keeps the five highest-fit evaluations", () => {
    expect(selectTopNow(pool, []).map((match) => match.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("drops evaluations with a submitted draft and pulls the next one up", () => {
    const drafts = [
      { evaluation_id: "b", status: "submitted" },
      { evaluation_id: "d", status: "submitted" },
    ];
    expect(selectTopNow(pool, drafts).map((match) => match.id)).toEqual(["a", "c", "e", "f", "g"]);
  });

  it("keeps evaluations whose draft is still in flight", () => {
    const drafts = [
      { evaluation_id: "a", status: "queued" },
      { evaluation_id: "b", status: "draft" },
      { evaluation_id: "c", status: "failed" },
    ];
    expect(selectTopNow(pool, drafts).map((match) => match.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ignores drafts without an evaluation link", () => {
    const drafts = [{ evaluation_id: null, status: "submitted" }];
    expect(selectTopNow(pool, drafts).map((match) => match.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("selectAppliableNow", () => {
  it("returns only cards with no draft packet yet", () => {
    const drafts = [
      { evaluation_id: "a", status: "ready" },
      { evaluation_id: "b", status: "queued" },
      { evaluation_id: null, status: "draft" },
    ];
    expect(selectAppliableNow(pool.slice(0, 5), drafts).map((match) => match.id)).toEqual(["c", "d", "e"]);
  });

  it("returns everything when nothing has been drafted", () => {
    expect(selectAppliableNow(pool.slice(0, 5), []).map((match) => match.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

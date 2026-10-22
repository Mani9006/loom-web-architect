import { describe, expect, it } from "vitest";
import { deriveBoardStatus, toBoardRow, type BoardDraft } from "@/lib/application-board";
import { productTabCounts, rowMatchesProductTab } from "@/product/lib/application-tabs";

function draft(status: string): BoardDraft {
  return {
    id: "d1",
    status,
    error_message: null,
    submitted_at: status === "submitted" ? "2026-08-23T00:00:00Z" : null,
    created_at: "2026-08-23T00:00:00Z",
    updated_at: "2026-08-23T00:00:00Z",
    applypass_task_id: null,
    tailored_resume_id: "r1",
    tailored_cv_md: "# x",
    answers: [],
    evaluation: { scanned_job: { title: "AE", company: { name: "Acme" } } },
  };
}

describe("product application tabs", () => {
  it("splits submitted out of in-flight", () => {
    const submitted = toBoardRow(draft("submitted"), new Map());
    const queued = toBoardRow(draft("queued"), new Map());
    expect(rowMatchesProductTab(submitted, "submitted")).toBe(true);
    expect(rowMatchesProductTab(submitted, "in_flight")).toBe(false);
    expect(rowMatchesProductTab(queued, "in_flight")).toBe(true);
    const counts = productTabCounts([submitted, queued]);
    expect(counts.submitted).toBe(1);
    expect(counts.in_flight).toBe(1);
  });

  it("keeps deriveBoardStatus submitted key", () => {
    expect(deriveBoardStatus(draft("submitted"), null).key).toBe("submitted");
  });
});

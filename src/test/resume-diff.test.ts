import { describe, expect, it } from "vitest";
import { applyLifecycleLabel, diffResumeText } from "@/lib/resume-diff";

describe("resume diff", () => {
  it("rewrites a matching bullet as removed then added", () => {
    const rows = diffResumeText(
      "- Built dashboards for sales\n- Hired two analysts",
      "- Built Looker dashboards for US sales ops\n- Hired two analysts",
    );
    expect(rows.some((row) => row.kind === "removed" && /dashboards/i.test(row.text))).toBe(true);
    expect(rows.some((row) => row.kind === "added" && /Looker/i.test(row.text))).toBe(true);
    expect(rows.some((row) => row.kind === "same" && /Hired/i.test(row.text))).toBe(true);
  });

  it("labels the cloud apply lifecycle", () => {
    expect(applyLifecycleLabel("queued")).toMatch(/queue/i);
    expect(applyLifecycleLabel("draft")).toMatch(/tailor/i);
    expect(applyLifecycleLabel("submitted")).toMatch(/receipt/i);
  });
});

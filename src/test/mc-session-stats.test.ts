import { describe, expect, it } from "vitest";
import { computeSessionStats } from "@/lib/mc-session-stats";

describe("computeSessionStats", () => {
  it("counts progressed jobs as applied and offers as interviews", () => {
    const stats = computeSessionStats([
      { session_id: "a", status: "discovered" },
      { session_id: "a", status: "applied" },
      { session_id: "a", status: "interview" },
      { session_id: "a", status: "offer" },
      { session_id: "a", status: "rejected" },
      { session_id: "b", status: "take_home" },
    ]);
    expect(stats.a).toEqual({ discovered: 5, applied: 3, interviews: 2 });
    expect(stats.b).toEqual({ discovered: 1, applied: 1, interviews: 1 });
  });
});

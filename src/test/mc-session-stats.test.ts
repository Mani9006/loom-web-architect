import { describe, it, expect } from "vitest";
import { computeSessionStats } from "@/lib/mc-session-stats";

describe("computeSessionStats", () => {
  it("counts jobs that progressed past applied as applied, and offers as interviews", () => {
    const stats = computeSessionStats(
      [
        { session_id: "a", status: "saved" },
        { session_id: "a", status: "applied" },
        { session_id: "a", status: "interview" },
        { session_id: "a", status: "offer" },
        { session_id: "a", status: "rejected" },
        { session_id: "b", status: "take_home" },
      ],
      ["a", "b", "c"],
    );
    expect(stats.a).toEqual({ discovered: 5, applied: 3, interviews: 2 });
    expect(stats.b).toEqual({ discovered: 1, applied: 1, interviews: 1 });
    expect(stats.c).toEqual({ discovered: 0, applied: 0, interviews: 0 });
  });

  it("ignores rows for unknown sessions", () => {
    expect(computeSessionStats([{ session_id: "x", status: "applied" }], ["a"]).a.applied).toBe(0);
  });
});

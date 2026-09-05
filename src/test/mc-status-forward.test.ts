import { describe, expect, it } from "vitest";
import { isForwardStatusMove } from "../../supabase/functions/_shared/status-forward";

// Regression: STATUS_RANK didn't have entries for "hold"/"withdrawn", so a
// missing-key lookup fell back to -1, making those user-deliberate states
// look like the lowest possible rank. A later, out-of-order email (e.g. a
// stale "application received" confirmation) would then pass as a forward
// move and silently pull the job back into the pipeline.
describe("mc-gmail-poll isForwardStatusMove", () => {
  it("never forwards out of a manually held job", () => {
    expect(isForwardStatusMove("hold", "viewed")).toBe(false);
    expect(isForwardStatusMove("hold", "interview")).toBe(false);
    expect(isForwardStatusMove("hold", "rejected")).toBe(false);
    expect(isForwardStatusMove("hold", "offer")).toBe(false);
  });

  it("never forwards out of a manually withdrawn job", () => {
    expect(isForwardStatusMove("withdrawn", "viewed")).toBe(false);
    expect(isForwardStatusMove("withdrawn", "interview")).toBe(false);
    expect(isForwardStatusMove("withdrawn", "rejected")).toBe(false);
  });

  it("still allows normal forward moves through the funnel", () => {
    expect(isForwardStatusMove("applied", "viewed")).toBe(true);
    expect(isForwardStatusMove("viewed", "interview")).toBe(true);
    expect(isForwardStatusMove("interview", "offer")).toBe(true);
  });

  it("still blocks backward/duplicate moves in the normal funnel", () => {
    expect(isForwardStatusMove("interview", "viewed")).toBe(false);
    expect(isForwardStatusMove("applied", "applied")).toBe(false);
  });

  it("always allows rejected/offer as terminal outcomes", () => {
    expect(isForwardStatusMove("saved", "rejected")).toBe(true);
    expect(isForwardStatusMove("interview", "offer")).toBe(true);
  });
});

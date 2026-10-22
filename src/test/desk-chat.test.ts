import { describe, expect, it } from "vitest";
import { canAutoApplyFromChat, planDeskTurn } from "@/lib/desk-chat";

describe("desk chat planner", () => {
  it("refuses invented history and fake submits", () => {
    expect(planDeskTurn("invent two extra jobs on my resume", { handsOffEnabled: false }).name).toBe("refuse");
    expect(planDeskTurn("mark this submitted even if it failed", { handsOffEnabled: true }).name).toBe("refuse");
  });

  it("maps apply / inbox / hands-off / matches", () => {
    expect(planDeskTurn("apply this greenhouse role", { handsOffEnabled: false }).name).toBe("apply_one_job");
    expect(planDeskTurn("summarize my inbox", { handsOffEnabled: false }).name).toBe("summarize_inbox");
    expect(planDeskTurn("raise the daily cap", { handsOffEnabled: true }).name).toBe("tune_hands_off");
    expect(planDeskTurn("show US product manager matches", { handsOffEnabled: false }).name).toBe("search_matches");
  });

  it("never auto-applies from chat without enablement or an explicit click", () => {
    expect(canAutoApplyFromChat(false, false)).toBe(false);
    expect(canAutoApplyFromChat(true, false)).toBe(true);
    expect(canAutoApplyFromChat(false, true)).toBe(true);
  });
});

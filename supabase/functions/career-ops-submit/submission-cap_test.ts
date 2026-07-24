import { assertEquals } from "jsr:@std/assert@1";
import { evaluateSubmissionCap } from "./submission-cap.ts";

Deno.test("completed non-submissions do not consume a daily slot", () => {
  assertEquals(evaluateSubmissionCap({
    submittedToday: 0,
    activeReservedSlots: 0,
    dailyLimit: 25,
  }), {
    allowed: true,
    usedSlots: 0,
    dailyLimit: 25,
  });
});

Deno.test("receipt-backed submissions and active tasks reserve the cap", () => {
  assertEquals(evaluateSubmissionCap({
    submittedToday: 23,
    activeReservedSlots: 2,
    dailyLimit: 25,
  }), {
    allowed: false,
    usedSlots: 25,
    dailyLimit: 25,
  });
});

Deno.test("invalid values fail into a finite minimum cap", () => {
  assertEquals(evaluateSubmissionCap({
    submittedToday: Number.NaN,
    activeReservedSlots: -2,
    dailyLimit: 0,
  }), {
    allowed: true,
    usedSlots: 0,
    dailyLimit: 1,
  });
});

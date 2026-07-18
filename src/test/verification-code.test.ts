import { describe, expect, it } from "vitest";
import { extractVerificationCode } from "../../supabase/functions/_shared/verification-code";

describe("application verification-code extraction", () => {
  it.each([
    ["Your verification code is 482193", "482193"],
    ["927401 is your one-time code", "927401"],
    ["OTP: AX7K2Q", "AX7K2Q"],
    ["Security PIN - 77304", "77304"],
  ])("extracts supported job-portal code wording", (message, expected) => {
    expect(extractVerificationCode(message)).toBe(expected);
  });

  it("does not treat unrelated numbers as a code", () => {
    expect(extractVerificationCode("Application received on July 18, 2026 for job 481920")).toBeNull();
  });
});

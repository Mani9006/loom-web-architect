import { describe, expect, it } from "vitest";
import {
  extractApplicationCode,
  extractVerificationCode,
  isApplicationSender,
} from "../../supabase/functions/_shared/verification-code";

describe("application verification-code extraction", () => {
  it.each([
    ["Your verification code is 482193", "482193"],
    ["927401 is your one-time code", "927401"],
    ["OTP: AX7K2Q", "AX7K2Q"],
    ["Security PIN - 77304", "77304"],
    ["A verification code was sent. Enter the code: m8sFkBBe", "m8sFkBBe"],
  ])("extracts supported job-portal code wording", (message, expected) => {
    expect(extractVerificationCode(message)).toBe(expected);
  });

  it("does not treat unrelated numbers as a code", () => {
    expect(extractVerificationCode("Application received on July 18, 2026 for job 481920")).toBeNull();
  });
});

describe("job-application sender screening", () => {
  it.each([
    ["Greenhouse <no-reply@greenhouse.io>", true],
    ["noreply@lever.co", true],
    ["Workday <do-not-reply@mail.myworkdayjobs.com>", true],
    ["no-reply@ashbyhq.com", true],
    ["talent@notifications.smartrecruiters.com", true],
    ["hello@workable.com", true],
    ["noreply@acme-corp.com", true],
    ["recruiter@gmail.com", false],
    ["Jane Doe <jane@acme-corp.com>", false],
  ])("classifies sender %s", (from, expected) => {
    expect(isApplicationSender(from)).toBe(expected);
  });
});

describe("loose application-code extraction (sender-gated)", () => {
  it.each([
    ["Your security code is 482913", "482913"],
    ["Confirm your email with code 731204", "731204"],
    ["To confirm your email, enter 82941 in the form", "82941"],
    ["The code: 0042", "0042"],
  ])("extracts digit codes from OTP wording", (message, expected) => {
    expect(extractApplicationCode(message)).toBe(expected);
  });

  it.each([
    ["482913"],
    ["Please confirm your email address to continue"],
    ["code is ABCDEF"],
    ["Application received on July 18, 2026 for job 481920"],
  ])("rejects non-code text", (message) => {
    expect(extractApplicationCode(message)).toBeNull();
  });
});

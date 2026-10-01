import { describe, expect, it } from "vitest";
import { deterministicClassification } from "../../supabase/functions/_shared/email-classification";

const classify = (text: string) => deterministicClassification(text)?.classification ?? null;

// Regression: rejection wording used to match the offer/interview patterns
// first, moving the tracked job forward and emailing the user "great news".
describe("mc-gmail-poll deterministic email classification", () => {
  it.each([
    "We have decided to move forward with other candidates for this position.",
    "Thank you for taking the time to interview with us. Unfortunately, we will not be moving forward.",
    "After careful consideration we have chosen to move forward with another applicant for the position. You were not selected.",
  ])("classifies rejections as reject: %s", (text) => {
    expect(classify(text)).toBe("reject");
  });

  it.each([
    "We are pleased to offer you the role of Senior Engineer.",
    "Please find your offer letter attached.",
    "We would like to extend you an offer for the Backend Engineer position.",
    "We have decided to extend an offer for the position.",
  ])("classifies offers as offer: %s", (text) => {
    expect(classify(text)).toBe("offer");
  });

  it("does not treat generic 'move forward with ... position' as an offer", () => {
    expect(classify("We have decided to move forward with your application for the position. Please schedule a call.")).toBe("interview_invite");
  });

  it("classifies interview invites, assessments and confirmations", () => {
    expect(classify("We'd like to invite you to an interview next week.")).toBe("interview_invite");
    expect(classify("Please complete the HackerRank coding challenge.")).toBe("take_home");
    expect(classify("Thank you for applying to Acme!")).toBe("confirmation");
    expect(classify("Weekly newsletter")).toBeNull();
  });
});

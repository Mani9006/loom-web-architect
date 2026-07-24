import { hasVerifiedSubmissionEvidence } from "./submission-receipt.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const applyUrl = "https://boards.greenhouse.io/acme/jobs/12345";
const payload = {
  jobs: [{ id: "job-1", url: applyUrl }],
};
const baseResult = {
  jobId: "job-1",
  url: applyUrl,
  adapter: "greenhouse",
  status: "submitted",
  submitted: true,
};

Deno.test("queue rejects generic thank-you text as the only receipt signal", () => {
  const accepted = hasVerifiedSubmissionEvidence({
    ...baseResult,
    receipt: {
      signal: "confirmation-text",
      confirmationText: "Thank you for applying!",
    },
  }, payload);

  assert(!accepted, "generic confirmation text must not create a submission receipt");
});

Deno.test("queue rejects an uncorrelated provider write response", () => {
  const accepted = hasVerifiedSubmissionEvidence({
    ...baseResult,
    receipt: null,
    submissionResponseStatus: 200,
    submissionTransportConfirmed: true,
  }, payload);

  assert(!accepted, "an arbitrary provider-domain 2xx write must not be submission proof");
});

Deno.test("queue rejects matched transport without a strong response signal", () => {
  const accepted = hasVerifiedSubmissionEvidence({
    ...baseResult,
    submissionRequestMatched: true,
    submissionResponseStatus: 200,
    submissionTransportConfirmed: true,
    submissionTransportSignal: null,
  }, payload);

  assert(!accepted, "transport status alone must not be submission proof");
});

Deno.test("queue accepts provider-specific confirmation evidence", () => {
  const accepted = hasVerifiedSubmissionEvidence({
    ...baseResult,
    receipt: { signal: "greenhouse-confirmation-container" },
  }, payload);

  assert(accepted, "the Greenhouse confirmation container is strong provider evidence");
});

Deno.test("queue accepts a concrete application id", () => {
  const accepted = hasVerifiedSubmissionEvidence({
    ...baseResult,
    receipt: { applicationId: "GH-APPLICATION-123" },
  }, payload);

  assert(accepted, "a concrete application id should be accepted");
});

Deno.test("queue accepts correlated structured transport proof", () => {
  const accepted = hasVerifiedSubmissionEvidence({
    ...baseResult,
    submissionRequestMatched: true,
    submissionResponseStatus: 201,
    submissionTransportConfirmed: true,
    submissionTransportSignal: "ats-submission-explicit-success",
  }, payload);

  assert(accepted, "a correlated structured submission response should be accepted");
});

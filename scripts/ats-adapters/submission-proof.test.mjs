import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  developmentScreenshotsEnabled,
  hasStrongReceiptEvidence,
  inspectSubmissionResponse,
  isSubmissionRequestCandidate,
} from "../ats-submission-proof.mjs";

const context = {
  provider: "greenhouse",
  formAction: "https://boards.greenhouse.io/acme/jobs/123/applications",
  formMethod: "POST",
};

test("submission request matcher accepts the exact submit form action", () => {
  assert.equal(isSubmissionRequestCandidate({
    url: "https://boards.greenhouse.io/acme/jobs/123/applications?source=board",
    method: "POST",
    resourceType: "document",
  }, context), true);
});

test("submission request matcher rejects an unrelated provider-domain POST", () => {
  assert.equal(isSubmissionRequestCandidate({
    url: "https://boards.greenhouse.io/analytics/events",
    method: "POST",
    resourceType: "fetch",
  }, context), false);
});

test("submission response ignores generic thank-you prose", async () => {
  const proof = await inspectSubmissionResponse({
    status: () => 200,
    url: () => "https://boards.greenhouse.io/acme/jobs/123/applications",
    text: async () => "<html><h1>Thank you!</h1><p>Have a nice day.</p></html>",
  });

  assert.equal(proof.confirmed, false);
  assert.equal(proof.signal, null);
  assert.equal(proof.applicationId, null);
});

test("submission response accepts structured submission success", async () => {
  const proof = await inspectSubmissionResponse({
    status: () => 201,
    url: () => "https://api.ashbyhq.com/applicationForm.submit",
    text: async () => JSON.stringify({
      status: "submitted",
      application_id: "ASHBY-98765",
    }),
  });

  assert.equal(proof.confirmed, true);
  assert.equal(proof.signal, "ats-submission-application-id");
  assert.equal(proof.applicationId, "ASHBY-98765");
});

test("generic thank-you receipt text is not strong DOM evidence", () => {
  assert.equal(hasStrongReceiptEvidence("greenhouse", {
    signal: "confirmation-text",
    containerText: "Thank you for applying",
  }), false);
  assert.equal(hasStrongReceiptEvidence("greenhouse", {
    signal: "greenhouse-confirmation-container",
  }), true);
  assert.equal(hasStrongReceiptEvidence("workable", {
    applicationId: "WK-12345",
  }), true);
});

test("screenshots require both explicit development diagnostic controls", () => {
  const base = { APPLYPASS_SCREENSHOT_DIR: "/tmp/screens" };
  assert.equal(developmentScreenshotsEnabled(base), false);
  assert.equal(developmentScreenshotsEnabled({
    ...base,
    APPLYPASS_RUNTIME_ENV: "production",
    APPLYPASS_DEV_DIAGNOSTIC_SCREENSHOTS: "true",
  }), false);
  assert.equal(developmentScreenshotsEnabled({
    ...base,
    APPLYPASS_RUNTIME_ENV: "development",
    APPLYPASS_DEV_DIAGNOSTIC_SCREENSHOTS: "true",
  }), true);
});

test("production workflow uploads only allowlisted text diagnostics", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/continuous-apply-worker.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workflow, /APPLYPASS_SCREENSHOT_DIR/);
  assert.match(workflow, /applypass-prod-worker-artifacts\/worker\.log/);
  assert.match(workflow, /applypass-prod-worker-artifacts\/run-status\.txt/);
  assert.doesNotMatch(workflow, /^\s+path:\s+\/tmp\/applypass-prod-worker-artifacts\s*$/m);
});

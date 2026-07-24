import {
  ATS_GATE_ERROR_CODE,
  ATS_GATE_ERROR_MESSAGE,
  AtsSubmissionGateError,
  evaluateAtsSubmissionGate,
  TRUSTED_ATS_MODEL_PREFIX,
} from "./ats-gate.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("allows a trusted job-match score at the caller's threshold", () => {
  const result = evaluateAtsSubmissionGate({
    minimumScore: 85,
    scoreRow: {
      model: `${TRUSTED_ATS_MODEL_PREFIX}deterministic`,
      overall: 85,
    },
  });

  assert(result.allowed, "expected the score to pass");
  assert(result.score === 85, "expected the accepted score to be retained");
  assert(
    result.minimumScore === 85,
    "expected the caller's threshold to be retained",
  );
});

Deno.test("rejects a trusted job-match score below the caller's threshold", () => {
  const result = evaluateAtsSubmissionGate({
    minimumScore: 90,
    scoreRow: {
      model: `${TRUSTED_ATS_MODEL_PREFIX}cache:claude-haiku`,
      overall: 89.9,
    },
  });

  assert(!result.allowed, "expected the score to be rejected");
  assert(
    result.reason === "below_threshold",
    "expected a below-threshold decision",
  );
});

Deno.test("rejects a missing score", () => {
  const result = evaluateAtsSubmissionGate({
    minimumScore: 85,
    scoreRow: null,
  });

  assert(!result.allowed, "expected a missing score to be rejected");
  assert(
    result.reason === "missing_trusted_score",
    "expected a missing-score decision",
  );
});

Deno.test("rejects legacy and lookalike model names even with a high score", () => {
  for (
    const model of [
      "gpt-4o",
      "ats-truth-v1:job_match:deterministic",
      "ats-truth-v2:jobXmatch:deterministic",
      "ats-truth-v2:resume_quality:deterministic",
    ]
  ) {
    const result = evaluateAtsSubmissionGate({
      minimumScore: 85,
      scoreRow: { model, overall: 100 },
    });
    assert(!result.allowed, `expected ${model} to be rejected`);
    assert(
      result.reason === "missing_trusted_score",
      `expected ${model} to be untrusted`,
    );
  }
});

Deno.test("fails closed when the stored threshold or score is malformed", () => {
  const invalidThreshold = evaluateAtsSubmissionGate({
    minimumScore: "85",
    scoreRow: {
      model: `${TRUSTED_ATS_MODEL_PREFIX}deterministic`,
      overall: 100,
    },
  });
  const invalidScore = evaluateAtsSubmissionGate({
    minimumScore: 85,
    scoreRow: {
      model: `${TRUSTED_ATS_MODEL_PREFIX}deterministic`,
      overall: Number.NaN,
    },
  });

  assert(
    !invalidThreshold.allowed,
    "expected a malformed threshold to be rejected",
  );
  assert(
    invalidThreshold.reason === "invalid_threshold",
    "expected an invalid-threshold decision",
  );
  assert(!invalidScore.allowed, "expected a malformed score to be rejected");
  assert(
    invalidScore.reason === "missing_trusted_score",
    "expected an invalid score to be untrusted",
  );
});

Deno.test("uses a safe 412 response contract for rejected submissions", () => {
  const error = new AtsSubmissionGateError();

  assert(error.status === 412, "expected the gate to use HTTP 412");
  assert(
    error.code === ATS_GATE_ERROR_CODE,
    "expected the stable public error code",
  );
  assert(
    error.message === ATS_GATE_ERROR_MESSAGE,
    "expected the safe public message",
  );
});

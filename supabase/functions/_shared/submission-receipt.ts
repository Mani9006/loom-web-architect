import { classifyAtsApplyUrl, type SupportedAtsPortal } from "./ats-url-policy.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasApplicationId(value: unknown): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(asString(value));
}

const STRONG_PROVIDER_SIGNALS: Readonly<Record<SupportedAtsPortal, ReadonlySet<string>>> = {
  greenhouse: new Set(["greenhouse-confirmation-container"]),
  lever: new Set(["lever-thanks-url", "lever-confirmation-container"]),
  ashby: new Set(["ashby-submitted-url", "ashby-confirmation-container"]),
  workable: new Set(["workable-confirmation-container"]),
};

const STRONG_TRANSPORT_SIGNALS = new Set([
  "ats-submission-application-id",
  "ats-submission-explicit-success",
]);

/**
 * Treat the worker's submitted state as a claim that must be independently
 * supported. Generic body text, a form disappearing, or an arbitrary 2xx
 * provider-domain write is insufficient.
 */
export function hasVerifiedSubmissionEvidence(
  resultJob: Record<string, unknown>,
  taskPayload: Record<string, unknown>,
): boolean {
  if (resultJob.status !== "submitted" || resultJob.submitted !== true) return false;
  const resultJobId = asString(resultJob.jobId);
  const expectedJobs = Array.isArray(taskPayload.jobs) ? taskPayload.jobs.map(asRecord) : [];
  const expected = expectedJobs.find((job) => asString(job.id) === resultJobId);
  if (!expected) return false;

  const expectedTarget = classifyAtsApplyUrl(expected.url);
  const resultTarget = classifyAtsApplyUrl(resultJob.url);
  if (
    !expectedTarget.supported ||
    !resultTarget.supported ||
    expectedTarget.type === "manual" ||
    expectedTarget.type !== resultTarget.type ||
    expectedTarget.normalizedUrl !== resultTarget.normalizedUrl ||
    asString(resultJob.adapter) !== expectedTarget.type
  ) {
    return false;
  }
  const provider: SupportedAtsPortal = expectedTarget.type;

  const receipt = asRecord(resultJob.receipt);
  const receiptSignal = asString(receipt.signal);
  const strongReceipt = hasApplicationId(receipt.applicationId)
    || STRONG_PROVIDER_SIGNALS[provider].has(receiptSignal);

  const transportStatus = Number(resultJob.submissionResponseStatus);
  const transportSignal = asString(resultJob.submissionTransportSignal);
  const strongTransport = resultJob.submissionRequestMatched === true
    && resultJob.submissionTransportConfirmed === true
    && Number.isInteger(transportStatus)
    && transportStatus >= 200
    && transportStatus < 300
    && STRONG_TRANSPORT_SIGNALS.has(transportSignal)
    && (
      transportSignal !== "ats-submission-application-id"
      || hasApplicationId(resultJob.submissionTransportApplicationId)
    );

  return strongReceipt || strongTransport;
}

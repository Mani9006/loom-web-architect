import { describe, expect, it } from "vitest";

import {
  authenticateOtpSender,
  type OtpTrackedJob,
  type OtpVerifiedSource,
  selectTrustedOtpTarget,
  type VerifiedOtpJobTarget,
  verifyOtpJobTarget,
} from "../../supabase/functions/_shared/gmail-otp-trust";

const trackedLever: OtpTrackedJob = {
  id: "tracked-lever",
  company: "Cohere",
  job_title: "Staff Software Engineer",
  apply_url: "https://jobs.lever.co/cohere/8c0ffee",
  scanned_job_id: "scan-lever",
};

const sourceLever: OtpVerifiedSource = {
  scannedJobId: "scan-lever",
  company: "Cohere",
  provider: "lever",
  providerIdentifier: "cohere",
  applyUrl: "https://jobs.lever.co/cohere/8c0ffee",
  companyUrl: "https://cohere.com/careers",
};

const leverTarget = verifyOtpJobTarget(
  trackedLever,
  {
    trackedJobId: "tracked-lever",
    company: "Cohere",
    jobTitle: "Staff Software Engineer",
    applyUrl: "https://jobs.lever.co/cohere/8c0ffee",
    provider: "lever",
    providerIdentifier: "cohere",
    jobId: "scan-lever",
  },
  sourceLever,
);

function target(
  overrides: Partial<VerifiedOtpJobTarget> = {},
): VerifiedOtpJobTarget {
  return {
    trackedJobId: "tracked-greenhouse",
    company: "Anthropic",
    job_title: "Software Engineer",
    applyUrl: "https://boards.greenhouse.io/anthropic/jobs/123",
    provider: "greenhouse",
    providerIdentifier: "anthropic",
    companyDomain: "anthropic.com",
    ...overrides,
  };
}

describe("Gmail OTP sender trust", () => {
  it("rejects an attacker domain even when its own SPF and DKIM pass", () => {
    const decision = selectTrustedOtpTarget({
      from: "Security <codes@attacker.example>",
      authenticationResults: [
        "mx.google.com; dkim=pass header.d=attacker.example header.i=@attacker.example; spf=pass smtp.mailfrom=codes@attacker.example; dmarc=pass header.from=attacker.example",
      ],
      targets: [target()],
      subject: "Anthropic verification code",
      body: "Your verification code is 482193.",
    });

    expect(decision.authentication.authenticated).toBe(true);
    expect(decision.target).toBeNull();
    expect(decision.reason).toBe("sender_not_bound");
  });

  it("rejects a visible From domain that does not align with the passing identity", () => {
    const authentication = authenticateOtpSender(
      "Greenhouse <no-reply@greenhouse.io>",
      [
        "mx.google.com; dkim=pass header.d=attacker.example header.i=@attacker.example; spf=pass smtp.mailfrom=mailer@attacker.example; dmarc=pass header.from=attacker.example",
      ],
    );

    expect(authentication).toMatchObject({
      authenticated: false,
      fromDomain: "greenhouse.io",
      alignedDmarc: false,
      alignedDkim: false,
      alignedSpf: false,
    });
  });

  it("does not let a lower forged Google result override the boundary result", () => {
    const authentication = authenticateOtpSender(
      "Greenhouse <no-reply@greenhouse.io>",
      [
        "mx.google.com; dkim=fail header.d=greenhouse.io; spf=fail smtp.mailfrom=bounce@greenhouse.io; dmarc=fail header.from=greenhouse.io",
        "mx.google.com; dkim=pass header.d=greenhouse.io; dmarc=pass header.from=greenhouse.io",
      ],
    );

    expect(authentication.authenticated).toBe(false);
  });

  it("accepts an aligned SPF envelope domain when it is the available identity", () => {
    const authentication = authenticateOtpSender(
      "Lever <notifications@lever.co>",
      ["mx.google.com; spf=pass smtp.mailfrom=lever.co"],
    );

    expect(authentication).toMatchObject({
      authenticated: true,
      alignedSpf: true,
    });
  });

  it("accepts an aligned ATS sender only for its exact verified provider target", () => {
    expect(leverTarget).not.toBeNull();
    const decision = selectTrustedOtpTarget({
      from: "Lever <notifications@hire.lever.co>",
      authenticationResults: [
        "mx.google.com; dkim=pass header.d=lever.co header.i=@lever.co; spf=pass smtp.mailfrom=bounce@hire.lever.co; dmarc=pass header.from=hire.lever.co",
      ],
      targets: [leverTarget!],
      subject: "Your verification code",
      body: "Use verification code 739114 to continue.",
    });

    expect(decision.reason).toBe("trusted");
    expect(decision.target?.trackedJobId).toBe("tracked-lever");
    expect(decision.target?.applyUrl).toBe(
      "https://jobs.lever.co/cohere/8c0ffee",
    );
  });

  it("fails closed when a provider sender could refer to multiple tracked jobs", () => {
    const decision = selectTrustedOtpTarget({
      from: "Greenhouse <no-reply@greenhouse.io>",
      authenticationResults: [
        "mx.google.com; dkim=pass header.d=greenhouse.io header.i=@greenhouse.io; dmarc=pass header.from=greenhouse.io",
      ],
      targets: [
        target(),
        target({
          trackedJobId: "tracked-openai",
          company: "OpenAI",
          applyUrl: "https://boards.greenhouse.io/openai/jobs/456",
          providerIdentifier: "openai",
          companyDomain: "openai.com",
        }),
      ],
      subject: "Your verification code",
      body: "Enter 482193 to continue.",
    });

    expect(decision.target).toBeNull();
    expect(decision.reason).toBe("ambiguous_target");
  });

  it("rejects provider, company, scanned-job, or apply-URL drift in task evidence", () => {
    const baseEvidence = {
      trackedJobId: "tracked-lever",
      company: "Cohere",
      jobTitle: "Staff Software Engineer",
      applyUrl: "https://jobs.lever.co/cohere/8c0ffee",
      provider: "lever",
      providerIdentifier: "cohere",
      jobId: "scan-lever",
    };

    expect(verifyOtpJobTarget(
      trackedLever,
      { ...baseEvidence, company: "Attacker Inc" },
      sourceLever,
    )).toBeNull();
    expect(verifyOtpJobTarget(
      trackedLever,
      { ...baseEvidence, applyUrl: "https://jobs.lever.co/attacker/deadbeef" },
      sourceLever,
    )).toBeNull();
    expect(verifyOtpJobTarget(
      trackedLever,
      { ...baseEvidence, provider: "greenhouse" },
      sourceLever,
    )).toBeNull();
    expect(verifyOtpJobTarget(
      trackedLever,
      { ...baseEvidence, jobId: "scan-attacker" },
      sourceLever,
    )).toBeNull();
  });
});

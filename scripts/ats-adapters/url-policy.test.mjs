import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWorkerAtsUrl,
  hostnameMatchesDomain,
  isTrustedResumeDownloadUrl,
  validateWorkerAtsUrl,
  validateWorkerProviderUrl,
} from "../ats-url-policy.mjs";

test("worker URL policy accepts supported ATS hosts", () => {
  assert.deepEqual(
    classifyWorkerAtsUrl("https://jobs.lever.co/acme/123"),
    {
      ok: true,
      provider: "lever",
      normalizedUrl: "https://jobs.lever.co/acme/123",
      reason: null,
    },
  );
  assert.equal(validateWorkerAtsUrl("https://apply.workable.com/acme/j/ABC/", "workable").ok, true);
});

test("worker URL policy rejects lookalikes and unsafe destinations", () => {
  for (const value of [
    "https://evilgreenhouse.io/acme/jobs/123",
    "https://notlever.co/acme/123",
    "https://greenhouse.io.evil.example/acme/jobs/123",
    "https://jobs.lever.co@evil.example/acme/123",
    "http://jobs.lever.co/acme/123",
    "https://jobs.lever.co:8443/acme/123",
    "https://127.0.0.1/jobs/123",
    "https://10.0.0.2/jobs/123",
    "https://localhost/jobs/123",
    "https://www.lever.co/acme/123",
    "https://support.greenhouse.io/hc/en-us/requests/new",
    "https://api.ashbyhq.com/jobPosting.list",
    "https://help.workable.com/hc/en-us/requests/new",
    "https://apply.workable.com/acme",
  ]) {
    assert.equal(classifyWorkerAtsUrl(value).ok, false, value);
  }
});

test("provider response policy allows provider APIs but not a different provider", () => {
  assert.equal(
    validateWorkerProviderUrl("https://boards-api.greenhouse.io/v1/boards/acme/jobs/123", "greenhouse").ok,
    true,
  );
  assert.equal(
    validateWorkerProviderUrl("https://jobs.lever.co/acme/123/apply", "greenhouse").ok,
    false,
  );
});

test("worker URL policy rejects provider drift and cross-provider redirects", () => {
  assert.equal(validateWorkerAtsUrl("https://jobs.lever.co/acme/123", "greenhouse").reason, "provider_mismatch");
  assert.equal(validateWorkerAtsUrl("https://jobs.ashbyhq.com/acme/123", "lever").ok, false);
});

test("hostname matching uses an exact DNS label boundary", () => {
  assert.equal(hostnameMatchesDomain("jobs.lever.co", "lever.co"), true);
  assert.equal(hostnameMatchesDomain("notlever.co", "lever.co"), false);
});

test("resume downloads are limited to the configured Supabase storage origin", () => {
  const project = "https://project.supabase.co";
  assert.equal(isTrustedResumeDownloadUrl("https://project.supabase.co/storage/v1/object/sign/resumes/a.pdf?token=x", project), true);
  assert.equal(isTrustedResumeDownloadUrl("https://evil.example/resume.pdf", project), false);
  assert.equal(isTrustedResumeDownloadUrl("https://project.supabase.co.evil.example/storage/v1/object/a.pdf", project), false);
});

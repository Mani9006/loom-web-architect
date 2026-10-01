import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  attachmentsFitBudget,
  buildForwardFrom,
  hashForwardCode,
  isAllowedForwardTarget,
  mailboxLocalPartFor,
  matchMailboxRecipients,
  parseAddress,
  pickLocalPart,
  RESERVED_LOCAL_PARTS,
  shouldSkipForward,
  slugifyFirstName,
  fallbackLocalBase,
  verifySvixSignature,
} from "../../supabase/functions/_shared/hosted-mailbox";
import {
  deterministicClassification,
  isForwardStatusMove,
  matchTrackedJob,
  screenVerificationCode,
} from "../../supabase/functions/_shared/inbound-email";
import { INBOX_FILTERS, matchesInboxFilter, needsAttention, type FilterableMessage } from "@/lib/inbox-filters";

describe("Svix webhook signature verification", () => {
  const keyBytes = Buffer.from("resumepreps-hosted-mailbox-test-key");
  const secret = `whsec_${keyBytes.toString("base64")}`;
  const id = "msg_2abcDEF";
  const timestamp = "1800000000";
  const now = Number(timestamp) * 1000;
  const body = JSON.stringify({ type: "email.received", data: { email_id: "4ef9a417", to: ["jane@apply.example"] } });
  const sign = (content: string, key: Buffer = keyBytes) =>
    createHmac("sha256", key).update(content).digest("base64");
  const valid = sign(`${id}.${timestamp}.${body}`);

  it("accepts a valid v1 signature", async () => {
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${valid}` }, secret, now)).resolves.toBe(true);
  });

  it("rejects a tampered body", async () => {
    await expect(verifySvixSignature(`${body} `, { id, timestamp, signature: `v1,${valid}` }, secret, now)).resolves.toBe(false);
  });

  it("rejects a tampered id or timestamp", async () => {
    await expect(verifySvixSignature(body, { id: "msg_other", timestamp, signature: `v1,${valid}` }, secret, now)).resolves.toBe(false);
    await expect(verifySvixSignature(body, { id, timestamp: "1800000001", signature: `v1,${valid}` }, secret, now + 1000)).resolves.toBe(false);
  });

  it("rejects timestamps outside the five-minute window", async () => {
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${valid}` }, secret, now + 301_000)).resolves.toBe(false);
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${valid}` }, secret, now - 301_000)).resolves.toBe(false);
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${valid}` }, secret, now + 299_000)).resolves.toBe(true);
  });

  it("accepts when any of several space-separated signatures matches", async () => {
    const stale = sign(`${id}.${timestamp}.${body}`, Buffer.from("rotated-out-key"));
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${stale} v1,${valid}` }, secret, now)).resolves.toBe(true);
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${stale} v2,${valid}` }, secret, now)).resolves.toBe(false);
  });

  it("rejects missing headers or secret", async () => {
    await expect(verifySvixSignature(body, { id: null, timestamp, signature: `v1,${valid}` }, secret, now)).resolves.toBe(false);
    await expect(verifySvixSignature(body, { id, timestamp, signature: null }, secret, now)).resolves.toBe(false);
    await expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${valid}` }, undefined, now)).resolves.toBe(false);
  });
});

describe("local part generation", () => {
  it("slugs the first name to a-z0-9, 3 to 24 characters", () => {
    expect(slugifyFirstName("Manikanta Reddy")).toBe("manikanta");
    expect(slugifyFirstName("  José-María López")).toBe("josemaria");
    expect(slugifyFirstName("Al")).toBeNull();
    expect(slugifyFirstName("")).toBeNull();
    expect(slugifyFirstName("A".repeat(40))).toHaveLength(24);
  });

  it("falls back to the login email, then a neutral base", () => {
    expect(fallbackLocalBase("j.smith99@gmail.com")).toBe("jsmith99");
    expect(fallbackLocalBase("42@x.com")).toBe("applicant");
  });

  it("uses the base when free, else the smallest free numeric suffix", () => {
    expect(pickLocalPart("manikanta", [])).toBe("manikanta");
    expect(pickLocalPart("manikanta", ["manikanta"])).toBe("manikanta2");
    expect(pickLocalPart("manikanta", ["manikanta", "manikanta2", "manikanta4"])).toBe("manikanta3");
    expect(pickLocalPart("manikanta", ["manikantax", "manikanta22"])).toBe("manikanta");
  });

  it("never hands out a reserved word", () => {
    for (const word of ["admin", "support", "postmaster", "abuse", "noreply", "hr", "jobs", "careers"]) {
      expect(RESERVED_LOCAL_PARTS.has(word)).toBe(true);
    }
    expect(pickLocalPart("support", [])).toBe("support2");
    expect(pickLocalPart("info", ["info2"])).toBe("info3");
  });
});

describe("recipient matching", () => {
  const domain = "apply.example";

  it("matches case-insensitively and strips plus tags", () => {
    expect(mailboxLocalPartFor("Jane@Apply.Example", domain)).toBe("jane");
    expect(mailboxLocalPartFor("jane+greenhouse@apply.example", domain)).toBe("jane");
    expect(mailboxLocalPartFor('"Jane D" <JANE+acme@apply.example>', domain)).toBe("jane");
  });

  it("ignores other domains, including look-alike subdomains", () => {
    expect(mailboxLocalPartFor("jane@gmail.com", domain)).toBeNull();
    expect(mailboxLocalPartFor("jane@mail.apply.example", domain)).toBeNull();
    expect(mailboxLocalPartFor("jane@apply.example.evil.com", domain)).toBeNull();
  });

  it("collects unique mailbox recipients from to and cc", () => {
    expect(matchMailboxRecipients([
      "jane@apply.example",
      "Jane+tag@apply.example",
      "recruiter@acme.com",
      "sam@apply.example",
      null,
    ], domain).sort()).toEqual(["jane", "sam"]);
  });

  it("parses display names and bare addresses", () => {
    expect(parseAddress('"Acme Talent" <talent@acme.com>')).toEqual({ name: "Acme Talent", address: "talent@acme.com" });
    expect(parseAddress("talent@acme.com")).toEqual({ name: "", address: "talent@acme.com" });
  });
});

describe("forwarding loop guards and targets", () => {
  const base = { mailboxDomain: "apply.example", forwardFrom: "ResumePreps <inbox@mail.resumepreps.com>" };

  it("forwards ordinary recruiter mail", () => {
    expect(shouldSkipForward({ ...base, from: "Acme <talent@acme.com>", headers: { subject: "Hi" } })).toBeNull();
  });

  it("skips mail from the mailbox domain or the forwarding domain", () => {
    expect(shouldSkipForward({ ...base, from: "sam@apply.example", headers: {} })).toBe("sender_on_mailbox_domain");
    expect(shouldSkipForward({ ...base, from: "bounce@mail.resumepreps.com", headers: {} })).toBe("sender_on_forward_domain");
  });

  it("skips mail already carrying the forwarded marker header, any case", () => {
    expect(shouldSkipForward({ ...base, from: "talent@acme.com", headers: { "x-resumepreps-forwarded": "1" } })).toBe("already_forwarded");
  });

  it("refuses forwarding targets on the mailbox domain", () => {
    expect(isAllowedForwardTarget("me@gmail.com", "apply.example")).toBe(true);
    expect(isAllowedForwardTarget("other@apply.example", "apply.example")).toBe(false);
    expect(isAllowedForwardTarget("x@sub.apply.example", "apply.example")).toBe(false);
    expect(isAllowedForwardTarget("not-an-email", "apply.example")).toBe(false);
  });

  it("labels forwards with the sender and strips header-breaking characters", () => {
    expect(buildForwardFrom('"Acme Talent" <talent@acme.com>', base.forwardFrom))
      .toBe('"Acme Talent via ResumePreps" <inbox@mail.resumepreps.com>');
    expect(buildForwardFrom("talent@acme.com", "inbox@mail.resumepreps.com"))
      .toBe('"talent@acme.com via ResumePreps" <inbox@mail.resumepreps.com>');
    expect(buildForwardFrom('"Evil\r\nBcc: x@y.com" <a@b.com>', "inbox@mail.resumepreps.com")).not.toMatch(/[\r\n]/);
  });

  it("keeps attachments only within the 10 MB budget", () => {
    expect(attachmentsFitBudget([4 * 1024 * 1024, 5 * 1024 * 1024])).toBe(true);
    expect(attachmentsFitBudget([6 * 1024 * 1024, 5 * 1024 * 1024])).toBe(false);
  });

  it("binds forwarding code hashes to the user and target", async () => {
    const a = await hashForwardCode("user-1", "Me@Gmail.com", "123456");
    expect(a).toBe(await hashForwardCode("user-1", "me@gmail.com", "123456"));
    expect(a).not.toBe(await hashForwardCode("user-2", "me@gmail.com", "123456"));
    expect(a).not.toBe(await hashForwardCode("user-1", "you@gmail.com", "123456"));
  });
});

describe("shared inbound pipeline", () => {
  it("classifies deterministic cases the same way for every source", () => {
    expect(deterministicClassification("We'd like to schedule an interview")?.classification).toBe("interview_invite");
    expect(deterministicClassification("Unfortunately we will not proceed")?.classification).toBe("reject");
    expect(deterministicClassification("Lunch on Friday?")).toBeNull();
  });

  it("never regresses a job's status", () => {
    expect(isForwardStatusMove("interview", "viewed")).toBe(false);
    expect(isForwardStatusMove("applied", "interview")).toBe(true);
    expect(isForwardStatusMove("interview", "rejected")).toBe(true);
  });

  it("screens codes and links code mail to the job by ATS domain", () => {
    const receivedAt = new Date(1_800_000_000_000).toISOString();
    const input = { subject: "Finish your application", bodyText: "Your verification code is 482913", fromEmail: "no-reply@greenhouse.io", receivedAt };
    const screening = screenVerificationCode(input, 1_800_000_000_000 + 60_000);
    expect(screening.activeCode).toBe("482913");
    const job = { id: "job-1", company: "Acme", job_title: "Data Engineer", apply_url: "https://boards.greenhouse.io/acme/jobs/1" };
    expect(matchTrackedJob([job], input, screening)?.id).toBe("job-1");
    expect(screenVerificationCode(input, 1_800_000_000_000 + 11 * 60_000).activeCode).toBeNull();
  });
});

describe("inbox filter chips", () => {
  const now = 1_800_000_000_000;
  const message = (overrides: Partial<FilterableMessage>): FilterableMessage => ({
    classification: "other_recruiter",
    next_action: null,
    verification_code: null,
    verification_code_expires_at: null,
    ...overrides,
  });

  it("offers the four chips in order", () => {
    expect(INBOX_FILTERS.map((item) => item.label)).toEqual(["Needs you", "All", "Confirmations", "Rejections"]);
  });

  it("puts interviews, assessments, offers, codes and next steps in Needs you", () => {
    expect(needsAttention(message({ classification: "interview_invite" }), now)).toBe(true);
    expect(needsAttention(message({ classification: "take_home" }), now)).toBe(true);
    expect(needsAttention(message({ classification: "offer" }), now)).toBe(true);
    expect(needsAttention(message({ next_action: "Reply with availability" }), now)).toBe(true);
    expect(needsAttention(message({ verification_code: "123456", verification_code_expires_at: new Date(now + 60_000).toISOString() }), now)).toBe(true);
    expect(needsAttention(message({ verification_code: "123456", verification_code_expires_at: new Date(now - 60_000).toISOString() }), now)).toBe(false);
    expect(needsAttention(message({ classification: "confirmation" }), now)).toBe(false);
    expect(needsAttention(message({ classification: "reject", next_action: "  " }), now)).toBe(false);
  });

  it("maps Confirmations, Rejections and All", () => {
    expect(matchesInboxFilter(message({ classification: "confirmation" }), "confirmations", now)).toBe(true);
    expect(matchesInboxFilter(message({ classification: "reject" }), "confirmations", now)).toBe(false);
    expect(matchesInboxFilter(message({ classification: "reject" }), "rejections", now)).toBe(true);
    expect(matchesInboxFilter(message({ classification: "irrelevant" }), "all", now)).toBe(true);
  });
});

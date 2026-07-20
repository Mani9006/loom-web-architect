// Unit tests for the ATS adapter layer. Runs with `node --test` and needs no
// Playwright/browser: everything exercised here is either a pure helper or an
// adapter code path that must return before touching the page (safety gates,
// URL-only detection).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyBlockers,
  detectAtsFromUrl,
  fuzzyMatchAnswer,
  isAffirmativeAnswer,
  looksLikeConsentLabel,
  normalizeText,
  requiredMissingFromFields,
} from "./helpers.mjs";
import { defineAdapter, submitRefusal } from "./contract.mjs";
import { adapters, genericAdapter, greenhouseAdapter, leverAdapter, pickAdapter } from "./index.mjs";

// A page object that throws on any use: proves a code path never touched the
// browser (used for gating tests and URL-only detection).
const explodingPage = new Proxy({}, {
  get(_, prop) {
    if (prop === "then") return undefined; // allow awaiting values around it
    throw new Error(`Adapter touched page.${String(prop)} when it must not`);
  },
});

// --- detect() URL logic -----------------------------------------------------

test("detectAtsFromUrl classifies greenhouse hosts", () => {
  assert.equal(detectAtsFromUrl("https://boards.greenhouse.io/acme/jobs/123"), "greenhouse");
  assert.equal(detectAtsFromUrl("https://job-boards.greenhouse.io/acme/jobs/4001"), "greenhouse");
  assert.equal(detectAtsFromUrl("https://acme.greenhouse.io/embed/job_app?token=1"), "greenhouse");
});

test("detectAtsFromUrl classifies lever hosts", () => {
  assert.equal(detectAtsFromUrl("https://jobs.lever.co/acme/uuid-123"), "lever");
  assert.equal(detectAtsFromUrl("https://jobs.eu.lever.co/acme/uuid-123/apply"), "lever");
});

test("detectAtsFromUrl rejects lookalike and unknown hosts", () => {
  assert.equal(detectAtsFromUrl("https://notgreenhouse.io/jobs/1"), null);
  assert.equal(detectAtsFromUrl("https://greenhouse.io.evil.example/jobs/1"), null);
  assert.equal(detectAtsFromUrl("https://careers.example.com/apply"), null);
  assert.equal(detectAtsFromUrl("not a url"), null);
});

test("adapter detect() answers from URL alone (no page needed)", async () => {
  assert.equal(await greenhouseAdapter.detect("https://boards.greenhouse.io/acme/jobs/1", null), true);
  assert.equal(await leverAdapter.detect("https://jobs.lever.co/acme/role", null), true);
  assert.equal(await greenhouseAdapter.detect("https://jobs.lever.co/acme/role", null), false);
  assert.equal(await leverAdapter.detect("https://boards.greenhouse.io/acme/jobs/1", null), false);
  assert.equal(genericAdapter.detect("https://anything.example.com", null), true);
});

test("pickAdapter routes greenhouse, lever, then generic", async () => {
  assert.equal((await pickAdapter("https://boards.greenhouse.io/acme/jobs/1")).metadata.name, "greenhouse");
  assert.equal((await pickAdapter("https://jobs.lever.co/acme/role/apply")).metadata.name, "lever");
  assert.equal((await pickAdapter("https://careers.example.com/apply")).metadata.name, "generic");
  assert.equal((await pickAdapter("garbage-not-a-url")).metadata.name, "generic");
});

test("registry order tries specific adapters before generic", () => {
  assert.deepEqual(adapters.map((a) => a.metadata.name), ["greenhouse", "lever", "generic"]);
});

// --- fuzzy label matching ---------------------------------------------------

test("fuzzyMatchAnswer matches exact and containment labels", () => {
  const answers = { "Are you authorized to work in the US?": "Yes" };
  assert.equal(fuzzyMatchAnswer("Are you authorized to work in the US?", answers)?.answer, "Yes");
  assert.equal(fuzzyMatchAnswer("Are you authorized to work in the US? *", answers)?.answer, "Yes");
});

test("fuzzyMatchAnswer matches on strong token overlap", () => {
  const answers = { "years of professional experience with React": "5" };
  const match = fuzzyMatchAnswer("How many years of React experience do you have?", answers);
  assert.equal(match?.answer, "5");
});

test("fuzzyMatchAnswer returns null on weak or no overlap", () => {
  const answers = { "desired salary range": "$150k" };
  assert.equal(fuzzyMatchAnswer("Why do you want to work here?", answers), null);
  assert.equal(fuzzyMatchAnswer("", answers), null);
  assert.equal(fuzzyMatchAnswer("Anything at all", {}), null);
});

test("fuzzyMatchAnswer ignores blank stored answers", () => {
  assert.equal(fuzzyMatchAnswer("desired salary range", { "desired salary range": "  " }), null);
});

// --- consent policy ---------------------------------------------------------

test("isAffirmativeAnswer accepts only explicit affirmatives", () => {
  assert.equal(isAffirmativeAnswer("Yes"), true);
  assert.equal(isAffirmativeAnswer("I agree"), true);
  assert.equal(isAffirmativeAnswer("true"), true);
  assert.equal(isAffirmativeAnswer("no"), false);
  assert.equal(isAffirmativeAnswer("maybe"), false);
  assert.equal(isAffirmativeAnswer(""), false);
});

test("looksLikeConsentLabel flags consent-style checkbox labels", () => {
  assert.equal(looksLikeConsentLabel("I agree to the privacy policy"), true);
  assert.equal(looksLikeConsentLabel("I consent to data processing under GDPR"), true);
  assert.equal(looksLikeConsentLabel("Subscribe me: opt-in to updates"), true);
  assert.equal(looksLikeConsentLabel("Do you know JavaScript?"), false);
});

// --- requiredMissing logic --------------------------------------------------

test("requiredMissingFromFields lists unfilled required fields only", () => {
  const fields = [
    { label: "First Name *", type: "text", required: true, value: "Ada", visible: true },
    { label: "Why us?", type: "textarea", required: true, value: "", visible: true },
    { label: "Resume", type: "file", required: true, filesCount: 0, visible: true },
    { label: "I agree to the terms", type: "checkbox", required: true, checked: false, visible: true },
    { label: "Optional portfolio", type: "text", required: false, value: "", visible: true },
    { label: "Hidden token", type: "text", required: true, value: "", visible: false },
    { name: "custom_q_1", type: "text", required: true, value: "", visible: true },
  ];
  assert.deepEqual(requiredMissingFromFields(fields), [
    "Why us?",
    "Resume",
    "I agree to the terms",
    "custom_q_1",
  ]);
});

test("requiredMissingFromFields treats checked boxes and uploads as filled", () => {
  const fields = [
    { label: "I agree", type: "checkbox", required: true, checked: true, visible: true },
    { label: "Resume", type: "file", required: true, filesCount: 1, visible: true },
  ];
  assert.deepEqual(requiredMissingFromFields(fields), []);
});

// --- blocker classification (never bypass interactive CAPTCHA / login walls)

test("classifyBlockers flags human-check and Cloudflare interstitial text", () => {
  assert.equal(classifyBlockers({ text: "Please verify you are a human to continue" })[0]?.kind, "captcha");
  assert.equal(classifyBlockers({ text: "Verify you are human by completing the action below." })[0]?.kind, "captcha");
  assert.equal(classifyBlockers({ text: "Checking your browser before accessing example.com" })[0]?.kind, "captcha");
});

test("classifyBlockers ignores invisible/score-based reCAPTCHA integrations", () => {
  const badge = { tag: "div", src: "", size: "", inBadge: true, visible: true };
  const badgeFrame = { tag: "iframe", src: "https://www.google.com/recaptcha/enterprise/badge?k=abc", size: "", inBadge: true, visible: true };
  const badgeFrameOutsideBadgeClass = { ...badgeFrame, inBadge: false }; // "badge" src is never an anchor/bframe
  const invisibleWidget = { tag: "div", src: "", size: "invisible", inBadge: false, visible: true };
  const bareSitekey = { tag: "form", src: "", size: "", inBadge: false, visible: true };
  const hiddenAnchor = { tag: "iframe", src: "https://www.google.com/recaptcha/api2/anchor?k=abc", size: "", inBadge: false, visible: false };
  assert.deepEqual(classifyBlockers({ captchaElements: [badge, badgeFrame] }), []);
  assert.deepEqual(classifyBlockers({ captchaElements: [badgeFrameOutsideBadgeClass] }), []);
  assert.deepEqual(classifyBlockers({ captchaElements: [invisibleWidget] }), []);
  assert.deepEqual(classifyBlockers({ captchaElements: [bareSitekey] }), []);
  assert.deepEqual(classifyBlockers({ captchaElements: [hiddenAnchor] }), []);
});

test("classifyBlockers flags visible interactive CAPTCHA challenge iframes", () => {
  const base = { tag: "iframe", size: "", inBadge: false, visible: true };
  const cases = [
    { ...base, src: "https://www.google.com/recaptcha/api2/anchor?k=abc" },
    { ...base, src: "https://www.google.com/recaptcha/enterprise/anchor?k=abc" },
    { ...base, src: "https://www.google.com/recaptcha/api2/bframe?k=abc" },
    { ...base, src: "https://newassets.hcaptcha.com/captcha/v1/deadbeef" },
    { ...base, src: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/xyz" },
  ];
  for (const element of cases) {
    assert.equal(classifyBlockers({ captchaElements: [element] })[0]?.kind, "captcha", element.src);
  }
});

test("classifyBlockers still honors the legacy coarse hasCaptcha signal", () => {
  assert.equal(classifyBlockers({ hasCaptcha: true })[0]?.kind, "captcha");
});

test("classifyBlockers flags login walls and passes clean pages", () => {
  assert.equal(classifyBlockers({ hasPassword: true })[0]?.kind, "login_wall");
  assert.deepEqual(classifyBlockers({ text: "Apply for Software Engineer" }), []);
});

// --- submit safety gates ----------------------------------------------------

test("submitRefusal blocks without env gate or approval", () => {
  assert.match(submitRefusal({ autoSubmit: false, approved: true }).reason, /auto-submit disabled/);
  assert.match(submitRefusal({ autoSubmit: true, approved: false }).reason, /approval receipt/);
  assert.match(submitRefusal({}).reason, /auto-submit disabled/);
  assert.equal(submitRefusal({ autoSubmit: true, approved: true }), null);
});

for (const adapter of [genericAdapter, greenhouseAdapter, leverAdapter]) {
  test(`${adapter.metadata.name}.submit refuses without gates and never touches the page`, async () => {
    const noGate = await adapter.submit(explodingPage, { autoSubmit: false, approved: true });
    assert.equal(noGate.clicked, false);
    const noApproval = await adapter.submit(explodingPage, { autoSubmit: true, approved: false });
    assert.equal(noApproval.clicked, false);
  });
}

// --- contract validation ----------------------------------------------------

test("defineAdapter rejects incomplete adapters", () => {
  assert.throws(() => defineAdapter({ metadata: { name: "x", version: "1" } }), /missing required method/);
  assert.throws(() => defineAdapter({ detect: () => true }), /metadata/);
});

test("normalizeText collapses whitespace and case", () => {
  assert.equal(normalizeText("  Hello   WORLD \n"), "hello world");
});

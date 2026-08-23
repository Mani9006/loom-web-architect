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
  isCurrentEndDate,
  looksLikeConsentLabel,
  mapResumeExperience,
  normalizeText,
  parseMonthYear,
  requiredMissingFromFields,
} from "./helpers.mjs";
import { defineAdapter, submitRefusal } from "./contract.mjs";
import { adapters, ashbyAdapter, genericAdapter, greenhouseAdapter, leverAdapter, pickAdapter, workdayAdapter, workableAdapter } from "./index.mjs";
import { detectAts } from "./catalog.mjs";
import { ashbyConsentLabel, ashbyStandardValueFor, isAshbyUrl } from "./ashby.mjs";
import { isWorkableCustomField, isWorkableUrl, workableStandardValueFor } from "./workable.mjs";

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

test("catalog detectAts classifies Workday and unsupported ATS without faking submit", () => {
  const workday = detectAts("https://acme.wd1.myworkdayjobs.com/en-US/External/job/Role/JR-1");
  assert.equal(workday.ats, "workday");
  assert.equal(workday.submittable, true);
  const icims = detectAts("https://careers-acme.icims.com/jobs/99/job");
  assert.equal(icims.ats, "icims");
  assert.equal(icims.submittable, false);
  const indeed = detectAts("https://www.indeed.com/viewjob?jk=abc");
  assert.equal(indeed.mode, "account_required");
  assert.equal(indeed.submittable, false);
});

test("adapter detect() answers from URL alone (no page needed)", async () => {
  assert.equal(await greenhouseAdapter.detect("https://boards.greenhouse.io/acme/jobs/1", null), true);
  assert.equal(await leverAdapter.detect("https://jobs.lever.co/acme/role", null), true);
  assert.equal(await ashbyAdapter.detect("https://jobs.ashbyhq.com/openai/c59e2e83-59a6-45bc-82cd-665c6a8a5761", null), true);
  assert.equal(await workableAdapter.detect("https://apply.workable.com/sigmadefense/j/6FEAD09BCC/", null), true);
  assert.equal(await workdayAdapter.detect("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Role/JR-1", null), true);
  assert.equal(await workdayAdapter.detect("https://jobs.lever.co/acme/role", null), false);
  assert.equal(await greenhouseAdapter.detect("https://jobs.lever.co/acme/role", null), false);
  assert.equal(await leverAdapter.detect("https://boards.greenhouse.io/acme/jobs/1", null), false);
  assert.equal(await ashbyAdapter.detect("https://jobs.lever.co/acme/role", null), false);
  assert.equal(await ashbyAdapter.detect("https://careers.example.com/apply", null), false);
  assert.equal(await workableAdapter.detect("https://jobs.lever.co/acme/role", null), false);
  assert.equal(await workableAdapter.detect("https://careers.example.com/apply", null), false);
  assert.equal(genericAdapter.detect("https://anything.example.com", null), true);
});

test("pickAdapter routes greenhouse, lever, ashby, workable, workday, then generic", async () => {
  assert.equal((await pickAdapter("https://boards.greenhouse.io/acme/jobs/1")).metadata.name, "greenhouse");
  assert.equal((await pickAdapter("https://jobs.lever.co/acme/role/apply")).metadata.name, "lever");
  assert.equal((await pickAdapter("https://jobs.ashbyhq.com/openai/c59e2e83-59a6-45bc-82cd-665c6a8a5761")).metadata.name, "ashby");
  assert.equal((await pickAdapter("https://jobs.ashbyhq.com/openai/uuid-here/application")).metadata.name, "ashby");
  assert.equal((await pickAdapter("https://apply.workable.com/sigmadefense/j/6FEAD09BCC/")).metadata.name, "workable");
  assert.equal((await pickAdapter("https://apply.workable.com/sigmadefense/j/6FEAD09BCC/apply/")).metadata.name, "workable");
  assert.equal((await pickAdapter("https://acme.wd1.myworkdayjobs.com/en-US/External/job/Role/JR-1")).metadata.name, "workday");
  assert.equal((await pickAdapter("https://careers.example.com/apply")).metadata.name, "generic");
  assert.equal((await pickAdapter("garbage-not-a-url")).metadata.name, "generic");
});

test("registry order tries specific adapters before generic", () => {
  assert.deepEqual(adapters.map((a) => a.metadata.name), ["greenhouse", "lever", "ashby", "workable", "workday", "generic"]);
});

// --- Workable URL + field resolution -----------------------------------------

test("isWorkableUrl classifies workable hosts and rejects lookalikes", () => {
  assert.equal(isWorkableUrl("https://apply.workable.com/sigmadefense/j/6FEAD09BCC/"), true);
  assert.equal(isWorkableUrl("https://apply.workable.com/sigmadefense/j/6FEAD09BCC/apply/"), true);
  assert.equal(isWorkableUrl("https://acme.workable.com/jobs/123"), true);
  assert.equal(isWorkableUrl("https://workable.com.evil.example/j/1"), false);
  assert.equal(isWorkableUrl("https://notworkable.com/j/1"), false);
  assert.equal(isWorkableUrl("not a url"), false);
});

test("workableStandardValueFor resolves stable-named identity fields", () => {
  const profile = {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1 555 010 2030",
    linkedinUrl: "https://linkedin.com/in/ada",
    portfolioUrl: "https://ada.dev",
    location: "London, UK",
  };
  assert.equal(workableStandardValueFor({ name: "firstname", id: "firstname", type: "text" }, profile), "Ada");
  assert.equal(workableStandardValueFor({ name: "lastname", id: "lastname", type: "text" }, profile), "Lovelace");
  assert.equal(workableStandardValueFor({ name: "email", id: "email", type: "email" }, profile), "ada@example.com");
  assert.equal(workableStandardValueFor({ name: "phone", id: "", type: "tel" }, profile), "+1 555 010 2030");
  assert.equal(workableStandardValueFor({ name: "address", id: "address", type: "text" }, profile), "London, UK");
  assert.equal(workableStandardValueFor({ name: "city", id: "city", type: "text" }, profile), "London");
  assert.equal(workableStandardValueFor({ name: "country", id: "country", type: "text" }, profile), "UK");
  // Label-driven fields (labels resolved from nearby containers).
  assert.equal(workableStandardValueFor({ name: "CA_9", id: "CA_9", type: "text", label: "LinkedIn Profile" }, profile), "https://linkedin.com/in/ada");
  assert.equal(workableStandardValueFor({ name: "CA_10", id: "CA_10", type: "text", label: "Portfolio website" }, profile), "https://ada.dev");
  // US locations resolve the country via the state inference.
  assert.equal(workableStandardValueFor({ name: "country", id: "country", type: "text" }, { ...profile, location: "Austin, TX" }), "United States");
  // CA_N/QA_N custom questions are NOT profile fields: answered from memory only.
  assert.equal(workableStandardValueFor({ name: "CA_24481", id: "CA_24481", type: "text", label: "What are your salary requirements?" }, profile), "");
  assert.equal(workableStandardValueFor({ name: "QA_6513608", id: "QA_6513608", type: "text", label: "List your clearance dates" }, profile), "");
});

test("workableStandardValueFor reuses first name for mononym last names", () => {
  assert.equal(workableStandardValueFor({ name: "lastname", id: "lastname", type: "text" }, { fullName: "Cher" }), "Cher");
});

test("isWorkableCustomField flags CA_N/QA_N custom question names", () => {
  assert.equal(isWorkableCustomField({ name: "CA_24481" }), true);
  assert.equal(isWorkableCustomField({ name: "QA_6513608" }), true);
  assert.equal(isWorkableCustomField({ name: "firstname" }), false);
  assert.equal(isWorkableCustomField({ name: "" }), false);
});

// --- Ashby URL + label resolution -------------------------------------------

test("isAshbyUrl classifies ashbyhq hosts and rejects lookalikes", () => {
  assert.equal(isAshbyUrl("https://jobs.ashbyhq.com/openai/c59e2e83-59a6-45bc-82cd-665c6a8a5761"), true);
  assert.equal(isAshbyUrl("https://jobs.ashbyhq.com/openai/uuid/application"), true);
  assert.equal(isAshbyUrl("https://ashbyhq.com.evil.example/jobs/1"), false);
  assert.equal(isAshbyUrl("https://notashbyhq.com/jobs/1"), false);
  assert.equal(isAshbyUrl("not a url"), false);
});

test("ashbyStandardValueFor resolves system fields and UUID-label fields", () => {
  const profile = {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1 555 010 2030",
    linkedinUrl: "https://linkedin.com/in/ada",
    portfolioUrl: "https://ada.dev",
    location: "London, UK",
  };
  // System fields by stable _systemfield_* id/name (single full-name field).
  assert.equal(ashbyStandardValueFor({ name: "_systemfield_name", id: "_systemfield_name", type: "text" }, profile), "Ada Lovelace");
  assert.equal(ashbyStandardValueFor({ name: "_systemfield_email", id: "_systemfield_email", type: "email" }, profile), "ada@example.com");
  // Phone is a UUID-named type=tel input.
  assert.equal(ashbyStandardValueFor({ name: "9f2b1c44-7a3e-4c5b-8d6a-1a2b3c4d5e6f", id: "", type: "tel" }, profile), "+1 555 010 2030");
  // Label-driven fields (labels resolved from nearby containers).
  assert.equal(ashbyStandardValueFor({ name: "uuid-1", id: "", type: "text", label: "LinkedIn Profile" }, profile), "https://linkedin.com/in/ada");
  assert.equal(ashbyStandardValueFor({ name: "uuid-2", id: "", type: "text", label: "Portfolio website" }, profile), "https://ada.dev");
  assert.equal(ashbyStandardValueFor({ name: "uuid-3", id: "", type: "text", label: "Current location" }, profile), "London, UK");
  // UUID-named custom questions are NOT profile fields: answered from memory only.
  assert.equal(ashbyStandardValueFor({ name: "uuid-4", id: "", type: "text", label: "Why do you want to work here?" }, profile), "");
  assert.equal(ashbyStandardValueFor({ name: "uuid-5", id: "", type: "textarea", label: "Cover letter" }, profile), "");
});

test("ashbyConsentLabel prefers consent text stored in the input name", () => {
  // Ashby legal consents carry the full text as the input `name`.
  const arbitration = "I acknowledge that I have opened, read, and understood the Arbitration Agreement";
  assert.equal(ashbyConsentLabel({ name: arbitration, label: "" }), arbitration);
  assert.equal(ashbyConsentLabel({ name: "uuid-1", label: "I agree to the privacy policy" }), "I agree to the privacy policy");
  assert.equal(ashbyConsentLabel({ name: "uuid-2", label: "Subscribe to updates" }), "Subscribe to updates");
  assert.equal(ashbyConsentLabel({ name: "uuid-3", label: "" }), "uuid-3");
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

for (const adapter of [genericAdapter, greenhouseAdapter, leverAdapter, ashbyAdapter, workableAdapter]) {
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

// --- resume experience -> employment history mapping -------------------------

test("isCurrentEndDate detects present/current end dates only", () => {
  assert.equal(isCurrentEndDate("Present"), true);
  assert.equal(isCurrentEndDate("present"), true);
  assert.equal(isCurrentEndDate("Current"), true);
  assert.equal(isCurrentEndDate("Dec 2020"), false);
  assert.equal(isCurrentEndDate("2020-12"), false);
  assert.equal(isCurrentEndDate(""), false);
  assert.equal(isCurrentEndDate(null), false);
});

test("mapResumeExperience maps resume entries and caps at 4", () => {
  const resumeExperience = [
    { role: "Senior Engineer", company_or_client: "Globex", start_date: "Jan 2021", end_date: "Present", location: "Remote", bullets: ["x"] },
    { role: "Engineer", company_or_client: "Initech", start_date: "2018-06", end_date: "Dec 2020", location: "Austin, TX" },
    { role: "", company_or_client: "", start_date: "2017", end_date: "2018" }, // empty -> dropped
    { role: "Intern", company_or_client: "Umbrella", start_date: "2016", end_date: "2017" },
    { role: "Aide", company_or_client: "Hooli", start_date: "2015", end_date: "2016" },
    { role: "Fifth", company_or_client: "Stark", start_date: "2014", end_date: "2015" },
  ];
  const mapped = mapResumeExperience(resumeExperience);
  assert.equal(mapped.length, 4, "empty entry dropped, capped at 4");
  assert.deepEqual(mapped[0], {
    company: "Globex", title: "Senior Engineer", startDate: "Jan 2021",
    endDate: "Present", location: "Remote", current: true,
  });
  assert.deepEqual(mapped[1], {
    company: "Initech", title: "Engineer", startDate: "2018-06",
    endDate: "Dec 2020", location: "Austin, TX", current: false,
  });
  assert.equal(mapped[2].company, "Umbrella");
  assert.equal(mapped[3].company, "Hooli");
  assert.equal(mapResumeExperience(null).length, 0);
  assert.equal(mapResumeExperience("nope").length, 0);
});

test("parseMonthYear parses month-name and numeric resume dates", () => {
  assert.deepEqual(parseMonthYear("Jan 2021"), { month: 1, monthName: "January", paddedMonth: "01", year: "2021" });
  assert.deepEqual(parseMonthYear("January 2021"), { month: 1, monthName: "January", paddedMonth: "01", year: "2021" });
  assert.deepEqual(parseMonthYear("2021-01"), { month: 1, monthName: "January", paddedMonth: "01", year: "2021" });
  assert.deepEqual(parseMonthYear("01/2021"), { month: 1, monthName: "January", paddedMonth: "01", year: "2021" });
  assert.deepEqual(parseMonthYear("Dec 2020"), { month: 12, monthName: "December", paddedMonth: "12", year: "2020" });
  assert.deepEqual(parseMonthYear("2020"), { month: null, monthName: null, paddedMonth: null, year: "2020" });
  assert.equal(parseMonthYear("Present"), null);
  assert.equal(parseMonthYear(""), null);
});

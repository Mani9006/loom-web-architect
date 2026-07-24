// Local mock e2e for the submission worker. Serves fixtures/mock-greenhouse.html
// over a loopback HTTP server and drives the REAL processJob() flow from
// scripts/applypass-browser-worker.mjs against it with the production safety
// gates. No real ATS, queue, or employer is touched: the queue edge function
// is stubbed by the same loopback server.
//
// Run: npm run test:adapters   (needs Chromium once: npx playwright install chromium)
//
// Note: the happy-path submit waits out the worker's 15s ATS-response watcher
// (a mock form never POSTs to *.greenhouse.io), so this file takes ~20s.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "fixtures", "mock-greenhouse.html");
const ashbyFixturePath = path.join(here, "fixtures", "mock-ashby.html");
const workableFixturePath = path.join(here, "fixtures", "mock-workable.html");
const WORKER_TOKEN = "mock-worker-token";

const PROFILE = {
  fullName: "Ada Lovelace",
  email: "ada.lovelace@example.com",
  phone: "+1 555 010 2030",
  location: "London, UK",
};
const ANSWERS = {
  "Why do you want to work at Acme?": "I want to build delightful user interfaces at Acme.",
  "years of professional experience with React": "5",
};
const ASHBY_ANSWERS = {
  ...ANSWERS,
  "Are you authorized to work in the US?": "Yes",
};
const WORKABLE_ANSWERS = {
  ...ASHBY_ANSWERS,
  // Explicit stored affirmative: the only legal basis for ticking the consent
  // checkbox (the adapter never auto-accepts consents).
  "I consent to the processing of my personal data": "I consent",
};

let server;
let baseUrl;
let browser = null;
let browserError = null;
let tmpRoot;
let resumePath;
let screenshotDir;
let queueRequests;

function startMockServer(fixtures) {
  queueRequests = [];
  server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const fixtureHtml = fixtures[url.pathname];
    if (fixtureHtml) {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(fixtureHtml);
      return;
    }
    if (url.pathname === "/functions/v1/applypass-agent-queue" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        queueRequests.push({ action: parsed.action, workerToken: req.headers["x-applypass-worker-token"] });
        res.setHeader("content-type", "application/json");
        if (parsed.action === "authorization-status") {
          res.end(JSON.stringify({ ok: true, authorized: true }));
        } else {
          res.end(JSON.stringify({ ok: true, task: {} }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

async function loadWorker(autoSubmit) {
  // Env is read at module scope; the query suffix forces a fresh module
  // instance so each test controls its own APPLYPASS_AUTO_SUBMIT gate.
  process.env.APPLYPASS_AUTO_SUBMIT = autoSubmit ? "true" : "false";
  return await import(`../applypass-browser-worker.mjs?autoSubmit=${autoSubmit}`);
}

function mockJob(approved, urlPath = "/apply") {
  return {
    id: "job-mock-1",
    title: "Senior Frontend Engineer",
    company: "Acme Corp",
    url: `${baseUrl}${urlPath}`,
    approvalReceipt: approved ? { approved: true, reviewedAt: new Date().toISOString() } : null,
  };
}

function mockPayload(answers = ANSWERS, portal = "greenhouse") {
  return { candidateProfile: PROFILE, answerMemory: answers, portal };
}

function mockTestPolicy(provider) {
  return { trustedOrigin: baseUrl, provider };
}

before(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "applypass-mock-e2e-"));
  resumePath = path.join(tmpRoot, "resume.pdf");
  await writeFile(resumePath, "%PDF-1.4\nmock resume bytes\n");
  screenshotDir = path.join(tmpRoot, "screenshots");

  const fixtureHtml = await readFile(fixturePath, "utf8");
  const ashbyFixtureHtml = await readFile(ashbyFixturePath, "utf8");
  const workableFixtureHtml = await readFile(workableFixturePath, "utf8");
  await startMockServer({ "/apply": fixtureHtml, "/ashby": ashbyFixtureHtml, "/workable": workableFixtureHtml });

  process.env.SUPABASE_URL = baseUrl;
  process.env.SUPABASE_ANON_KEY = "mock-anon-key";
  process.env.APPLYPASS_WORKER_TOKEN = WORKER_TOKEN;
  process.env.APPLYPASS_RUNTIME_ENV = "development";
  process.env.APPLYPASS_DEV_DIAGNOSTIC_SCREENSHOTS = "true";
  process.env.APPLYPASS_SCREENSHOT_DIR = screenshotDir;

  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    browserError = error;
  }
});

after(async () => {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server?.close(resolve));
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

function requireBrowser(t) {
  if (browser) return true;
  t.skip(`Chromium not installed (${browserError?.message?.split("\n")[0] || "unknown"}). Run: npx playwright install chromium`);
  return false;
}

test("mock e2e: fills, submits, and confirms receipt with all gates on", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(true);

  const result = await processJob(browser, "task-mock-submit", mockJob(true), mockPayload(), resumePath, "mock-worker:1", mockTestPolicy("greenhouse"));

  assert.equal(result.adapter, "greenhouse");
  assert.equal(result.status, "submitted");
  assert.equal(result.submitted, true);
  // 4 identity fields + 2 custom questions.
  assert.ok(result.filledCount >= 6, `expected >=6 filled fields, got ${result.filledCount}`);
  assert.equal(result.resumeUploaded, true);
  assert.equal(result.receipt?.applicationId, "MOCK-12345");
  assert.match(result.receipt?.containerText || "", /thank you for applying/i);
  assert.ok(result.screenshotPath && existsSync(result.screenshotPath), "receipt screenshot should exist");
  // Continuous-authorization re-check happened with the worker credential.
  const authCheck = queueRequests.find((req) => req.action === "authorization-status");
  assert.ok(authCheck, "worker should re-check authorization before submitting");
  assert.equal(authCheck.workerToken, WORKER_TOKEN);
});

test("mock e2e: missing approval receipt blocks submit but still fills", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(true);

  const result = await processJob(browser, "task-mock-no-approval", mockJob(false), mockPayload(), resumePath, "mock-worker:1", mockTestPolicy("greenhouse"));

  assert.equal(result.submitted, false);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.receipt, null);
  assert.ok(result.filledCount >= 6, `dry fill should still complete, got ${result.filledCount}`);
});

test("mock e2e: APPLYPASS_AUTO_SUBMIT=false blocks submit (dry-run)", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(false);

  const result = await processJob(browser, "task-mock-dry-run", mockJob(true), mockPayload(), resumePath, "mock-worker:1", mockTestPolicy("greenhouse"));

  assert.equal(result.submitted, false);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.receipt, null);
});


// --- Ashby mock e2e (mirrors the greenhouse cases above) --------------------

test("mock e2e ashby: fills, submits, and confirms receipt with all gates on", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(true);

  const result = await processJob(browser, "task-mock-ashby-submit", mockJob(true, "/ashby"), mockPayload(ASHBY_ANSWERS, "ashby"), resumePath, "mock-worker:1", mockTestPolicy("ashby"));

  assert.equal(result.adapter, "ashby");
  assert.equal(result.status, "submitted");
  assert.equal(result.submitted, true);
  // name + email + phone + 2 custom questions + 1 Yes/No pair.
  assert.ok(result.filledCount >= 6, `expected >=6 filled fields, got ${result.filledCount}`);
  assert.equal(result.resumeUploaded, true);
  assert.equal(result.receipt?.applicationId, "ASHBY-MOCK-678");
  assert.match(result.receipt?.containerText || result.receipt?.confirmationText || "", /application submitted/i);
  assert.ok(result.screenshotPath && existsSync(result.screenshotPath), "receipt screenshot should exist");
  const authCheck = queueRequests.filter((req) => req.action === "authorization-status").pop();
  assert.ok(authCheck, "worker should re-check authorization before submitting");
  assert.equal(authCheck.workerToken, WORKER_TOKEN);
});

test("mock e2e ashby: missing approval receipt blocks submit but still fills", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(true);

  const result = await processJob(browser, "task-mock-ashby-no-approval", mockJob(false, "/ashby"), mockPayload(ASHBY_ANSWERS, "ashby"), resumePath, "mock-worker:1", mockTestPolicy("ashby"));

  assert.equal(result.submitted, false);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.receipt, null);
  assert.ok(result.filledCount >= 6, `dry fill should still complete, got ${result.filledCount}`);
});

test("mock e2e ashby: APPLYPASS_AUTO_SUBMIT=false blocks submit (dry-run)", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(false);

  const result = await processJob(browser, "task-mock-ashby-dry-run", mockJob(true, "/ashby"), mockPayload(ASHBY_ANSWERS, "ashby"), resumePath, "mock-worker:1", mockTestPolicy("ashby"));

  assert.equal(result.submitted, false);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.receipt, null);
});

// --- Workable mock e2e (mirrors the ashby cases above) ----------------------

test("mock e2e workable: fills, submits, and confirms receipt with all gates on", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(true);

  const result = await processJob(browser, "task-mock-workable-submit", mockJob(true, "/workable"), mockPayload(WORKABLE_ANSWERS, "workable"), resumePath, "mock-worker:1", mockTestPolicy("workable"));

  assert.equal(result.adapter, "workable");
  assert.equal(result.status, "submitted");
  assert.equal(result.submitted, true);
  // first/last name + email + phone + address + city + country + 2 custom
  // questions + 1 YES/NO radio group + 1 consent checkbox.
  assert.ok(result.filledCount >= 8, `expected >=8 filled fields, got ${result.filledCount}`);
  assert.equal(result.resumeUploaded, true);
  assert.equal(result.receipt?.applicationId, "WK-MOCK-123");
  assert.match(result.receipt?.containerText || "", /thank you for applying/i);
  assert.ok(result.screenshotPath && existsSync(result.screenshotPath), "receipt screenshot should exist");
  const authCheck = queueRequests.filter((req) => req.action === "authorization-status").pop();
  assert.ok(authCheck, "worker should re-check authorization before submitting");
  assert.equal(authCheck.workerToken, WORKER_TOKEN);
});

test("mock e2e workable: missing approval receipt blocks submit but still fills", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(true);

  const result = await processJob(browser, "task-mock-workable-no-approval", mockJob(false, "/workable"), mockPayload(WORKABLE_ANSWERS, "workable"), resumePath, "mock-worker:1", mockTestPolicy("workable"));

  assert.equal(result.submitted, false);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.receipt, null);
  assert.ok(result.filledCount >= 8, `dry fill should still complete, got ${result.filledCount}`);
});

test("mock e2e workable: APPLYPASS_AUTO_SUBMIT=false blocks submit (dry-run)", async (t) => {
  if (!requireBrowser(t)) return;
  const { processJob } = await loadWorker(false);

  const result = await processJob(browser, "task-mock-workable-dry-run", mockJob(true, "/workable"), mockPayload(WORKABLE_ANSWERS, "workable"), resumePath, "mock-worker:1", mockTestPolicy("workable"));

  assert.equal(result.submitted, false);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.receipt, null);
});

// Browser test for the Greenhouse EMPLOYMENT HISTORY section filling.
// Serves fixtures/mock-greenhouse.html (one initial block + an
// "+ Add Another Employment" button that clones it) over loopback HTTP and
// drives the exported fillEmploymentHistory() helper with two resume-derived
// entries: the first current ("Present" -> checkbox ticked), the second with
// concrete start/end month+year.
//
// Run: npm run test:adapters   (needs Chromium once: npx playwright install chromium)

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { fillEmploymentHistory } from "./greenhouse.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "fixtures", "mock-greenhouse.html");

let server;
let baseUrl;
let browser = null;
let browserError = null;

before(async () => {
  const fixtureHtml = await readFile(fixturePath, "utf8");
  server = http.createServer((req, res) => {
    if (new URL(req.url || "/", "http://127.0.0.1").pathname === "/apply") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(fixtureHtml);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    browserError = error;
  }
});

after(async () => {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server?.close(resolve));
});

test("fillEmploymentHistory fills 2 entries and clones a block via Add Another", async (t) => {
  if (!browser) {
    t.skip(`Chromium not installed (${browserError?.message?.split("\n")[0] || "unknown"}). Run: npx playwright install chromium`);
    return;
  }
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/apply`);

    const experience = [
      { company: "Globex Corporation", title: "Senior Engineer", startDate: "Jan 2021", endDate: "Present", location: "Remote", current: true },
      { company: "Initech", title: "Software Engineer", startDate: "2018-06", endDate: "Dec 2020", location: "Austin, TX", current: false },
    ];
    const result = await fillEmploymentHistory(page, experience);

    assert.equal(result.detected, true);
    assert.equal(result.blocksFilled, 2, `expected 2 blocks filled, got ${JSON.stringify(result)}`);
    assert.equal(result.addedBlocks, 1, "second entry should come from a cloned block");
    assert.ok(result.fieldsFilled >= 10, `expected >=10 fields filled, got ${result.fieldsFilled}`);

    const state = await page.evaluate(() => {
      const value = (id) => document.getElementById(id)?.value ?? null;
      return {
        company0: value("eh_company_0"),
        title0: value("eh_title_0"),
        location0: value("eh_location_0"),
        startMonth0: value("eh_start_month_0"),
        startYear0: value("eh_start_year_0"),
        endMonth0: value("eh_end_month_0"),
        endYear0: value("eh_end_year_0"),
        current0: document.getElementById("eh_current_0")?.checked ?? null,
        company1: value("eh_company_1"),
        title1: value("eh_title_1"),
        location1: value("eh_location_1"),
        startMonth1: value("eh_start_month_1"),
        startYear1: value("eh_start_year_1"),
        endMonth1: value("eh_end_month_1"),
        endYear1: value("eh_end_year_1"),
        current1: document.getElementById("eh_current_1")?.checked ?? null,
        blockCount: document.querySelectorAll(".employment-block").length,
      };
    });

    assert.equal(state.blockCount, 2);
    // Block 0: current role -> start filled, checkbox ticked, end left blank.
    assert.equal(state.company0, "Globex Corporation");
    assert.equal(state.title0, "Senior Engineer");
    assert.equal(state.location0, "Remote");
    assert.equal(state.startMonth0, "1");
    assert.equal(state.startYear0, "2021");
    assert.equal(state.current0, true);
    assert.equal(state.endMonth0, "");
    assert.equal(state.endYear0, "");
    // Block 1 (cloned): concrete start + end dates.
    assert.equal(state.company1, "Initech");
    assert.equal(state.title1, "Software Engineer");
    assert.equal(state.location1, "Austin, TX");
    assert.equal(state.startMonth1, "6");
    assert.equal(state.startYear1, "2018");
    assert.equal(state.endMonth1, "12");
    assert.equal(state.endYear1, "2020");
    assert.equal(state.current1, false);
  } finally {
    await page.close();
  }
});

test("fillEmploymentHistory skips blocks that already carry values", async (t) => {
  if (!browser) {
    t.skip(`Chromium not installed (${browserError?.message?.split("\n")[0] || "unknown"}).`);
    return;
  }
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/apply`);
    // Simulate the standard current-company answer having pre-filled block 0.
    await page.locator("#eh_company_0").fill("Already There Inc");

    const experience = [
      { company: "Globex Corporation", title: "Senior Engineer", startDate: "Jan 2021", endDate: "Present", location: "Remote", current: true },
    ];
    const result = await fillEmploymentHistory(page, experience);

    assert.equal(result.blocksFilled, 0, "pre-filled block must not be overwritten");
    assert.equal(await page.locator("#eh_company_0").inputValue(), "Already There Inc");
  } finally {
    await page.close();
  }
});

test("fillEmploymentHistory no-ops without experience entries", async (t) => {
  if (!browser) {
    t.skip(`Chromium not installed (${browserError?.message?.split("\n")[0] || "unknown"}).`);
    return;
  }
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/apply`);
    const result = await fillEmploymentHistory(page, []);
    assert.deepEqual(result, { detected: false, blocksDetected: 0, blocksFilled: 0, fieldsFilled: 0, addedBlocks: 0 });
    assert.equal(await page.locator("#eh_company_0").inputValue(), "");
  } finally {
    await page.close();
  }
});

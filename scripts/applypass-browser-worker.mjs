#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const WORKER_TOKEN = process.env.APPLYPASS_WORKER_TOKEN;
const WORKER_ID = process.env.APPLYPASS_WORKER_ID || `applypass-worker-${os.hostname()}`;
const POLL_MS = Number(process.env.APPLYPASS_WORKER_POLL_MS || 5000);
const AUTO_SUBMIT = String(process.env.APPLYPASS_AUTO_SUBMIT || "false").toLowerCase() === "true";
const SCREENSHOT_DIR = process.env.APPLYPASS_SCREENSHOT_DIR || "";

const once = process.argv.includes("--once");
const maxTasksArg = process.argv.find((arg) => arg.startsWith("--max-tasks="));
const maxTasks = maxTasksArg ? Number(maxTasksArg.split("=")[1]) : Number(process.env.APPLYPASS_MAX_TASKS || 0);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !WORKER_TOKEN) {
  console.error("Missing required env: SUPABASE_URL, SUPABASE_ANON_KEY, APPLYPASS_WORKER_TOKEN");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function queueCall(payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/applypass-agent-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "x-applypass-worker-token": WORKER_TOKEN,
      "x-worker-id": WORKER_ID,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Queue API ${response.status}: ${body}`);
  }

  return response.json();
}

async function claimNextTask() {
  const payload = await queueCall({ action: "claim-next", workerId: WORKER_ID });
  return payload?.task || null;
}

async function heartbeat(taskId, log) {
  return await queueCall({ action: "heartbeat", taskId, log });
}

async function completeTask(taskId, result, log) {
  return await queueCall({ action: "complete", taskId, result, log });
}

async function failTask(taskId, errorMessage, result, log) {
  return await queueCall({ action: "fail", taskId, errorMessage, result, log });
}

async function maybeScreenshot(page, taskId, jobId) {
  if (!SCREENSHOT_DIR) return null;
  const safeTask = String(taskId || "task").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeJob = String(jobId || "job").replace(/[^a-zA-Z0-9_-]/g, "_");
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${safeTask}-${safeJob}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

async function fillCommonFields(page, profile = {}, answerMemory = {}) {
  return await page.evaluate(({ profileData, memoryData }) => {
    const profile = profileData || {};
    const answerEntries = Object.entries(memoryData || {})
      .map(([k, v]) => [String(k).toLowerCase(), String(v)])
      .filter(([, v]) => v.trim().length > 0);

    const fieldMappings = [
      { keys: ["full name", "name", "first name"], value: profile.fullName || "" },
      { keys: ["email", "e-mail"], value: profile.email || "" },
      { keys: ["phone", "mobile", "contact"], value: profile.phone || "" },
      { keys: ["linkedin"], value: profile.linkedinUrl || "" },
      { keys: ["portfolio", "website", "github"], value: profile.portfolioUrl || "" },
      { keys: ["location", "city", "address"], value: profile.location || "" },
      { keys: ["salary", "compensation", "expected pay"], value: profile.expectedSalary || "" },
      { keys: ["authorization", "sponsorship", "work permit", "visa"], value: profile.workAuthorization || "" },
      { keys: ["notice", "joining", "start date"], value: profile.noticePeriod || "" },
      { keys: ["experience", "years"], value: profile.yearsExperience || "" },
      { keys: ["title", "current role", "designation"], value: profile.currentTitle || "" },
    ].filter((item) => String(item.value || "").trim().length > 0);

    function findLabelText(el) {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent || "";
      }
      const parentLabel = el.closest("label");
      if (parentLabel) return parentLabel.textContent || "";
      const parent = el.parentElement;
      if (parent) {
        const siblingLabel = parent.querySelector("label");
        if (siblingLabel) return siblingLabel.textContent || "";
      }
      return "";
    }

    function metadata(el) {
      const parts = [
        el.getAttribute("name") || "",
        el.getAttribute("id") || "",
        el.getAttribute("placeholder") || "",
        el.getAttribute("aria-label") || "",
        findLabelText(el),
      ];
      return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    }

    function isUsableField(el) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (el.hasAttribute("disabled") || el.hasAttribute("readonly")) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function fillElement(el, value) {
      if (!value) return false;
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.value.trim()) {
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      if (el instanceof HTMLSelectElement && !el.value) {
        const target = value.toLowerCase();
        let matched = false;
        for (const option of Array.from(el.options)) {
          if (option.value.toLowerCase() === target || option.textContent?.toLowerCase().includes(target)) {
            el.value = option.value;
            matched = true;
            break;
          }
        }
        if (matched) {
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    function bestMemoryAnswer(meta) {
      let best = "";
      let bestScore = 0;

      for (const [q, a] of answerEntries) {
        const qTokens = q.split(" ").filter((t) => t.length > 3);
        if (qTokens.length === 0) continue;
        let score = 0;
        for (const token of qTokens) {
          if (meta.includes(token)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }

      return bestScore >= 2 ? best : "";
    }

    const fields = Array.from(document.querySelectorAll("input, textarea, select"));
    let filledCount = 0;

    for (const node of fields) {
      const el = node;
      if (!isUsableField(el)) continue;
      const meta = metadata(el);
      if (!meta) continue;

      let filled = false;
      for (const map of fieldMappings) {
        if (map.keys.some((k) => meta.includes(k))) {
          filled = fillElement(el, String(map.value || ""));
          if (filled) break;
        }
      }

      if (!filled && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && (el.type === "text" || el.type === "search")))) {
        const answer = bestMemoryAnswer(meta);
        filled = fillElement(el, answer);
      }

      if (filled) filledCount += 1;
    }

    return { filledCount, totalFields: fields.length };
  }, {
    profileData: profile,
    memoryData: answerMemory,
  });
}

async function detectSubmitButton(page) {
  const candidates = [
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Send application")',
    'button:has-text("Continue")',
    'input[type="submit"]',
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      if (await locator.isVisible().catch(() => false)) {
        const label = (await locator.textContent().catch(() => "")) || selector;
        return { selector, label: label.trim() || selector };
      }
    }
  }

  return null;
}

async function processJob(browser, taskId, job, payload) {
  const startedAt = Date.now();
  const result = {
    jobId: String(job?.id || ""),
    title: String(job?.title || ""),
    company: String(job?.company || ""),
    url: String(job?.url || ""),
    status: "failed",
    filledCount: 0,
    totalFields: 0,
    submitButton: null,
    submitted: false,
    screenshotPath: null,
    error: null,
    durationMs: 0,
  };

  const url = result.url;
  if (!url.startsWith("http")) {
    result.error = "Invalid job URL";
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);

    const filled = await fillCommonFields(page, payload?.candidateProfile || {}, payload?.answerMemory || {});
    result.filledCount = Number(filled?.filledCount || 0);
    result.totalFields = Number(filled?.totalFields || 0);

    const submitButton = await detectSubmitButton(page);
    result.submitButton = submitButton?.label || null;

    if (submitButton && AUTO_SUBMIT) {
      await page.locator(submitButton.selector).first().click({ timeout: 10000 });
      await page.waitForTimeout(1500);
      result.submitted = true;
    }

    result.screenshotPath = await maybeScreenshot(page, taskId, result.jobId);
    result.status = "processed";
    result.durationMs = Date.now() - startedAt;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown browser error";
    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    await context.close();
  }
}

async function processTask(task) {
  const taskId = String(task?.id || "");
  const payload = task?.payload || {};
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  const started = nowIso();
  const jobResults = [];

  if (jobs.length === 0) {
    await failTask(taskId, "Task has no jobs.", { jobs: [] }, {
      level: "error",
      workerId: WORKER_ID,
      at: nowIso(),
      message: "Task payload missing jobs",
    });
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    await heartbeat(taskId, {
      level: "info",
      workerId: WORKER_ID,
      at: nowIso(),
      message: `Started task with ${jobs.length} jobs`,
    });

    for (const job of jobs) {
      await heartbeat(taskId, {
        level: "info",
        workerId: WORKER_ID,
        at: nowIso(),
        message: `Processing job: ${String(job?.title || "Unknown")}`,
      });

      const result = await processJob(browser, taskId, job, payload);
      jobResults.push(result);

      await heartbeat(taskId, {
        level: result.status === "processed" ? "info" : "warn",
        workerId: WORKER_ID,
        at: nowIso(),
        message: result.status === "processed"
          ? `Processed ${result.title}`
          : `Failed ${result.title}: ${result.error}`,
        jobId: result.jobId,
      });
    }
  } finally {
    await browser.close();
  }

  const success = jobResults.filter((r) => r.status === "processed").length;
  const failed = jobResults.length - success;

  const summary = {
    workerId: WORKER_ID,
    startedAt: started,
    completedAt: nowIso(),
    autoSubmit: AUTO_SUBMIT,
    success,
    failed,
    jobs: jobResults,
  };

  if (success === 0) {
    await failTask(taskId, "All jobs failed in worker run", summary, {
      level: "error",
      workerId: WORKER_ID,
      at: nowIso(),
      message: "Worker run finished with zero successful jobs",
    });
  } else {
    await completeTask(taskId, summary, {
      level: "info",
      workerId: WORKER_ID,
      at: nowIso(),
      message: `Worker completed task. Success: ${success}, Failed: ${failed}`,
    });
  }
}

async function run() {
  console.log(`[ApplyPass Worker] Started as ${WORKER_ID}. once=${once} maxTasks=${maxTasks || "unlimited"}`);
  console.log(`[ApplyPass Worker] Auto submit: ${AUTO_SUBMIT ? "ON" : "OFF"}`);

  let processed = 0;

  while (true) {
    try {
      const task = await claimNextTask();

      if (!task) {
        if (once) break;
        if (maxTasks > 0 && processed >= maxTasks) break;
        await sleep(POLL_MS);
        continue;
      }

      console.log(`[ApplyPass Worker] Claimed task ${task.id}`);
      await processTask(task);
      processed += 1;

      if (once) break;
      if (maxTasks > 0 && processed >= maxTasks) break;
    } catch (error) {
      console.error(`[ApplyPass Worker] Error: ${error instanceof Error ? error.message : String(error)}`);
      if (once) break;
      await sleep(POLL_MS);
    }
  }

  console.log(`[ApplyPass Worker] Exiting. processed=${processed}`);
}

run().catch((error) => {
  console.error(`[ApplyPass Worker] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

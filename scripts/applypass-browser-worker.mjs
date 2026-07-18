#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function requestVerificationCode(taskId, jobId) {
  const response = await queueCall({ action: "verification-code", taskId, jobId });
  return response?.available && typeof response?.code === "string" ? response.code : null;
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
    const nameParts = String(profile.fullName || "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    const answerEntries = Object.entries(memoryData || {})
      .map(([k, v]) => [String(k).toLowerCase(), String(v)])
      .filter(([, v]) => v.trim().length > 0);

    const fieldMappings = [
      { keys: ["first name", "given name"], value: firstName },
      { keys: ["last name", "family name", "surname"], value: lastName },
      { keys: ["full name", "legal name"], value: profile.fullName || "" },
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

async function findVerificationField(page) {
  return await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("input"));
    for (let index = 0; index < candidates.length; index += 1) {
      const input = candidates[index];
      const id = input.getAttribute("id") || "";
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
      const metadata = [
        input.getAttribute("name") || "",
        id,
        input.getAttribute("placeholder") || "",
        input.getAttribute("aria-label") || "",
        input.getAttribute("autocomplete") || "",
        label,
        input.closest("label")?.textContent || "",
      ].join(" ").toLowerCase();
      const rect = input.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && !input.disabled && !input.readOnly;
      if (visible && /(one[- ]?time|verification|security|authentication|passcode|\botp\b)/i.test(metadata)) {
        return { index };
      }
    }
    return null;
  });
}

async function fillVerificationCode(page, fieldIndex, code) {
  const inputs = page.locator("input");
  const input = inputs.nth(fieldIndex);
  await input.fill(code);
  await input.dispatchEvent("change");
}

async function handleApplicationVerification(page, taskId, jobId) {
  const field = await findVerificationField(page);
  if (!field) return { requested: false, completed: false };

  // The worker stays active only while this application is waiting for a
  // code. The code is consumed server-side after one successful retrieval.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = await requestVerificationCode(taskId, jobId);
    if (code) {
      await fillVerificationCode(page, field.index, code);
      return { requested: true, completed: true };
    }
    if (attempt > 0 && attempt % 3 === 0) {
      await heartbeat(taskId, {
        level: "info",
        workerId: WORKER_ID,
        at: nowIso(),
        message: "Waiting for application email verification",
        jobId,
      });
    }
    await sleep(5000);
  }
  return { requested: true, completed: false };
}

async function downloadResumeFile(payload) {
  const url = String(payload?.resumeFileUrl || "").trim();
  if (!url.startsWith("https://")) return { directory: null, filePath: null };

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Resume download failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Resume file must be between 1 byte and 10 MB");
  }

  const contentType = response.headers.get("content-type") || "";
  const extension = contentType.includes("wordprocessingml") ? ".docx" : ".pdf";
  const directory = await mkdtemp(path.join(os.tmpdir(), "resumepreps-worker-"));
  const filePath = path.join(directory, `tailored-resume${extension}`);
  await writeFile(filePath, bytes);
  return { directory, filePath };
}

async function uploadResume(page, filePath) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  if (count === 0) return { fileInputs: 0, resumeInputs: 0, uploaded: 0, requiredMissing: false };

  let resumeInputs = 0;
  let uploaded = 0;
  let requiredMissing = false;

  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    const details = await input.evaluate((element) => {
      const id = element.getAttribute("id") || "";
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
      const parentText = element.closest("label")?.textContent || element.parentElement?.textContent || "";
      const metadata = [
        element.getAttribute("name") || "",
        id,
        element.getAttribute("aria-label") || "",
        label,
        parentText,
      ].join(" ").toLowerCase();
      return {
        isResume: /\b(resume|résumé|cv|curriculum vitae)\b/i.test(metadata),
        required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
      };
    });

    const isResumeInput = details.isResume || count === 1;
    if (!isResumeInput) {
      if (details.required) requiredMissing = true;
      continue;
    }

    resumeInputs += 1;
    if (filePath) {
      await input.setInputFiles(filePath);
      uploaded += 1;
    } else if (details.required) {
      requiredMissing = true;
    }
  }

  if (resumeInputs > 0 && uploaded === 0) requiredMissing = true;
  return { fileInputs: count, resumeInputs, uploaded, requiredMissing };
}

async function inspectReadiness(page) {
  return await page.evaluate(() => {
    const required = Array.from(document.querySelectorAll("input[required], textarea[required], select[required], [aria-required='true']"));
    const incomplete = required.filter((node) => {
      if (node instanceof HTMLInputElement) {
        if (["checkbox", "radio"].includes(node.type)) return !node.checked;
        if (node.type === "file") return !node.files?.length;
        return !node.value.trim();
      }
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) return !node.value.trim();
      return false;
    });
    return { requiredFields: required.length, incompleteRequired: incomplete.length };
  });
}

async function detectSubmitButton(page) {
  return await page.evaluate(() => {
    const accepted = new Set(["submit", "submit application", "send application"]);
    const elements = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const label = (element.textContent || element.getAttribute("value") || "").toLowerCase().replace(/\s+/g, " ").trim();
      const rect = element.getBoundingClientRect();
      const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
      if (accepted.has(label) && rect.width > 0 && rect.height > 0 && !disabled) return { index, label };
    }
    return null;
  });
}

async function confirmSubmission(page, previousUrl) {
  await page.waitForTimeout(1800);
  const pageState = await page.evaluate(() => ({
    text: document.body?.innerText?.slice(0, 8000).toLowerCase() || "",
    invalidFields: document.querySelectorAll(':invalid, [aria-invalid="true"]').length,
  }));
  const confirmed = /(application (?:has been )?(?:received|submitted)|thank you for applying|thanks for applying|submission confirmed)/i.test(pageState.text);
  return {
    confirmed,
    urlChanged: page.url() !== previousUrl,
    invalidFields: pageState.invalidFields,
  };
}

async function processJob(browser, taskId, job, payload, resumeFilePath) {
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
    resumeUploaded: false,
    verificationHandled: false,
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

    const upload = await uploadResume(page, resumeFilePath);
    result.resumeUploaded = upload.uploaded > 0;

    const verification = await handleApplicationVerification(page, taskId, result.jobId);
    result.verificationHandled = verification.completed;

    const submitButton = await detectSubmitButton(page);
    result.submitButton = submitButton?.label || null;

    const approval = job?.approvalReceipt || payload?.approvalReceipts?.[result.jobId];
    const approved = approval?.approved === true && typeof approval?.reviewedAt === "string";

    const readiness = await inspectReadiness(page);
    const blocked = upload.requiredMissing || readiness.incompleteRequired > 0 || (verification.requested && !verification.completed);

    if (submitButton && AUTO_SUBMIT && approved && !blocked) {
      const previousUrl = page.url();
      const finalButtons = page.locator('button, input[type="submit"]');
      await finalButtons.nth(submitButton.index).click({ timeout: 10000 });
      const confirmation = await confirmSubmission(page, previousUrl);
      result.submitted = confirmation.confirmed;
      result.status = confirmation.confirmed ? "submitted" : "needs_review";
      if (!confirmation.confirmed) {
        result.error = `Final click did not produce a verifiable receipt (${confirmation.invalidFields} invalid fields).`;
      }
    } else if (submitButton) {
      result.status = blocked ? "needs_review" : "ready_for_review";
      if (blocked) {
        result.error = upload.requiredMissing
          ? "A required attachment is missing; submission was not attempted."
          : verification.requested && !verification.completed
            ? "Email verification is required. Connect the application inbox or request a new code, then retry."
          : `${readiness.incompleteRequired} required field(s) still need review; submission was not attempted.`;
      }
    }

    result.screenshotPath = await maybeScreenshot(page, taskId, result.jobId);
    if (result.status === "failed") result.status = "processed";
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
  let resumeFile = { directory: null, filePath: null };

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
    resumeFile = await downloadResumeFile(payload);
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

      const result = await processJob(browser, taskId, job, payload, resumeFile.filePath);
      jobResults.push(result);

      await heartbeat(taskId, {
        level: ["processed", "ready_for_review", "needs_review", "submitted"].includes(result.status) ? "info" : "warn",
        workerId: WORKER_ID,
        at: nowIso(),
        message: ["processed", "ready_for_review", "needs_review", "submitted"].includes(result.status)
          ? `${result.status}: ${result.title}`
          : `Failed ${result.title}: ${result.error}`,
        jobId: result.jobId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await failTask(taskId, message, { jobs: jobResults }, {
      level: "error",
      workerId: WORKER_ID,
      at: nowIso(),
      message,
    });
    return;
  } finally {
    await browser.close();
    if (resumeFile.directory) await rm(resumeFile.directory, { recursive: true, force: true });
  }

  const success = jobResults.filter((r) => ["processed", "ready_for_review", "needs_review", "submitted"].includes(r.status)).length;
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

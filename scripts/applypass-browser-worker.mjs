#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const WORKER_TOKEN = process.env.APPLYPASS_WORKER_TOKEN || process.env.WORKER_AUTH_TOKEN;
const WORKER_ID = process.env.APPLYPASS_WORKER_ID || `applypass-worker-${os.hostname()}`;
const POLL_MS = Number(process.env.APPLYPASS_WORKER_POLL_MS || 5000);
const CONFIGURED_CONCURRENCY = Math.min(12, Math.max(1, Number(process.env.APPLYPASS_WORKER_CONCURRENCY || 4)));
const AUTO_SUBMIT = String(process.env.APPLYPASS_AUTO_SUBMIT || "false").toLowerCase() === "true";
const SCREENSHOT_DIR = process.env.APPLYPASS_SCREENSHOT_DIR || "";

const once = process.argv.includes("--once");
const maxTasksArg = process.argv.find((arg) => arg.startsWith("--max-tasks="));
const maxTasks = maxTasksArg ? Number(maxTasksArg.split("=")[1]) : Number(process.env.APPLYPASS_MAX_TASKS || 0);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !WORKER_TOKEN) {
  console.error("Missing required env: SUPABASE_URL, a Supabase anon/publishable key, and APPLYPASS_WORKER_TOKEN or WORKER_AUTH_TOKEN");
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

function matchingMemoryAnswer(answerMemory, label) {
  const labelTokens = normalize(label).split(" ").filter((token) => token.length > 3);
  let bestAnswer = "";
  let bestScore = 0;
  for (const [question, answer] of Object.entries(answerMemory || {})) {
    const response = String(answer || "").trim();
    if (!response) continue;
    const questionText = normalize(question);
    const score = labelTokens.reduce((total, token) => total + (questionText.includes(token) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = response;
    }
  }
  return bestScore >= 2 ? bestAnswer : "";
}

function inferCountry(location) {
  const value = normalize(location);
  if (!value) return "";
  if (/\b(united states|u\.?s\.?a?|usa)\b/i.test(value)) return "United States";
  const stateNames = /(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)/i;
  const stateCodes = /(?:,|\s)\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)(?:\s|,|$)/i;
  return stateNames.test(value) || stateCodes.test(value) ? "United States" : "";
}

function inferAuthorizationAnswers(profile, answerMemory) {
  const relevantMemory = Object.entries(answerMemory || {})
    .filter(([question]) => /(authoriz|sponsor|visa|work permit)/i.test(question))
    .map(([, answer]) => String(answer || ""));
  const text = normalize([profile?.workAuthorization, ...relevantMemory].filter(Boolean).join(". "));
  let workAuthorized = "";
  let sponsorshipRequired = "";

  if (/(not|no)\s+(currently\s+)?authorized|cannot\s+work/i.test(text)) workAuthorized = "No";
  else if (/authoriz|citizen|permanent resident|green card|\bead\b/i.test(text)) workAuthorized = "Yes";

  if (typeof profile?.requiresSponsorship === "boolean") {
    sponsorshipRequired = profile.requiresSponsorship ? "Yes" : "No";
  } else if (/(do not|don.t|without|no)\s+(currently\s+)?(require|need)[^.;]{0,30}sponsor|no sponsorship/i.test(text)) {
    sponsorshipRequired = "No";
  } else if (/(require|need)[^.;]{0,30}sponsor|sponsorship required/i.test(text)) {
    sponsorshipRequired = "Yes";
  }
  return { workAuthorized, sponsorshipRequired };
}

async function chooseVisibleOption(page, input, desired, { allowFirstMatch = false, typeSequentially = false, searchValue = "" } = {}) {
  if (!desired) return false;
  const committed = async () => await input.evaluate((element) => {
    const selectedText = (element.parentElement?.parentElement?.innerText || "").replace(/\s+/g, " ").trim();
    return Boolean(selectedText) && !/^(select|choose|search)(\.\.\.)?$/i.test(selectedText);
  }).catch(() => false);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  if (allowFirstMatch) {
    await input.fill("");
    const query = searchValue || desired;
    if (typeSequentially) await input.pressSequentially(query, { delay: 35 });
    else await input.fill(query);
  }
  await page.waitForTimeout(120);

  const options = page.locator('[role="option"]:visible');
  await options.first().waitFor({ state: "visible", timeout: allowFirstMatch ? 2500 : 1000 }).catch(() => {});
  const count = await options.count();
  const target = normalize(desired);
  let fallback = null;
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const optionText = normalize(await option.textContent());
    if (!optionText) continue;
    if (optionText === target || optionText.startsWith(`${target} `) || optionText.startsWith(`${target}+`)) {
      await option.click();
      return await committed();
    }
    if (!fallback && (optionText.includes(target) || target.includes(optionText))) fallback = option;
  }
  if (fallback) {
    await fallback.click();
    return await committed();
  }
  if (allowFirstMatch && count > 0) {
    await options.first().click();
    return await committed();
  }
  if (allowFirstMatch) {
    await input.press("ArrowDown").catch(() => {});
    await input.press("Enter").catch(() => {});
    if (await committed()) return true;
  }
  await page.keyboard.press("Escape");
  return false;
}

async function fillCustomFields(page, profile = {}, answerMemory = {}, approved = false) {
  const { workAuthorized, sponsorshipRequired } = inferAuthorizationAnswers(profile, answerMemory);
  const descriptors = await page.locator('input[role="combobox"][aria-required="true"]').evaluateAll((elements) => elements.map((element) => {
    const id = element.getAttribute("id") || "";
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
    return { id, label: label.replace(/\s+/g, " ").trim() };
  }));
  let filledCount = 0;
  let demographicFields = 0;
  let declinedDemographicFields = 0;

  for (const descriptor of descriptors) {
    if (!descriptor.id) continue;
    const input = page.locator(`input[id="${descriptor.id.replaceAll('"', '\\"')}"]`).first();
    const label = normalize(descriptor.label);
    let desired = "";
    let allowFirstMatch = false;
    let typeSequentially = false;
    let searchValue = "";

    if (descriptor.id === "country" || /^country\b/.test(label)) {
      desired = inferCountry(profile.location);
      allowFirstMatch = true;
    } else if (descriptor.id === "candidate-location" || /location.*city|city.*location/.test(label)) {
      desired = String(profile.location || "").trim();
      allowFirstMatch = true;
      typeSequentially = true;
      searchValue = desired.split(",")[0]?.trim() || desired;
    } else if (/currently authorized|authorized to work/.test(label)) {
      desired = workAuthorized;
    } else if (/sponsor|immigration/.test(label)) {
      desired = sponsorshipRequired;
    } else if (/privacy policy|selecting.*agree|i agree/.test(label)) {
      desired = approved ? "I agree" : "";
    } else if (/gender|transgender|sexual orientation|disabilit|veteran|military|ethnicit|race/.test(label)) {
      demographicFields += 1;
      desired = approved ? "I don't wish to answer" : "";
    } else {
      desired = matchingMemoryAnswer(answerMemory, descriptor.label);
    }

    if (await chooseVisibleOption(page, input, desired, { allowFirstMatch, typeSequentially, searchValue })) {
      filledCount += 1;
      if (/gender|transgender|sexual orientation|disabilit|veteran|military|ethnicit|race/.test(label)) {
        declinedDemographicFields += 1;
      }
    }
  }

  // A required demographic consent is acknowledged only when the applicant
  // approved submission and every demographic response was explicitly
  // declined. This avoids inventing sensitive attributes.
  if (approved && demographicFields > 0 && declinedDemographicFields === demographicFields) {
    const requiredCheckboxes = page.locator('input[type="checkbox"][required], input[type="checkbox"][aria-required="true"]');
    const checkboxCount = await requiredCheckboxes.count();
    for (let index = 0; index < checkboxCount; index += 1) {
      const checkbox = requiredCheckboxes.nth(index);
      const metadata = normalize(await checkbox.evaluate((element) => {
        const id = element.getAttribute("id") || "";
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
        return [label, element.closest("label")?.textContent || ""].join(" ");
      }));
      if (/consent|demographic/.test(metadata) && !(await checkbox.isChecked())) {
        await checkbox.check();
        filledCount += 1;
      }
    }
  }

  return { filledCount, workAuthorizedKnown: Boolean(workAuthorized), sponsorshipKnown: Boolean(sponsorshipRequired) };
}

async function queueCall(payload, workerId = WORKER_ID) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/applypass-agent-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "x-applypass-worker-token": WORKER_TOKEN,
      "x-worker-id": workerId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Queue API ${response.status}: ${body}`);
  }

  return response.json();
}

async function claimNextTask(workerId) {
  const payload = await queueCall({ action: "claim-next", workerId }, workerId);
  return payload?.task || null;
}

async function heartbeat(taskId, log, workerId) {
  return await queueCall({ action: "heartbeat", taskId, log, workerId }, workerId);
}

async function completeTask(taskId, result, log, workerId) {
  return await queueCall({ action: "complete", taskId, result, log, workerId }, workerId);
}

async function failTask(taskId, errorMessage, result, log, workerId) {
  return await queueCall({ action: "fail", taskId, errorMessage, result, log, workerId }, workerId);
}

async function requestVerificationCode(taskId, jobId, workerId) {
  const response = await queueCall({ action: "verification-code", taskId, jobId, workerId }, workerId);
  return {
    code: response?.available && typeof response?.code === "string" ? response.code : null,
    inboxStatus: typeof response?.inbox_status === "string" ? response.inbox_status : "INBOX_CHECK_FAILED",
  };
}

async function submissionAuthorized(taskId, jobId, workerId) {
  const response = await queueCall({ action: "authorization-status", taskId, jobId, workerId }, workerId);
  return response?.authorized === true;
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
  const nameParts = String(profile.fullName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const mappings = [
    { keys: ["first name", "given name"], value: firstName },
    { keys: ["last name", "family name", "surname"], value: lastName },
    { keys: ["full name", "legal name"], value: profile.fullName || "" },
    { keys: ["email", "e-mail"], value: profile.email || "" },
    { keys: ["phone", "mobile", "contact"], value: profile.phone || "" },
    { keys: ["linkedin"], value: profile.linkedinUrl || "" },
    { keys: ["portfolio", "website", "github"], value: profile.portfolioUrl || "" },
    { keys: ["location", "city", "address"], value: profile.location || "" },
    { keys: ["salary", "compensation", "expected pay"], value: profile.expectedSalary || "" },
    { keys: ["notice", "joining", "start date"], value: profile.noticePeriod || "" },
    { keys: ["experience", "years"], value: profile.yearsExperience || "" },
    { keys: ["title", "current role", "designation"], value: profile.currentTitle || "" },
    { keys: ["current company", "recent company", "most recent company", "most recent", "name of your current"], value: profile.currentCompany || "" },
    { keys: ["how did you hear", "how you heard", "job source"], value: profile.discoverySource || "" },
  ].filter((item) => String(item.value || "").trim().length > 0);

  const handles = await page.locator("input, textarea, select").elementHandles();
  let filledCount = 0;
  let totalFields = 0;

  for (const handle of handles) {
    const details = await handle.evaluate((element) => {
      const id = element.getAttribute("id") || "";
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
      const metadata = [
        element.getAttribute("name") || "",
        id,
        element.getAttribute("placeholder") || "",
        element.getAttribute("aria-label") || "",
        label,
        element.closest("label")?.textContent || "",
      ].join(" ").toLowerCase().replace(/\s+/g, " ").trim();
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        metadata,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type") || "",
        role: element.getAttribute("role") || "",
        usable: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && !element.hasAttribute("disabled") && !element.hasAttribute("readonly"),
        empty: !("value" in element) || !String(element.value || "").trim(),
      };
    });
    if (!details.usable || !details.metadata) continue;
    totalFields += 1;
    if (!details.empty || details.role === "combobox" || ["file", "radio", "checkbox", "hidden", "submit", "button"].includes(details.type)) continue;

    let value = "";
    for (const mapping of mappings) {
      if (mapping.keys.some((key) => details.metadata.includes(key))) {
        value = String(mapping.value || "").trim();
        if (value) break;
      }
    }
    if (!value && ["input", "textarea"].includes(details.tag)) {
      value = matchingMemoryAnswer(answerMemory, details.metadata);
    }
    if (!value) continue;

    try {
      if (details.tag === "select") {
        const options = await handle.evaluate((element) => Array.from(element.options || []).map((option) => ({
          value: option.value,
          label: option.textContent || "",
        })));
        const target = normalize(value);
        const match = options.find((option) => normalize(option.value) === target || normalize(option.label).includes(target));
        if (match) {
          await handle.selectOption(match.value);
          filledCount += 1;
        }
      } else {
        await handle.fill(value);
        filledCount += 1;
      }
    } catch {
      // A framework may replace a field while another answer is committed.
      // Readiness inspection below will surface it instead of guessing.
    }
  }

  return { filledCount, totalFields };
}

async function findVerificationField(page) {
  return await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("input"));
    const oneCharacterFields = [];
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
      if (visible && input.maxLength === 1 && !input.value) oneCharacterFields.push(index);
      if (visible && /(one[- ]?time|verification|security|authentication|passcode|\botp\b)/i.test(metadata)) {
        return { index };
      }
    }
    const pageRequestsCode = /(verification code was sent|enter the .*code|security code|confirm you(?:'|’)re human)/i.test(document.body?.innerText || "");
    if (pageRequestsCode && oneCharacterFields.length >= 4) return { index: oneCharacterFields[0] };
    return null;
  });
}

async function fillVerificationCode(page, fieldIndex, code) {
  const inputs = page.locator("input");
  const input = inputs.nth(fieldIndex);
  const singleCharacterInputs = page.locator('input[maxlength="1"]:visible');
  const singleCount = await singleCharacterInputs.count();
  if (singleCount >= code.length) {
    for (let index = 0; index < code.length; index += 1) {
      await singleCharacterInputs.nth(index).fill(code[index]);
    }
  } else {
    await input.click();
    await input.pressSequentially(code, { delay: 75 });
  }
  await input.dispatchEvent("change").catch(() => {});
}

async function handleApplicationVerification(page, taskId, jobId, workerId) {
  const field = await findVerificationField(page);
  if (!field) return { requested: false, completed: false };

  // The worker stays active only while this application is waiting for a
  // code. The code is consumed server-side after one successful retrieval.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { code, inboxStatus } = await requestVerificationCode(taskId, jobId, workerId);
    if (code) {
      await fillVerificationCode(page, field.index, code);
      return { requested: true, completed: true };
    }
    if (["INBOX_RECONNECT_REQUIRED", "INBOX_UNAVAILABLE", "JOB_INBOX_NOT_LINKED"].includes(inboxStatus)) {
      return { requested: true, completed: false, reason: inboxStatus };
    }
    if (attempt > 0 && attempt % 3 === 0) {
      await heartbeat(taskId, {
        level: "info",
        workerId,
        at: nowIso(),
        message: "Waiting for application email verification",
        jobId,
      }, workerId);
    }
    await sleep(5000);
  }
  return { requested: true, completed: false, reason: "CODE_NOT_RECEIVED" };
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
  // Keep stable element handles. Greenhouse re-renders its upload controls
  // after a file is selected, so iterating a live locator by index can make a
  // previously counted input disappear between iterations.
  const handles = await inputs.elementHandles();
  const count = handles.length;
  if (count === 0) return { fileInputs: 0, resumeInputs: 0, uploaded: 0, requiredMissing: false };

  const candidates = [];
  let requiredMissing = false;

  for (const handle of handles) {
    const details = await handle.evaluate((element) => {
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
    candidates.push({ handle, required: details.required });
  }

  if (candidates.length === 0) {
    return { fileInputs: count, resumeInputs: 0, uploaded: 0, requiredMissing };
  }

  if (!filePath) {
    if (candidates.some((candidate) => candidate.required)) requiredMissing = true;
    return { fileInputs: count, resumeInputs: candidates.length, uploaded: 0, requiredMissing };
  }

  // One résumé upload is sufficient. Uploading to every matching control can
  // attach the résumé as a cover letter on forms with ambiguous labels.
  await candidates[0].handle.setInputFiles(filePath);
  return { fileInputs: count, resumeInputs: candidates.length, uploaded: 1, requiredMissing };
}

async function inspectReadiness(page) {
  return await page.evaluate(() => {
    const required = Array.from(document.querySelectorAll("input[required], textarea[required], select[required], [aria-required='true']"));
    const visible = required.filter((node) => {
      if (!(node instanceof HTMLElement) || node.hasAttribute("disabled")) return false;
      if (node instanceof HTMLInputElement
        && !node.id
        && !node.name
        && !node.getAttribute("aria-label")
        && !node.getAttribute("role")
        && !["checkbox", "radio", "file"].includes(node.type)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const seenRadioGroups = new Set();
    const incomplete = visible.filter((node) => {
      if (node instanceof HTMLInputElement) {
        if (node.getAttribute("role") === "combobox") {
          const selectedText = (node.parentElement?.parentElement?.innerText || "").replace(/\s+/g, " ").trim();
          return !selectedText || /^(select|choose|search)(\.\.\.)?$/i.test(selectedText);
        }
        if (node.type === "radio") {
          const groupName = node.name || node.id;
          if (seenRadioGroups.has(groupName)) return false;
          seenRadioGroups.add(groupName);
          const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(node.name) : node.name;
          return node.name
            ? !document.querySelector(`input[type="radio"][name="${escaped}"]:checked`)
            : !node.checked;
        }
        if (node.type === "checkbox") return !node.checked;
        if (node.type === "file") return !node.files?.length;
        return !node.value.trim();
      }
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) return !node.value.trim();
      return false;
    });
    const missingFields = incomplete.slice(0, 25).map((node) => {
      const id = node.getAttribute("id") || "";
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
      return {
        id,
        type: node instanceof HTMLInputElement ? node.type || node.getAttribute("role") || "input" : node.tagName.toLowerCase(),
        label: label.replace(/\s+/g, " ").trim().slice(0, 180),
      };
    });
    return { requiredFields: visible.length, incompleteRequired: incomplete.length, missingFields };
  });
}

async function detectSubmitButton(page) {
  return await page.evaluate(() => {
    const accepted = new Set(["submit", "submit application", "send application", "verify", "verify code", "confirm application"]);
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
  const deadline = Date.now() + 12000;
  let pageState = { text: "", invalidFields: 0, formPresent: true, verificationRequired: false, visibleAlerts: [] };
  let confirmed = false;
  while (Date.now() < deadline) {
    pageState = await page.evaluate(() => ({
      text: document.body?.innerText?.toLowerCase() || "",
      invalidFields: document.querySelectorAll(':invalid, [aria-invalid="true"]').length,
      formPresent: Boolean(document.querySelector("#application-form, form.application--form")),
      verificationRequired: /(verification code was sent|enter the .*code|security code|confirm you(?:'|’)re human)/i.test(document.body?.innerText || ""),
      visibleAlerts: Array.from(document.querySelectorAll('[role="alert"], .error, .field-error'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240))
        .filter(Boolean)
        .slice(0, 5),
    }));
    confirmed = /(application (?:has been )?(?:received|submitted)|thank you(?:!| for applying)|thanks for applying|submission confirmed|we(?:'|’)ve received your application|application complete)/i.test(pageState.text)
      || /(?:thank.?you|confirmation|submitted)/i.test(page.url());
    if (confirmed) break;
    if (pageState.verificationRequired) break;
    await page.waitForTimeout(500);
  }
  return {
    confirmed,
    urlChanged: page.url() !== previousUrl,
    invalidFields: pageState.invalidFields,
    formPresent: pageState.formPresent,
    verificationRequired: pageState.verificationRequired,
    visibleAlerts: pageState.visibleAlerts,
  };
}

async function inspectSubmissionResponse(response) {
  if (!response) return { status: null, path: null, confirmed: false };
  const status = response.status();
  let pathName = null;
  try {
    pathName = new URL(response.url()).pathname;
  } catch {
    pathName = null;
  }
  const body = await response.text().catch(() => "");
  let explicitSuccess = false;
  try {
    const parsed = JSON.parse(body);
    explicitSuccess = parsed?.success === true
      || parsed?.submitted === true
      || normalize(parsed?.status) === "success";
  } catch {
    explicitSuccess = false;
  }
  const receiptText = /(application (?:has been )?(?:received|submitted)|thank you for applying|submission confirmed|we(?:'|’)ve received your application)/i.test(body);
  return { status, path: pathName, confirmed: response.ok() && (explicitSuccess || receiptText) };
}

async function submitCurrentForm(page, submitButton) {
  const previousUrl = page.url();
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    if (!["POST", "PUT", "PATCH"].includes(request.method())) return false;
    try {
      return new URL(response.url()).hostname.endsWith("greenhouse.io");
    } catch {
      return false;
    }
  }, { timeout: 15000 }).catch(() => null);
  const finalButtons = page.locator('button, input[type="submit"]');
  await finalButtons.nth(submitButton.index).click({ timeout: 10000 });
  const [confirmation, submissionResponse] = await Promise.all([
    confirmSubmission(page, previousUrl),
    responsePromise,
  ]);
  return { confirmation, transport: await inspectSubmissionResponse(submissionResponse) };
}

async function processJob(browser, taskId, job, payload, resumeFilePath, workerId) {
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
    verificationReason: null,
    missingFields: [],
    submissionResponseStatus: null,
    submissionResponsePath: null,
    handoffReason: null,
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

    const approval = job?.approvalReceipt || payload?.approvalReceipts?.[result.jobId];
    const approved = approval?.approved === true && typeof approval?.reviewedAt === "string";

    // File uploads and custom dropdowns can re-render Greenhouse forms. Do
    // those first, then fill ordinary React-controlled inputs last so their
    // values remain committed in the framework state.
    const upload = await uploadResume(page, resumeFilePath);
    result.resumeUploaded = upload.uploaded > 0;

    const customFilled = await fillCustomFields(page, payload?.candidateProfile || {}, payload?.answerMemory || {}, approved);
    const filled = await fillCommonFields(page, payload?.candidateProfile || {}, payload?.answerMemory || {});
    result.filledCount = Number(filled?.filledCount || 0) + Number(customFilled?.filledCount || 0);
    result.totalFields = Number(filled?.totalFields || 0);

    const verification = await handleApplicationVerification(page, taskId, result.jobId, workerId);
    result.verificationHandled = verification.completed;
    result.verificationReason = verification.reason || null;

    const submitButton = await detectSubmitButton(page);
    result.submitButton = submitButton?.label || null;

    const readiness = await inspectReadiness(page);
    result.missingFields = readiness.missingFields || [];
    const blocked = upload.requiredMissing || readiness.incompleteRequired > 0 || (verification.requested && !verification.completed);

    const stillAuthorized = submitButton && AUTO_SUBMIT && approved && !blocked
      ? await submissionAuthorized(taskId, result.jobId, workerId)
      : false;

    if (submitButton && AUTO_SUBMIT && approved && !blocked && stillAuthorized) {
      let { confirmation, transport } = await submitCurrentForm(page, submitButton);
      result.submissionResponseStatus = transport.status;
      result.submissionResponsePath = transport.path;
      result.submitted = confirmation.confirmed || transport.confirmed;

      if (!result.submitted && (transport.status === 428 || confirmation.verificationRequired)) {
        const postSubmitVerification = await handleApplicationVerification(page, taskId, result.jobId, workerId);
        result.verificationHandled = postSubmitVerification.completed;
        result.verificationReason = postSubmitVerification.reason || null;
        if (postSubmitVerification.completed) {
          const verificationButton = await detectSubmitButton(page);
          const remainsAuthorized = verificationButton
            ? await submissionAuthorized(taskId, result.jobId, workerId)
            : false;
          if (verificationButton && remainsAuthorized) {
            ({ confirmation, transport } = await submitCurrentForm(page, verificationButton));
            result.submissionResponseStatus = transport.status;
            result.submissionResponsePath = transport.path;
            result.submitted = confirmation.confirmed || transport.confirmed;
          }
        }
      }

      result.status = result.submitted ? "submitted" : "needs_review";
      if (!result.submitted) {
        const visibleAlert = confirmation.visibleAlerts?.[0];
        if (transport.status === 428) {
          result.handoffReason = "employer_verification";
          result.error = result.verificationHandled
            ? "The employer did not confirm the verification code. Open the prepared application to review the final step."
            : result.verificationReason === "INBOX_RECONNECT_REQUIRED"
              ? "Reconnect Gmail to continue employer verification. Your prepared application is unchanged."
              : result.verificationReason === "JOB_INBOX_NOT_LINKED"
                ? "The application inbox is not linked to this job. Open the prepared application to complete verification."
                : "The employer verification code did not arrive in the connected inbox. Open the prepared application to complete the final check.";
        } else {
          result.error = visibleAlert
            ? `The employer form did not accept the submission: ${visibleAlert}`
            : `The employer did not confirm submission. Open the prepared application to review the final step.`;
        }
      }
    } else if (submitButton) {
      result.status = AUTO_SUBMIT && approved && !blocked && !stillAuthorized
        ? "stopped"
        : blocked ? "needs_review" : "ready_for_review";
      if (result.status === "stopped") {
        result.error = "Continuous Apply was stopped before final submission.";
      } else if (blocked) {
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

async function processTask(task, workerId) {
  const taskId = String(task?.id || "");
  const payload = task?.payload || {};
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  const started = nowIso();
  const jobResults = [];
  let resumeFile = { directory: null, filePath: null };

  if (jobs.length === 0) {
    await failTask(taskId, "Task has no jobs.", { jobs: [] }, {
      level: "error",
      workerId,
      at: nowIso(),
      message: "Task payload missing jobs",
    }, workerId);
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    resumeFile = await downloadResumeFile(payload);
    await heartbeat(taskId, {
      level: "info",
      workerId,
      at: nowIso(),
      message: `Started task with ${jobs.length} jobs`,
    }, workerId);

    for (const job of jobs) {
      await heartbeat(taskId, {
        level: "info",
        workerId,
        at: nowIso(),
        message: `Processing job: ${String(job?.title || "Unknown")}`,
      }, workerId);

      const result = await processJob(browser, taskId, job, payload, resumeFile.filePath, workerId);
      jobResults.push(result);

      await heartbeat(taskId, {
        level: ["processed", "ready_for_review", "needs_review", "submitted", "stopped"].includes(result.status) ? "info" : "warn",
        workerId,
        at: nowIso(),
        message: ["processed", "ready_for_review", "needs_review", "submitted", "stopped"].includes(result.status)
          ? `${result.status}: ${result.title}`
          : `Failed ${result.title}: ${result.error}`,
        jobId: result.jobId,
      }, workerId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await failTask(taskId, message, { jobs: jobResults }, {
      level: "error",
      workerId,
      at: nowIso(),
      message,
    }, workerId);
    return;
  } finally {
    await browser.close();
    if (resumeFile.directory) await rm(resumeFile.directory, { recursive: true, force: true });
  }

  const success = jobResults.filter((r) => ["processed", "ready_for_review", "needs_review", "submitted", "stopped"].includes(r.status)).length;
  const failed = jobResults.length - success;

  const summary = {
    workerId,
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
      workerId,
      at: nowIso(),
      message: "Worker run finished with zero successful jobs",
    }, workerId);
  } else {
    await completeTask(taskId, summary, {
      level: "info",
      workerId,
      at: nowIso(),
      message: `Worker completed task. Success: ${success}, Failed: ${failed}`,
    }, workerId);
  }
}

async function runSlot(slotIndex) {
  const workerId = `${WORKER_ID}:${slotIndex + 1}`;
  let processed = 0;

  while (true) {
    try {
      const task = await claimNextTask(workerId);

      if (!task) {
        if (once) break;
        if (maxTasks > 0 && processed >= maxTasks) break;
        await sleep(POLL_MS);
        continue;
      }

      console.log(`[ApplyPass Worker] ${workerId} claimed task ${task.id}`);
      await processTask(task, workerId);
      processed += 1;

      if (once) break;
      if (maxTasks > 0 && processed >= maxTasks) break;
    } catch (error) {
      console.error(`[ApplyPass Worker] ${workerId} error: ${error instanceof Error ? error.message : String(error)}`);
      if (once) break;
      await sleep(POLL_MS);
    }
  }
  return processed;
}

async function run() {
  const concurrency = once || maxTasks > 0 ? 1 : CONFIGURED_CONCURRENCY;
  console.log(`[ApplyPass Worker] Started as ${WORKER_ID}. slots=${concurrency} once=${once} maxTasks=${maxTasks || "unlimited"}`);
  console.log(`[ApplyPass Worker] Auto submit: ${AUTO_SUBMIT ? "ON" : "OFF"}`);
  const totals = await Promise.all(Array.from({ length: concurrency }, (_, index) => runSlot(index)));
  const processed = totals.reduce((sum, value) => sum + value, 0);
  console.log(`[ApplyPass Worker] Exiting. processed=${processed}`);
}

run().catch((error) => {
  console.error(`[ApplyPass Worker] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

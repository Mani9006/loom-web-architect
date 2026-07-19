// Generic fallback adapter.
//
// This carries the applypass-browser-worker.mjs autofill / submit-detection /
// verification behavior (as of the "fix live application form handoff"
// worker rewrite), so unknown ATSs behave exactly like the stock worker. It
// also exports shared browser routines (resume upload, verification-code
// loop, blocker detection, combobox/custom-field filling) reused by the
// Greenhouse and Lever adapters.

import { defineAdapter, submitRefusal } from "./contract.mjs";
import {
  classifyBlockers,
  inferAuthorizationAnswers,
  inferCountry,
  matchingMemoryAnswer,
  normalizeText,
} from "./helpers.mjs";

// ---------------------------------------------------------------------------
// Shared browser routines (used by generic + ATS-specific adapters)
// ---------------------------------------------------------------------------

/** Detect CAPTCHA / login walls. We never bypass these -> needs_attention. */
export async function detectBlockers(target) {
  const snapshot = await target.evaluate(() => ({
    hasCaptcha: Boolean(document.querySelector(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]'
    )),
    hasPassword: Boolean(document.querySelector('input[type="password"]')),
    text: document.body?.innerText?.slice(0, 4000) || "",
  }));
  return classifyBlockers(snapshot);
}

export async function findVerificationField(target) {
  return await target.evaluate(() => {
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
    // Segmented OTP inputs (one box per digit) rarely carry verification
    // metadata; fall back to a row of single-character boxes when the page is
    // clearly asking for a code.
    const pageRequestsCode = /(verification code was sent|enter the .*code|security code|confirm you(?:'|’)re human)/i.test(document.body?.innerText || "");
    if (pageRequestsCode && oneCharacterFields.length >= 4) return { index: oneCharacterFields[0] };
    return null;
  });
}

export async function fillVerificationCode(target, fieldIndex, code) {
  const inputs = target.locator("input");
  const input = inputs.nth(fieldIndex);
  // Segmented codes: spread each character across the single-character boxes.
  const singleCharacterInputs = target.locator('input[maxlength="1"]:visible');
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

function normalizeVerificationResponse(response) {
  // The worker's requestVerificationCode() returns { code, inboxStatus }. Stay
  // tolerant of a bare string too so the loop keeps working if a caller passes
  // only the code.
  if (response && typeof response === "object") {
    return {
      code: typeof response.code === "string" && response.code ? response.code : null,
      inboxStatus: typeof response.inboxStatus === "string" ? response.inboxStatus : "INBOX_CHECK_FAILED",
    };
  }
  return {
    code: typeof response === "string" && response ? response : null,
    inboxStatus: "INBOX_CHECK_FAILED",
  };
}

/**
 * Email verification-code loop: poll the queue for a code the account inbox
 * received, fill it when available, heartbeat while waiting. The code is
 * consumed server-side after one successful retrieval. When the queue reports
 * a terminal inbox status (reconnect required / inbox unavailable / job inbox
 * not linked) the loop stops early and returns that reason so the worker can
 * hand off with an accurate message.
 */
export async function runVerificationLoop(target, ctx) {
  const field = await findVerificationField(target);
  if (!field) return { requested: false, completed: false };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { code, inboxStatus } = normalizeVerificationResponse(await ctx.requestVerificationCode());
    if (code) {
      await fillVerificationCode(target, field.index, code);
      return { requested: true, completed: true };
    }
    if (["INBOX_RECONNECT_REQUIRED", "INBOX_UNAVAILABLE", "JOB_INBOX_NOT_LINKED"].includes(inboxStatus)) {
      return { requested: true, completed: false, reason: inboxStatus };
    }
    if (attempt > 0 && attempt % 3 === 0) {
      await ctx.heartbeat({
        level: "info",
        workerId: ctx.workerId,
        at: new Date().toISOString(),
        message: "Waiting for application email verification",
        jobId: ctx.jobId,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { requested: true, completed: false, reason: "CODE_NOT_RECEIVED" };
}

export async function uploadResume(target, filePath) {
  const inputs = target.locator('input[type="file"]');
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

/**
 * Serialize every input/textarea/select on the page into plain descriptors so
 * Node-side code (fuzzy label matching, requiredMissing) can reason about
 * them. Used by the Greenhouse/Lever adapters.
 */
export async function collectFieldDescriptors(target) {
  return await target.evaluate(() => {
    function findLabelText(el) {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent || "";
      }
      const parentLabel = el.closest("label");
      if (parentLabel) return parentLabel.textContent || "";
      const container = el.closest(".field, .application-question, .application-field, [class*='question']");
      if (container) {
        const label = container.querySelector("label, .application-label, .text, legend");
        if (label) return label.textContent || "";
      }
      const parent = el.parentElement;
      if (parent) {
        const siblingLabel = parent.querySelector("label");
        if (siblingLabel) return siblingLabel.textContent || "";
      }
      return "";
    }

    const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
    return nodes.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const labelText = (findLabelText(el) || "").replace(/\s+/g, " ").trim();
      return {
        index,
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute("type") || (el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "text")).toLowerCase(),
        role: el.getAttribute("role") || "",
        name: el.getAttribute("name") || "",
        id: el.getAttribute("id") || "",
        placeholder: el.getAttribute("placeholder") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        label: labelText,
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(labelText),
        value: el.value || "",
        checked: el.checked === true,
        filesCount: el.files ? el.files.length : 0,
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
          && !el.hasAttribute("disabled") && !el.hasAttribute("readonly"),
        options: el.tagName === "SELECT"
          ? Array.from(el.options).map((o) => ({ value: o.value, text: (o.textContent || "").trim() }))
          : null,
      };
    });
  });
}

/** Fill the Nth form control (index from collectFieldDescriptors). */
export async function setFieldValueByIndex(target, index, value) {
  return await target.evaluate(({ fieldIndex, fieldValue }) => {
    const el = document.querySelectorAll("input, textarea, select")[fieldIndex];
    if (!el) return false;
    if (el instanceof HTMLSelectElement) {
      const wanted = String(fieldValue).toLowerCase();
      for (const option of Array.from(el.options)) {
        if (option.value.toLowerCase() === wanted || (option.textContent || "").toLowerCase().includes(wanted)) {
          el.value = option.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      if (!el.checked) {
        el.click();
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      return true;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      el.value = String(fieldValue);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }, { fieldIndex: index, fieldValue: String(value ?? "") });
}

/**
 * Commit a value into an ARIA combobox (React-select style dropdowns used by
 * Greenhouse job boards). `target` may be a Page or a Frame; the option list
 * is looked up inside the same target.
 */
export async function chooseVisibleOption(target, input, desired, { allowFirstMatch = false, typeSequentially = false, searchValue = "" } = {}) {
  if (!desired) return false;
  const keyboard = typeof target.page === "function" ? target.page().keyboard : target.keyboard;
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
  await target.waitForTimeout(120);

  const options = target.locator('[role="option"]:visible');
  await options.first().waitFor({ state: "visible", timeout: allowFirstMatch ? 2500 : 1000 }).catch(() => {});
  const count = await options.count();
  const targetText = normalizeText(desired);
  let fallback = null;
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const optionText = normalizeText(await option.textContent());
    if (!optionText) continue;
    if (optionText === targetText || optionText.startsWith(`${targetText} `) || optionText.startsWith(`${targetText}+`)) {
      await option.click();
      return await committed();
    }
    if (!fallback && (optionText.includes(targetText) || targetText.includes(optionText))) fallback = option;
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
  await keyboard.press("Escape");
  return false;
}

/**
 * Fill required ARIA comboboxes (country, location, work authorization,
 * sponsorship, consent, demographics) plus the demographic-consent checkbox.
 *
 * Safety: demographic questions are only answered — with an explicit "I
 * don't wish to answer" decline — when the applicant approved submission;
 * consent options are only selected when `approved` is true. Unknown
 * questions fall back to answer memory or stay blank.
 */
export async function fillCustomFields(target, profile = {}, answerMemory = {}, approved = false) {
  const { workAuthorized, sponsorshipRequired } = inferAuthorizationAnswers(profile, answerMemory);
  const descriptors = await target.locator('input[role="combobox"][aria-required="true"]').evaluateAll((elements) => elements.map((element) => {
    const id = element.getAttribute("id") || "";
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
    return { id, label: label.replace(/\s+/g, " ").trim() };
  }));
  let filledCount = 0;
  let demographicFields = 0;
  let declinedDemographicFields = 0;

  for (const descriptor of descriptors) {
    if (!descriptor.id) continue;
    const input = target.locator(`input[id="${descriptor.id.replaceAll('"', '\\"')}"]`).first();
    const label = normalizeText(descriptor.label);
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

    if (await chooseVisibleOption(target, input, desired, { allowFirstMatch, typeSequentially, searchValue })) {
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
    const requiredCheckboxes = target.locator('input[type="checkbox"][required], input[type="checkbox"][aria-required="true"]');
    const checkboxCount = await requiredCheckboxes.count();
    for (let index = 0; index < checkboxCount; index += 1) {
      const checkbox = requiredCheckboxes.nth(index);
      const metadata = normalizeText(await checkbox.evaluate((element) => {
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

// ---------------------------------------------------------------------------
// Generic behaviors (kept in sync with the stock worker rewrite)
// ---------------------------------------------------------------------------

export async function fillCommonFields(target, profile = {}, answerMemory = {}) {
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

  const handles = await target.locator("input, textarea, select").elementHandles();
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
        const wanted = normalizeText(value);
        const match = options.find((option) => normalizeText(option.value) === wanted || normalizeText(option.label).includes(wanted));
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

export async function inspectReadiness(target) {
  return await target.evaluate(() => {
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

export async function detectSubmitButton(target) {
  return await target.evaluate(() => {
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

export async function confirmSubmission(page, previousUrl) {
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

// ---------------------------------------------------------------------------
// Adapter definition
// ---------------------------------------------------------------------------

export const genericAdapter = defineAdapter({
  metadata: { name: "generic", version: "1.1.0" },

  detect() {
    // Fallback adapter: matches everything. pickAdapter() tries it last.
    return true;
  },

  async prepare(page) {
    const blockers = await detectBlockers(page);
    if (blockers.length > 0) return { ok: false, blocked: blockers[0] };
    return { ok: true, blocked: null };
  },

  async fillFields(page, ctx) {
    // File uploads and custom dropdowns can re-render framework forms. Do
    // those first, then fill ordinary controlled inputs last so their values
    // remain committed in the framework state.
    const upload = await uploadResume(page, ctx.documents?.resumePath || null);
    const custom = await fillCustomFields(page, ctx.profile || {}, ctx.answers || {}, ctx.approved === true);
    const filled = await fillCommonFields(page, ctx.profile || {}, ctx.answers || {});
    const verification = await runVerificationLoop(page, ctx);
    return {
      filledCount: Number(filled?.filledCount || 0) + Number(custom?.filledCount || 0),
      totalFields: Number(filled?.totalFields || 0),
      upload,
      verification,
    };
  },

  async reviewState(page) {
    const readiness = await inspectReadiness(page);
    const missingFields = Array.isArray(readiness?.missingFields) ? readiness.missingFields : [];
    const requiredMissing = missingFields.map((field) => field.label || field.id || field.type || "Unlabeled required field");
    return {
      requiredMissing,
      missingFields,
      incompleteRequired: Number(readiness?.incompleteRequired || 0),
      summary: requiredMissing.length > 0
        ? `${readiness.incompleteRequired} of ${readiness.requiredFields} required field(s) still need review.`
        : `All ${readiness.requiredFields} required field(s) appear complete.`,
      recommendation: "needs_review",
    };
  },

  findSubmitButton(page) {
    return detectSubmitButton(page);
  },

  async submit(page, ctx) {
    const refusal = submitRefusal(ctx);
    if (refusal) return refusal;
    const button = ctx.submitButton || await detectSubmitButton(page);
    if (!button) return { clicked: false, label: null, reason: "no submit button detected" };
    const finalButtons = page.locator('button, input[type="submit"]');
    await finalButtons.nth(button.index).click({ timeout: 10000 });
    return { clicked: true, label: button.label };
  },

  async verifyReceipt(page, ctx) {
    const confirmation = await confirmSubmission(page, ctx.previousUrl || "");
    return {
      confirmed: confirmation.confirmed,
      evidence: {
        url: page.url(),
        urlChanged: confirmation.urlChanged,
        invalidFields: confirmation.invalidFields,
        formPresent: confirmation.formPresent,
        verificationRequired: confirmation.verificationRequired,
        visibleAlerts: confirmation.visibleAlerts,
        signal: confirmation.confirmed ? "confirmation-text" : null,
      },
    };
  },

  // Post-submit verification handoff: re-run the emailed security-code loop
  // after a first submit reveals the code field (e.g. Greenhouse 428 step).
  async handleVerification(page, ctx) {
    return await runVerificationLoop(page, ctx);
  },
});

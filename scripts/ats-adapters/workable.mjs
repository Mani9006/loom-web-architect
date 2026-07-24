// Workable adapter for apply.workable.com hosted application forms.
//
// Posting URLs look like apply.workable.com/<account>/j/<shortcode>/; the
// form renders in the same SPA at <url>apply/ after clicking "Apply for this
// job" or the APPLICATION tab. Field conventions (verified on a live posting,
// Sigma Defense board, July 2026):
//   - Identity fields use stable plain names: input[name=firstname],
//     input[name=lastname], input[name=email] (type=email), input[name=phone]
//     (type=tel, intl-tel-input widget), input[name=address|city|postcode|
//     country]; textarea[name=summary] / textarea[name=cover_letter] optional.
//   - No label[for] association: labels live in nearby container elements and
//     the required marker is a LEADING "*" ("*First name"). Inputs do carry
//     the `required` attribute.
//   - Resume upload is input[type=file] with no name, id like
//     "input_files_input_<random>", accept=".pdf,.doc,.docx,.odt,.rtf,...",
//     next to an "Import resume from" button.
//   - Custom questions are named CA_<id> / QA_<id> as text inputs, TEXTAREAs,
//     or radio groups (YES/NO option pairs with random per-option ids). The
//     question text sits in the question container, NOT on the input; the
//     option label ("YES"/"NO") is the radio's nearest label text.
//   - Submit button: <button type="submit"> "Submit application".
//   - Anti-bot: Cloudflare Turnstile api.js loads but renders NO interactive
//     challenge on a normal visit (invisible/score-based). Workable is
//     account-less: no OTP, no password fields. A soft IP throttle
//     (~100 req/IP) applies — adapters never probe in bursts.
//
// Same policies as every adapter: fuzzy-matched custom answers only on a
// strong match, consent checkboxes only on an explicit stored affirmative,
// no CAPTCHA/login workarounds, submit gated by autoSubmit + per-job approval.

import { defineAdapter, submitRefusal } from "./contract.mjs";
import {
  fuzzyMatchAnswer,
  inferCountry,
  isAffirmativeAnswer,
  isBooleanAnswer,
  looksLikeConsentLabel,
  normalizeText,
  requiredMissingFromFields,
} from "./helpers.mjs";
import {
  detectBlockers,
  fillCustomFields,
  setFieldValueByIndex,
  uploadResume,
} from "./generic.mjs";

const STANDARD_NAME_SELECTOR = 'input[name="firstname"], input[name="lastname"], input[name="email"], textarea[name="summary"]';
const FORM_SELECTOR = `${STANDARD_NAME_SELECTOR}, form input[name="phone"], input[id^="input_files_input_"]`;

// Workable svgs leak a fallback text node into label text in some renderers.
function cleanLabel(value) {
  return String(value || "")
    .replace(/SVGs not supported by this browser\.?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^\*\s*/, "")
    .replace(/\s*\*\s*$/, "")
    .trim();
}

/** URL-only Workable classification (apply.workable.com and legacy <co>.workable.com). */
export function isWorkableUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === "workable.com" || host.endsWith(".workable.com");
}

/**
 * Map a Workable field descriptor to a profile value. Identity/location
 * fields resolve from their stable `name`; LinkedIn/website resolve from
 * nearby label text. Returns "" for CA_<id>/QA_<id> custom questions (those are
 * answered from answer memory only).
 */
export function workableStandardValueFor(field, profile = {}) {
  const nameKey = normalizeText(field?.name || field?.id || "");
  const labelKey = normalizeText(field?.label || field?.ariaLabel || field?.placeholder || "");
  const combined = `${nameKey} ${labelKey}`;
  const nameParts = String(profile.fullName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const location = String(profile.location || "").trim();
  const locationParts = location.split(",").map((part) => part.trim()).filter(Boolean);

  if (/^first ?name$/.test(nameKey) || /^first name$/.test(labelKey)) return firstName;
  if (/^last ?name$/.test(nameKey) || /^last name$/.test(labelKey)) return lastName || firstName;
  if (nameKey === "email" || field?.type === "email" || /\bemail\b/.test(combined)) return profile.email || "";
  if (nameKey === "phone" || field?.type === "tel" || /\bphone\b|\bmobile\b/.test(combined)) return profile.phone || "";
  if (/linkedin/.test(combined)) return profile.linkedinUrl || "";
  if (/website|portfolio|github/.test(combined)) return profile.portfolioUrl || "";
  if (/^headline$/.test(nameKey) || /^headline$/.test(labelKey)) return profile.currentTitle || "";
  if (nameKey === "address" || /\baddress\b/.test(labelKey)) return profile.address || location;
  if (nameKey === "city" || /^city$/.test(labelKey)) return locationParts[0] || location;
  if (/postcode|postal|zip/.test(nameKey)) return profile.postalCode || "";
  if (nameKey === "country" || /^country$/.test(labelKey)) {
    return inferCountry(location) || (locationParts.length > 1 ? locationParts[locationParts.length - 1] : "");
  }
  return "";
}

/** Whether a field is a Workable custom question (CA_<id>/QA_<id> named control). */
export function isWorkableCustomField(field) {
  return /^(ca|qa)_\d+$/i.test(String(field?.name || ""));
}

/**
 * Workable-aware descriptor collection. Same `input, textarea, select`
 * ordering as generic collectFieldDescriptors (so setFieldValueByIndex works)
 * but resolves labels the way Workable renders them: label[for], closest
 * label, then walking up ancestor containers for a label/legend, cleaned of
 * the svg fallback noise and the leading required "*".
 */
async function collectWorkableFields(page) {
  return await page.evaluate(() => {
    function findLabelText(el) {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label && (label.textContent || "").trim()) return label.textContent || "";
      }
      const parentLabel = el.closest("label");
      if (parentLabel && (parentLabel.textContent || "").trim()) return parentLabel.textContent || "";
      // Workable: labels live in nearby containers, not on the input. Walk up
      // to six ancestors and take the innermost label/legend text.
      let node = el.parentElement;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const label = node.querySelector("label, legend");
        if (label && (label.textContent || "").trim()) return label.textContent || "";
        node = node.parentElement;
      }
      return "";
    }

    const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
    return nodes.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const rawLabel = (findLabelText(el) || "").replace(/\s+/g, " ").trim();
      return {
        index,
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute("type") || (el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "text")).toLowerCase(),
        role: el.getAttribute("role") || "",
        name: el.getAttribute("name") || "",
        id: el.getAttribute("id") || "",
        placeholder: el.getAttribute("placeholder") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        label: rawLabel,
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true" || /\*/.test(rawLabel),
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

/**
 * Collect Workable radio groups (CA_<id>/QA_<id> yes/no and multi-choice custom
 * questions). Option indexes are into `input, textarea, select` so
 * setFieldValueByIndex can tick them. The question label is recovered by
 * walking up from the first option to the innermost container whose text is
 * more than just the option labels.
 */
async function collectWorkableRadioGroups(page) {
  return await page.evaluate(() => {
    const clean = (value) => String(value || "")
      .replace(/SVGs not supported by this browser\.?/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^\*\s*/, "")
      .trim();
    const allControls = Array.from(document.querySelectorAll("input, textarea, select"));
    const radios = allControls.filter((el) => el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "radio");
    const byName = new Map();
    for (const radio of radios) {
      const name = radio.getAttribute("name") || "";
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(radio);
    }
    const groups = [];
    for (const [name, members] of byName) {
      const options = members.map((radio) => {
        const id = radio.getAttribute("id") || "";
        let optionLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
        if (!optionLabel.trim()) optionLabel = radio.closest("label")?.textContent || "";
        if (!optionLabel.trim()) optionLabel = radio.parentElement?.textContent || "";
        return {
          index: allControls.indexOf(radio),
          label: clean(optionLabel).slice(0, 200),
          checked: radio.checked === true,
        };
      });
      // Question label: innermost ancestor whose cleaned text is longer than
      // the concatenated option labels (i.e. it actually contains a question).
      // Option text runs together in the live DOM ("...position?YesNo"), so
      // match the trailing option cluster with or without spaces.
      const optionLabels = options.map((option) => option.label).filter(Boolean);
      const optionClusters = [optionLabels.join(" "), optionLabels.join("")].filter(Boolean);
      const stripOptionCluster = (text) => {
        for (const cluster of optionClusters) {
          if (cluster && text.toLowerCase().endsWith(cluster.toLowerCase())) {
            return text.slice(0, text.length - cluster.length).trim();
          }
          if (cluster && text.toLowerCase().startsWith(cluster.toLowerCase())) {
            return text.slice(cluster.length).trim();
          }
        }
        return text;
      };
      const optionText = clean(optionLabels.join(" "));
      let label = "";
      let node = members[0].parentElement;
      for (let depth = 0; node && depth < 8; depth += 1) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll("input, svg").forEach((child) => child.remove());
        const text = clean(clone.textContent || "");
        const remainder = stripOptionCluster(text);
        const stripped = remainder.replace(/^\*\s*/, "").trim();
        if (stripped.length > 8 && stripped.toLowerCase() !== optionText.toLowerCase()) {
          label = stripped;
          break;
        }
        node = node.parentElement;
      }
      groups.push({
        name,
        label: (label || name).slice(0, 300),
        options,
        answered: members.some((radio) => radio.checked === true),
        required: members.some((radio) => radio.hasAttribute("required") || radio.getAttribute("aria-required") === "true"),
      });
    }
    return groups;
  });
}

/** Upload the resume into the Workable file control (or fall back to generic detection). */
async function uploadWorkableResume(page, resumePath) {
  const fileInputs = page.locator('input[type="file"]');
  const totalFileInputs = await fileInputs.count().catch(() => 0);
  // Live convention: the resume control accepts document MIME types and sits
  // by the "Import resume from" button; it usually has no name attribute.
  const resumeInput = page.locator('input[type="file"][accept*=".pdf"], input[type="file"][id^="input_files_input_"]').first();
  const hasResumeInput = await resumeInput.count().catch(() => 0);
  if (!hasResumeInput) {
    return await uploadResume(page, resumePath);
  }
  const required = await resumeInput.evaluate((el) =>
    el.hasAttribute("required") || el.getAttribute("aria-required") === "true"
  ).catch(() => false);
  if (!resumePath) {
    return { fileInputs: totalFileInputs, resumeInputs: 1, uploaded: 0, requiredMissing: required };
  }
  await resumeInput.setInputFiles(resumePath);
  return { fileInputs: totalFileInputs, resumeInputs: 1, uploaded: 1, requiredMissing: false };
}

async function workableFormPresent(page) {
  return await page.locator(FORM_SELECTOR).count().then((count) => count > 0).catch(() => false);
}

const NEGATIVE_ANSWERS = new Set(["no", "n", "false", "0", "i do not", "i don't"]);

export const workableAdapter = defineAdapter({
  metadata: { name: "workable", version: "1.0.0" },

  async detect(url, page) {
    if (isWorkableUrl(url)) return true;
    if (page) {
      try {
        return await page.evaluate(() => {
          if (document.querySelector(
            'a[href*="workable.com"], script[src*="workable"], link[href*="workable.com"], meta[name="generator"][content*="Workable" i]'
          )) return true;
          if (/powered by\s*workable/i.test(document.body?.innerText || "")) return true;
          // Embedded Workable forms keep the stable identity field names.
          return Boolean(document.querySelector('input[name="firstname"]'))
            && Boolean(document.querySelector('input[name="email"]'))
            && Boolean(document.querySelector('textarea[name="summary"], input[id^="input_files_input_"]'));
        });
      } catch {
        return false;
      }
    }
    return false;
  },

  async prepare(page) {
    const blockers = await detectBlockers(page);
    if (blockers.length > 0) return { ok: false, blocked: blockers[0] };

    // Dismiss the cookie banner ("Decline all" only — never accept cookies on
    // the user's behalf); it overlays and intercepts clicks on the Apply CTA.
    const declineCookies = page.locator('button:has-text("Decline all")').first();
    if (await declineCookies.count().catch(() => 0)) {
      await declineCookies.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }

    let hasForm = await workableFormPresent(page);

    if (!hasForm) {
      // Posting overview -> click "Apply for this job" or the APPLICATION tab;
      // the form renders inside the same SPA at <posting>/apply/.
      const applyCta = page.locator(
        'a:has-text("Apply for this job"), button:has-text("Apply for this job"), [role="tab"]:has-text("APPLICATION"), a:has-text("APPLICATION")'
      ).first();
      if (await applyCta.count().catch(() => 0)) {
        await applyCta.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      hasForm = await workableFormPresent(page);
      if (!hasForm) {
        // Workable is a React SPA: give the form a moment to hydrate.
        await page.locator(STANDARD_NAME_SELECTOR).first()
          .waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
        hasForm = await workableFormPresent(page);
      }
    }

    // Re-check blockers after navigation (a challenge may render late).
    const lateBlockers = await detectBlockers(page);
    if (lateBlockers.length > 0) return { ok: false, blocked: lateBlockers[0] };

    // Workable server-renders the form, then React hydrates it: inputs filled
    // while hydration is in flight get wiped when it lands. Give hydration a
    // beat before the fill loop starts.
    if (hasForm) await page.waitForTimeout(1500);

    return { ok: true, blocked: null, note: hasForm ? "application form present" : "application form not confirmed" };
  },

  async fillFields(page, ctx) {
    const profile = ctx.profile || {};
    const answers = ctx.answers || {};

    // File uploads and combobox dropdowns can re-render framework forms. Do
    // those first, then fill ordinary controlled inputs last.
    const upload = await uploadWorkableResume(page, ctx.documents?.resumePath || null);
    const custom = await fillCustomFields(page, profile, answers, ctx.approved === true);

    const fields = await collectWorkableFields(page);
    let filledCount = Number(custom?.filledCount || 0);

    for (const field of fields) {
      if (!field.visible) continue;
      if (["file", "hidden", "submit", "button", "radio"].includes(field.type)) continue;
      const alreadyFilled = field.type === "checkbox"
        ? field.checked
        : String(field.value || "").trim().length > 0;
      if (alreadyFilled) continue;

      if (field.type === "checkbox") {
        // Consent checkboxes: tick ONLY on an explicit stored affirmative for
        // that specific question; otherwise leave unticked.
        const label = cleanLabel(field.label || field.ariaLabel || field.name);
        if (looksLikeConsentLabel(label)) {
          const match = fuzzyMatchAnswer(label, answers);
          if (match && isAffirmativeAnswer(match.answer)) {
            if (await setFieldValueByIndex(page, field.index, "true")) filledCount += 1;
          }
          continue;
        }
        // Non-consent checkbox options: tick only when the stored answer for
        // the question equals this option's label exactly.
        const match = fuzzyMatchAnswer(label, answers);
        if (match && normalizeText(match.answer) === normalizeText(label)) {
          if (await setFieldValueByIndex(page, field.index, "true")) filledCount += 1;
        }
        continue;
      }

      const label = cleanLabel(field.label || field.ariaLabel || field.placeholder || field.name);

      // Stable-named identity/location fields first.
      const standardValue = workableStandardValueFor({ ...field, label }, profile);
      if (standardValue) {
        if (await setFieldValueByIndex(page, field.index, standardValue)) filledCount += 1;
        continue;
      }

      // CA_<id>/QA_<id> custom questions: strong fuzzy label match only.
      const match = fuzzyMatchAnswer(label, answers);
      // Boolean answers (yes/no) belong to yes/no controls, never free text.
      if (match && !isBooleanAnswer(match.answer)) {
        if (await setFieldValueByIndex(page, field.index, match.answer)) filledCount += 1;
      }
      // Unmatched questions stay blank; required ones become requiredMissing.
    }

    // Radio groups (yes/no screening + multi-choice): answer from memory only.
    const radioGroups = await collectWorkableRadioGroups(page);
    for (const group of radioGroups) {
      if (group.answered) continue;
      const match = fuzzyMatchAnswer(group.label, answers);
      if (!match) continue;
      const normalized = normalizeText(match.answer);
      let option = null;
      if (isAffirmativeAnswer(normalized)) {
        option = group.options.find((candidate) => /^y(es)?\b/i.test(candidate.label.trim())) || null;
      } else if (NEGATIVE_ANSWERS.has(normalized)) {
        option = group.options.find((candidate) => /^n(o)?\b/i.test(candidate.label.trim())) || null;
      } else {
        // Multi-choice: pick the option matching the stored answer's text.
        option = group.options.find((candidate) => {
          const optionText = normalizeText(candidate.label);
          return optionText && (optionText === normalized || optionText.includes(normalized) || normalized.includes(optionText));
        }) || null;
      }
      if (!option || option.index < 0) continue;
      if (await setFieldValueByIndex(page, option.index, "true")) filledCount += 1;
    }

    // Radio picks, late SPA hydration, and the async resume-parse autofill
    // all re-render Workable's form and can WIPE text inputs filled earlier
    // (observed live: the first-filled identity field vanished seconds after
    // the main loop when the resume-parse render landed). Settle, refill
    // empties, then verify once more after a second settle.
    for (let pass = 0; pass < 2; pass += 1) {
      await page.waitForTimeout(pass === 0 ? 1800 : 2500);
      const finalFields = await collectWorkableFields(page);
      for (const field of finalFields) {
        if (!field.visible) continue;
        if (["file", "hidden", "submit", "button", "radio", "checkbox"].includes(field.type)) continue;
        if (String(field.value || "").trim().length > 0) continue;
        const label = cleanLabel(field.label || field.ariaLabel || field.placeholder || field.name);
        const match = fuzzyMatchAnswer(label, answers);
        const value = workableStandardValueFor({ ...field, label }, profile)
          || (match && !isBooleanAnswer(match.answer) ? match.answer : "");
        if (value && (await setFieldValueByIndex(page, field.index, value))) filledCount += 1;
      }
    }

    return {
      filledCount,
      totalFields: fields.length,
      upload,
      // Workable is account-less and uses no email verification codes.
      verification: { requested: false, completed: false },
    };
  },

  async reviewState(page) {
    const fields = await collectWorkableFields(page);
    // Radios share a required attribute across the whole group (both YES and
    // NO carry it): score groups, not individual options, so one ticked
    // option satisfies the group.
    const nonRadioFields = fields.filter((field) => field.type !== "radio");
    const radioGroups = await collectWorkableRadioGroups(page);
    const missingGroups = radioGroups
      .filter((group) => group.required && !group.answered)
      .map((group) => group.label || group.name);
    const requiredMissing = [...requiredMissingFromFields(nonRadioFields), ...missingGroups];
    const hasGap = requiredMissing.length > 0;
    return {
      requiredMissing,
      summary: hasGap
        ? `Workable form has ${requiredMissing.length} unanswered required field(s): ${requiredMissing.slice(0, 5).join("; ")}`
        : "Workable form has no outstanding required fields.",
      recommendation: hasGap ? "needs_attention" : "needs_review",
    };
  },

  async findSubmitButton(page) {
    return await page.evaluate(() => {
      const accepted = /^(submit|submit application|submit your application|send application|apply)$/;
      const elements = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        const label = (element.textContent || element.getAttribute("value") || "").toLowerCase().replace(/\s+/g, " ").trim();
        const rect = element.getBoundingClientRect();
        const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
        if (accepted.test(label) && rect.width > 0 && rect.height > 0 && !disabled) {
          return { index, label: label || "submit application" };
        }
      }
      return null;
    });
  },

  async submit(page, ctx) {
    const refusal = submitRefusal(ctx);
    if (refusal) return refusal;
    const button = ctx.submitButton || await workableAdapter.findSubmitButton(page);
    if (!button) return { clicked: false, label: null, reason: "no submit button detected" };
    const finalButtons = page.locator('button, input[type="submit"]');
    await finalButtons.nth(button.index).click({ timeout: 10000 });
    return { clicked: true, label: button.label };
  },

  async verifyReceipt(page, ctx) {
    await page.waitForTimeout(1800);
    const url = page.url();
    const state = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";
      const text = bodyText.slice(0, 8000);
      const idMatch = text.match(/application (?:id|#|reference)\s*[:#]?\s*([A-Za-z0-9-]{4,})/i);
      const formGone = !document.querySelector('input[name="firstname"], form button[type="submit"]');
      return {
        formGone,
        text: text.toLowerCase(),
        applicationId: idMatch ? idMatch[1] : null,
        invalidFields: document.querySelectorAll(':invalid, [aria-invalid="true"]').length,
        // Turnstile is invisible on normal submits; if it escalates to a
        // visible challenge at submit time, report it honestly.
        verificationRequired: /(verify (that )?you are (a )?human|complete the captcha|security verification|confirm you(?:'|’)re human)/i.test(bodyText),
        rateLimited: /(too many requests|rate limit|try again later)/i.test(bodyText),
        visibleAlerts: Array.from(document.querySelectorAll('[role="alert"], .error, .field-error, [class*="error"]'))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240))
          .filter(Boolean)
          .slice(0, 5),
      };
    });
    const textConfirmed = /(thank you for applying|thanks for applying|your application (?:has been|was) (?:submitted|received|sent)|application (?:has been )?(?:submitted|received)|we(?:'|’)ve received your application|application sent)/i.test(state.text);
    const confirmed = textConfirmed || (state.formGone && state.invalidFields === 0 && !state.verificationRequired && state.visibleAlerts.length === 0 && url !== (ctx.previousUrl || ""));
    return {
      confirmed,
      evidence: {
        url,
        urlChanged: url !== (ctx.previousUrl || ""),
        signal: textConfirmed ? "confirmation-text" : confirmed ? "form-replaced" : null,
        formGone: state.formGone,
        applicationId: state.applicationId,
        invalidFields: state.invalidFields,
        verificationRequired: state.verificationRequired,
        rateLimited: state.rateLimited,
        visibleAlerts: state.visibleAlerts,
      },
    };
  },

  // Workable is account-less: no OTP, no emailed verification codes.
  async handleVerification() {
    return { requested: false, completed: false };
  },
});

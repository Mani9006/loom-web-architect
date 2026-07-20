// Ashby adapter for jobs.ashbyhq.com postings.
//
// Posting URLs look like jobs.ashbyhq.com/<org>/<uuid>; the page renders
// "Overview" and "Application" tabs and the form lives at <url>/application.
// Field conventions (verified on live postings):
//   - System fields: input#_systemfield_name (single full-name text field),
//     input#_systemfield_email (type=email), input#_systemfield_resume
//     (type=file); phone is a UUID-named input type=tel.
//   - Custom questions use UUID-named text inputs / TEXTAREAs / checkbox
//     groups; labels live in nearby label/legend/container elements, NOT on
//     the input itself.
//   - Screening Yes/No questions render as button pairs, not selects.
//   - EEOC radio groups are named like `<uuid>__systemfield_eeoc_gender`;
//     option ids look like `-labeled-radio-N`. An option is picked ONLY when
//     the user's stored EEO answer explicitly matches its label text —
//     sensitive attributes are never invented.
//   - Legal consent checkboxes carry the full consent text as the input's
//     `name`. They are ticked ONLY when answer memory holds an explicit
//     affirmative for that text (fuzzyMatchAnswer + isAffirmativeAnswer);
//     when in doubt they stay unticked and surface in requiredMissing.
//   - Submit button text: "Submit Application". Confirmation lands on
//     /application/submitted or renders "Application submitted" /
//     "Thank you for applying".
//
// Same policies as every adapter: fuzzy-matched custom answers only on a
// strong match, no CAPTCHA/login workarounds, submit gated by
// autoSubmit + per-job approval.

import { defineAdapter, submitRefusal } from "./contract.mjs";
import {
  fuzzyMatchAnswer,
  isAffirmativeAnswer,
  isBooleanAnswer,
  isDeclineAnswer,
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

const SYSTEM_FIELD_SELECTOR = 'input[id*="_systemfield"], input[name*="_systemfield"], textarea[id*="_systemfield"]';
const FORM_SELECTOR = `${SYSTEM_FIELD_SELECTOR}, form[action*="ashbyhq"], form[action*="ashby"]`;

/** URL-only Ashby classification (jobs.ashbyhq.com and subdomains). */
export function isAshbyUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === "ashbyhq.com" || host.endsWith(".ashbyhq.com");
}

/**
 * Map an Ashby field descriptor to a profile value. System fields are keyed
 * by their stable `_systemfield_*` id/name; phone is the type=tel input;
 * LinkedIn/website/location resolve from nearby label text. Returns "" for
 * UUID-named custom questions (those are answered from answer memory only).
 */
export function ashbyStandardValueFor(field, profile = {}) {
  const key = normalizeText(`${field?.name || ""} ${field?.id || ""}`);
  const labelKey = normalizeText(field?.label || field?.ariaLabel || field?.placeholder || "");
  const combined = `${key} ${labelKey}`;
  if (/_systemfield_name\b/.test(key) || /^(full )?name$/.test(labelKey)) return profile.fullName || "";
  if (/_systemfield_email/.test(key) || field?.type === "email" || /\bemail\b/.test(combined)) return profile.email || "";
  if (field?.type === "tel" || /\bphone\b|\bmobile\b/.test(combined)) return profile.phone || "";
  if (/linkedin/.test(combined)) return profile.linkedinUrl || "";
  if (/website|portfolio|github/.test(combined)) return profile.portfolioUrl || "";
  if (/_systemfield_location/.test(key) || /\blocation\b|\bcity\b/.test(labelKey)) return profile.location || "";
  return "";
}

/**
 * Resolve the effective label for an Ashby checkbox. Legal consent checkboxes
 * carry the full consent text as the input `name` (the visible label element
 * may be empty), so prefer the name when it reads as a consent.
 */
export function ashbyConsentLabel(field) {
  const name = String(field?.name || "").trim();
  const label = String(field?.label || "").trim();
  if (looksLikeConsentLabel(name)) return name;
  return label || name;
}

const NEGATIVE_ANSWERS = new Set(["no", "n", "false", "0", "i do not", "i don't"]);

/**
 * Ashby-aware descriptor collection. Mirrors generic collectFieldDescriptors
 * (same `input, textarea, select` ordering so setFieldValueByIndex works) but
 * resolves labels the way Ashby renders them: label[for], closest label, then
 * walking up ancestor containers for a label/legend, then an aria/placeholder
 * fallback. Required heuristics match the generic collector.
 */
async function collectAshbyFields(page) {
  return await page.evaluate(() => {
    function findLabelText(el) {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label && (label.textContent || "").trim()) return label.textContent || "";
      }
      const parentLabel = el.closest("label");
      if (parentLabel && (parentLabel.textContent || "").trim()) return parentLabel.textContent || "";
      // Ashby: labels live in nearby containers, not on the input. Walk up to
      // six ancestors and take the innermost label/legend text.
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

/**
 * Collect screening Yes/No button pairs. Indexes are into
 * `document.querySelectorAll("button")` so Node-side code can click with
 * page.locator("button").nth(index).
 */
async function collectYesNoGroups(page) {
  return await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll("button"));
    const textOf = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    const isPressed = (el) => el.getAttribute("aria-pressed") === "true"
      || el.getAttribute("aria-checked") === "true"
      || /(^|\s)(active|selected|checked)(\s|$)/.test(el.className || "");
    const groups = [];
    const seen = new Set();
    for (const yesButton of allButtons) {
      if (textOf(yesButton) !== "yes" || seen.has(yesButton)) continue;
      // Smallest container that also holds a "No" button.
      let container = yesButton.parentElement;
      let noButton = null;
      for (let depth = 0; container && depth < 6; depth += 1) {
        noButton = Array.from(container.querySelectorAll("button")).find((b) => textOf(b) === "no") || null;
        if (noButton) break;
        container = container.parentElement;
      }
      if (!noButton || seen.has(noButton)) continue;
      seen.add(yesButton);
      seen.add(noButton);
      // Question label: innermost ancestor label/legend, else container text.
      let label = "";
      let node = container;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const candidate = node.querySelector ? node.querySelector("label, legend") : null;
        if (candidate && (candidate.textContent || "").trim()) {
          label = candidate.textContent || "";
          break;
        }
        node = node.parentElement;
      }
      if (!label && container) label = container.textContent || "";
      groups.push({
        yesIndex: allButtons.indexOf(yesButton),
        noIndex: allButtons.indexOf(noButton),
        label: label.replace(/\s+/g, " ").trim().slice(0, 300),
        answered: isPressed(yesButton) || isPressed(noButton),
      });
    }
    return groups;
  });
}

/**
 * Collect EEOC radio groups (`<uuid>__systemfield_eeoc_*`). Option indexes
 * are into `input, textarea, select` so setFieldValueByIndex can tick them.
 */
async function collectEeoGroups(page) {
  return await page.evaluate(() => {
    const allControls = Array.from(document.querySelectorAll("input, textarea, select"));
    const radios = allControls.filter((el) => el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "radio");
    const byName = new Map();
    for (const radio of radios) {
      const name = radio.getAttribute("name") || "";
      if (!/__systemfield_eeoc|eeoc/i.test(name)) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(radio);
    }
    const groups = [];
    for (const [name, members] of byName) {
      const first = members[0];
      let label = "";
      const fieldset = first.closest("fieldset");
      if (fieldset) label = fieldset.querySelector("legend")?.textContent || "";
      if (!label.trim()) {
        let node = first.parentElement;
        for (let depth = 0; node && depth < 6; depth += 1) {
          const candidate = node.querySelector("label, legend");
          if (candidate && (candidate.textContent || "").trim()) {
            label = candidate.textContent || "";
            break;
          }
          node = node.parentElement;
        }
      }
      const topic = name.replace(/^.*__systemfield_eeoc_?/i, "").replace(/[_-]+/g, " ").trim();
      const options = members.map((radio) => {
        const id = radio.getAttribute("id") || "";
        let optionLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
        if (!optionLabel.trim()) optionLabel = radio.closest("label")?.textContent || "";
        if (!optionLabel.trim()) optionLabel = radio.parentElement?.textContent || "";
        return {
          index: allControls.indexOf(radio),
          label: optionLabel.replace(/\s+/g, " ").trim().slice(0, 200),
          checked: radio.checked === true,
        };
      });
      groups.push({
        name,
        topic,
        label: (label || topic).replace(/\s+/g, " ").trim().slice(0, 300),
        options,
        answered: members.some((radio) => radio.checked === true),
      });
    }
    return groups;
  });
}

/** Upload the resume into #_systemfield_resume (or fall back to generic detection). */
async function uploadAshbyResume(page, resumePath) {
  const fileInputs = page.locator('input[type="file"]');
  const totalFileInputs = await fileInputs.count().catch(() => 0);
  const systemResume = page.locator(
    'input[type="file"][id*="_systemfield_resume"], input[type="file"][name*="_systemfield_resume"]'
  ).first();
  const hasSystemResume = await systemResume.count().catch(() => 0);
  if (!hasSystemResume) {
    return await uploadResume(page, resumePath);
  }
  const required = await systemResume.evaluate((el) =>
    el.hasAttribute("required") || el.getAttribute("aria-required") === "true"
  ).catch(() => false);
  if (!resumePath) {
    return { fileInputs: totalFileInputs, resumeInputs: 1, uploaded: 0, requiredMissing: required };
  }
  await systemResume.setInputFiles(resumePath);
  return { fileInputs: totalFileInputs, resumeInputs: 1, uploaded: 1, requiredMissing: false };
}

async function ashbyFormPresent(page) {
  return await page.locator(FORM_SELECTOR).count().then((count) => count > 0).catch(() => false);
}

export const ashbyAdapter = defineAdapter({
  metadata: { name: "ashby", version: "1.0.0" },

  async detect(url, page) {
    if (isAshbyUrl(url)) return true;
    if (page) {
      try {
        return await page.evaluate(() => Boolean(document.querySelector(
          'input[id*="_systemfield"], input[name*="_systemfield"], script[src*="ashbyhq"], script[src*="ashby"], form[action*="ashbyhq"], #ashby_embed, .ashby-application-form, [class*="ashby-job-posting"]'
        )));
      } catch {
        return false;
      }
    }
    return false;
  },

  async prepare(page) {
    const blockers = await detectBlockers(page);
    if (blockers.length > 0) return { ok: false, blocked: blockers[0] };

    let hasForm = await ashbyFormPresent(page);

    if (!hasForm) {
      // Posting overview -> switch to the Application tab or navigate to the
      // /application path where the form lives.
      const applicationTab = page.locator(
        'a[href$="/application"], [role="tab"]:has-text("Application"), button:has-text("Application"), a:has-text("Application")'
      ).first();
      if (await applicationTab.count().catch(() => 0)) {
        await applicationTab.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
      } else if (isAshbyUrl(page.url()) && !/\/application\/?$/.test(new URL(page.url()).pathname)) {
        const applicationUrl = page.url().replace(/\/?(\?.*)?$/, "/application");
        await page.goto(applicationUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
      hasForm = await ashbyFormPresent(page);
      if (!hasForm) {
        // Ashby is a React SPA: give the form a moment to hydrate.
        await page.locator(SYSTEM_FIELD_SELECTOR).first()
          .waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
        hasForm = await ashbyFormPresent(page);
      }
    }

    // Re-check blockers after navigation (a challenge may render late).
    const lateBlockers = await detectBlockers(page);
    if (lateBlockers.length > 0) return { ok: false, blocked: lateBlockers[0] };

    return { ok: true, blocked: null, note: hasForm ? "application form present" : "application form not confirmed" };
  },

  async fillFields(page, ctx) {
    const profile = ctx.profile || {};
    const answers = ctx.answers || {};

    // File uploads and combobox dropdowns can re-render framework forms. Do
    // those first, then fill ordinary controlled inputs last.
    const upload = await uploadAshbyResume(page, ctx.documents?.resumePath || null);
    const custom = await fillCustomFields(page, profile, answers, ctx.approved === true);

    const fields = await collectAshbyFields(page);
    let filledCount = Number(custom?.filledCount || 0);

    for (const field of fields) {
      if (!field.visible) continue;
      if (["file", "hidden", "submit", "button", "radio"].includes(field.type)) continue;
      const alreadyFilled = field.type === "checkbox"
        ? field.checked
        : String(field.value || "").trim().length > 0;
      if (alreadyFilled) continue;

      if (field.type === "checkbox") {
        // Consent checkboxes (Ashby stores the consent text in `name`): tick
        // ONLY on an explicit stored affirmative; otherwise leave unticked.
        const consentLabel = ashbyConsentLabel(field);
        if (looksLikeConsentLabel(consentLabel)) {
          const match = fuzzyMatchAnswer(consentLabel, answers);
          if (match && isAffirmativeAnswer(match.answer)) {
            if (await setFieldValueByIndex(page, field.index, "true")) filledCount += 1;
          }
          continue;
        }
        // Non-consent checkbox options: tick only when the stored answer for
        // the question equals this option's label exactly.
        const label = field.label || field.ariaLabel || field.name;
        const match = fuzzyMatchAnswer(label, answers);
        if (match && normalizeText(match.answer) === normalizeText(label)) {
          if (await setFieldValueByIndex(page, field.index, "true")) filledCount += 1;
        }
        continue;
      }

      const label = field.label || field.ariaLabel || field.placeholder || field.name;

      // System identity fields (full name goes in as-is; Ashby takes one
      // single name field, no first/last split).
      const standardValue = ashbyStandardValueFor(field, profile);
      if (standardValue) {
        if (await setFieldValueByIndex(page, field.index, standardValue)) filledCount += 1;
        continue;
      }

      // UUID-named custom questions: strong fuzzy label match only.
      const match = fuzzyMatchAnswer(label, answers);
      // Boolean answers (yes/no) belong to yes/no controls, never free text.
      if (match && !isBooleanAnswer(match.answer)) {
        if (await setFieldValueByIndex(page, field.index, match.answer)) filledCount += 1;
      }
      // Unmatched questions stay blank; required ones become requiredMissing.
    }

    // Screening Yes/No button pairs: answer from memory only.
    const yesNoGroups = await collectYesNoGroups(page);
    for (const group of yesNoGroups) {
      if (group.answered) continue;
      const match = fuzzyMatchAnswer(group.label, answers);
      if (!match) continue;
      const normalized = normalizeText(match.answer);
      const index = isAffirmativeAnswer(normalized)
        ? group.yesIndex
        : NEGATIVE_ANSWERS.has(normalized)
          ? group.noIndex
          : null;
      if (index === null || index < 0) continue;
      const clicked = await page.locator("button").nth(index)
        .click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (clicked) filledCount += 1;
    }

    // EEOC radio groups: pick the option matching the user's explicitly stored
    // EEO answer. Never invent sensitive attributes; unset stays unanswered.
    const eeoGroups = await collectEeoGroups(page);
    for (const group of eeoGroups) {
      if (group.answered) continue;
      const match = fuzzyMatchAnswer(group.label, answers) || fuzzyMatchAnswer(group.topic, answers);
      if (!match) continue;
      const wanted = normalizeText(match.answer);
      const option = group.options.find((candidate) => {
        const optionText = normalizeText(candidate.label);
        return optionText && (
          optionText === wanted
          || optionText.includes(wanted)
          || wanted.includes(optionText)
          || (isDeclineAnswer(wanted) && isDeclineAnswer(optionText))
        );
      });
      if (!option) continue;
      if (await setFieldValueByIndex(page, option.index, "true")) filledCount += 1;
    }

    // Yes/No button clicks and EEOC radio picks re-render Ashby's SPA and can
    // WIPE text inputs filled earlier (observed live: "2 weeks" vanished after
    // the sponsorship buttons were clicked). Final pass: re-collect and refill
    // any text field that ended up empty.
    const finalFields = await collectAshbyFields(page);
    for (const field of finalFields) {
      if (!field.visible) continue;
      if (["file", "hidden", "submit", "button", "radio", "checkbox"].includes(field.type)) continue;
      if (String(field.value || "").trim().length > 0) continue;
      const label = field.label || field.ariaLabel || field.placeholder || field.name;
      const value = ashbyStandardValueFor(field, profile)
        || fuzzyMatchAnswer(label, answers)?.answer
        || "";
      if (value && (await setFieldValueByIndex(page, field.index, value))) filledCount += 1;
    }

    return {
      filledCount,
      totalFields: fields.length,
      upload,
      // Ashby rarely uses email verification codes; nothing to request.
      verification: { requested: false, completed: false },
    };
  },

  async reviewState(page) {
    const fields = await collectAshbyFields(page);
    const requiredMissing = requiredMissingFromFields(fields);
    const hasGap = requiredMissing.length > 0;
    return {
      requiredMissing,
      summary: hasGap
        ? `Ashby form has ${requiredMissing.length} unanswered required field(s): ${requiredMissing.slice(0, 5).join("; ")}`
        : "Ashby form has no outstanding required fields.",
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
    const button = ctx.submitButton || await ashbyAdapter.findSubmitButton(page);
    if (!button) return { clicked: false, label: null, reason: "no submit button detected" };
    const finalButtons = page.locator('button, input[type="submit"]');
    await finalButtons.nth(button.index).click({ timeout: 10000 });
    return { clicked: true, label: button.label };
  },

  async verifyReceipt(page, ctx) {
    await page.waitForTimeout(1800);
    const url = page.url();
    const onSubmittedPage = /\/application\/submitted\/?(\?|$)/.test(url);
    const state = await page.evaluate(() => {
      const confirmationNode = document.querySelector(
        '.ashby-application-confirmation, [class*="application-confirmation"], [data-testid*="confirmation"], #confirmation'
      );
      const bodyText = document.body?.innerText || "";
      const text = bodyText.slice(0, 8000);
      const idMatch = text.match(/application (?:id|#)\s*[:#]?\s*([A-Za-z0-9-]{4,})/i);
      return {
        hasConfirmationContainer: Boolean(confirmationNode),
        containerText: confirmationNode ? (confirmationNode.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300) : null,
        text: text.toLowerCase(),
        applicationId: idMatch ? idMatch[1] : null,
        spamFlagged: /flagged as possible spam|couldn.t submit your application/i.test(bodyText),
        invalidFields: document.querySelectorAll(':invalid, [aria-invalid="true"]').length,
        verificationRequired: /(verification code was sent|enter the .*code|security code|confirm you(?:'|’)re human)/i.test(bodyText),
        visibleAlerts: Array.from(document.querySelectorAll('[role="alert"], .error, .field-error'))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240))
          .filter(Boolean)
          .slice(0, 5),
      };
    });
    const textConfirmed = /(application (?:has been )?submitted|application (?:has been )?received|thank you for applying|thanks for applying)/i.test(state.text);
    const confirmed = onSubmittedPage || state.hasConfirmationContainer || textConfirmed;
    return {
      confirmed,
      evidence: {
        url,
        urlChanged: url !== (ctx.previousUrl || ""),
        signal: onSubmittedPage
          ? "ashby-submitted-url"
          : state.hasConfirmationContainer
            ? "ashby-confirmation-container"
            : textConfirmed
              ? "confirmation-text"
              : null,
        containerText: state.containerText,
        applicationId: state.applicationId,
        invalidFields: state.invalidFields,
        spamFlagged: state.spamFlagged,
        verificationRequired: state.verificationRequired,
        visibleAlerts: state.visibleAlerts,
      },
    };
  },

  // Ashby rarely uses emailed verification codes; no post-submit code loop.
  async handleVerification() {
    return { requested: false, completed: false };
  },
});

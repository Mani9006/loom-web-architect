// Greenhouse job-board adapter.
//
// Covers boards.greenhouse.io / job-boards.greenhouse.io hosted boards and
// *.greenhouse.io embedded boards (grnhse iframe). Handles the standard
// first_name / last_name / email / phone fields, resume upload, label-driven
// custom questions (answered only on a strong fuzzy match), the emailed
// security-code step (via the worker's verification-code loop), and
// "Thank you for applying" confirmation detection.
//
// Consent checkboxes are ONLY ticked when ctx.answers contains an explicit
// affirmative for that question. Unknown consents and unmatched REQUIRED
// questions are left untouched and reported via reviewState().

import { defineAdapter, submitRefusal } from "./contract.mjs";
import {
  detectAtsFromUrl,
  fuzzyMatchAnswer,
  isAffirmativeAnswer,
  looksLikeConsentLabel,
  normalizeText,
  requiredMissingFromFields,
} from "./helpers.mjs";
import {
  collectFieldDescriptors,
  detectBlockers,
  fillCustomFields,
  runVerificationLoop,
  setFieldValueByIndex,
  uploadResume,
} from "./generic.mjs";

const FORM_SELECTOR = '#application-form, form[action*="applications"], #application_form, form#grnhse_form';

/**
 * Greenhouse boards are frequently embedded via the grnhse iframe. Resolve
 * the frame that actually contains the application form; fall back to the
 * top-level page.
 */
export async function resolveTarget(page) {
  if (typeof page?.frames === "function") {
    for (const frame of page.frames()) {
      try {
        if (/greenhouse\.io/i.test(frame.url()) && frame !== page.mainFrame()) {
          return frame;
        }
      } catch {
        // Detached frames can throw; ignore.
      }
    }
  }
  return page;
}

function isGreenhouseUrl(url) {
  return detectAtsFromUrl(url) === "greenhouse";
}

async function pageLooksLikeGreenhouse(page) {
  try {
    return await page.evaluate(() => Boolean(document.querySelector(
      '#grnhse_app, iframe[src*="greenhouse.io"], form[action*="greenhouse.io"], #application-form [data-provides*="greenhouse"], meta[content*="greenhouse"]'
    )));
  } catch {
    return false;
  }
}

function isStandardGreenhouseField(field) {
  const key = normalizeText(`${field.name} ${field.id}`);
  return /(first[_ ]?name|last[_ ]?name|\bemail\b|\bphone\b|resume|cover[_ ]?letter|location|security[_ ]?code)/.test(key);
}

function standardValueFor(field, profile) {
  const key = normalizeText(`${field.name} ${field.id}`);
  const nameParts = String(profile.fullName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  if (/first[_ ]?name/.test(key)) return firstName;
  if (/last[_ ]?name/.test(key)) return lastName;
  if (/\bemail\b/.test(key) && field.type !== "checkbox") return profile.email || "";
  if (/\bphone\b/.test(key)) return profile.phone || "";
  if (/location|candidate[_ ]?location/.test(key)) return profile.location || "";
  if (/linkedin/.test(key + " " + normalizeText(field.label))) return profile.linkedinUrl || "";
  if (/website|portfolio|github/.test(key + " " + normalizeText(field.label))) return profile.portfolioUrl || "";
  return "";
}

export const greenhouseAdapter = defineAdapter({
  metadata: { name: "greenhouse", version: "1.0.0" },

  async detect(url, page) {
    if (isGreenhouseUrl(url)) return true;
    if (page) return await pageLooksLikeGreenhouse(page);
    return false;
  },

  async prepare(page) {
    const blockers = await detectBlockers(page);
    if (blockers.length > 0) return { ok: false, blocked: blockers[0] };

    let target = await resolveTarget(page);
    let hasForm = await target.locator(FORM_SELECTOR).count().then((c) => c > 0).catch(() => false);

    if (!hasForm) {
      // Job-posting pages show an Apply button/tab before the form renders.
      const applyButton = page.locator(
        'a[href*="#app"], a[href$="/application"], #apply_button, button:has-text("Apply"), a:has-text("Apply for this job"), a:has-text("Apply Now")'
      ).first();
      if (await applyButton.count().catch(() => 0)) {
        await applyButton.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
        target = await resolveTarget(page);
        hasForm = await target.locator(FORM_SELECTOR).count().then((c) => c > 0).catch(() => false);
      }
    }

    // Re-check blockers after navigation/expansion (CAPTCHA may render late).
    const lateBlockers = await detectBlockers(await resolveTarget(page));
    if (lateBlockers.length > 0) return { ok: false, blocked: lateBlockers[0] };

    return { ok: true, blocked: null, note: hasForm ? "application form present" : "application form not confirmed" };
  },

  async fillFields(page, ctx) {
    const target = await resolveTarget(page);
    const profile = ctx.profile || {};
    const answers = ctx.answers || {};

    // File uploads and custom dropdowns can re-render Greenhouse forms. Do
    // those first, then fill ordinary React-controlled inputs last so their
    // values remain committed in the framework state.
    const upload = await uploadResume(target, ctx.documents?.resumePath || null);
    const custom = await fillCustomFields(target, profile, answers, ctx.approved === true);

    const fields = await collectFieldDescriptors(target);

    let filledCount = Number(custom?.filledCount || 0);

    for (const field of fields) {
      if (!field.visible) continue;
      if (field.type === "file" || field.type === "hidden" || field.type === "submit" || field.type === "button") continue;
      const alreadyFilled = field.type === "checkbox" || field.type === "radio"
        ? field.checked
        : String(field.value || "").trim().length > 0;
      if (alreadyFilled) continue;

      const label = field.label || field.ariaLabel || field.placeholder || field.name;

      // Consent checkboxes: only with an explicit stored affirmative.
      if (field.type === "checkbox") {
        if (looksLikeConsentLabel(label)) {
          const match = fuzzyMatchAnswer(label, answers);
          if (match && isAffirmativeAnswer(match.answer)) {
            if (await setFieldValueByIndex(target, field.index, "true")) filledCount += 1;
          }
          // No affirmative -> leave unchecked; required consents surface in reviewState.
        }
        continue;
      }
      if (field.type === "radio") continue; // Never guess single-choice answers.
      if (field.role === "combobox") continue; // Owned by fillCustomFields above.

      // Security-code inputs are handled by the verification loop below.
      if (/security[_ ]?code|verification/i.test(`${field.name} ${field.id} ${label}`)) continue;

      // Standard identity fields.
      const standardValue = standardValueFor(field, profile);
      if (standardValue) {
        if (await setFieldValueByIndex(target, field.index, standardValue)) filledCount += 1;
        continue;
      }
      if (isStandardGreenhouseField(field)) continue;

      // Custom questions: strong fuzzy label match against answer memory only.
      const match = fuzzyMatchAnswer(label, answers);
      if (match) {
        if (await setFieldValueByIndex(target, field.index, match.answer)) filledCount += 1;
      }
      // Unmatched questions stay blank; required ones become requiredMissing.
    }

    // Greenhouse email security-code step: reuse the worker verification loop.
    const verification = await runVerificationLoop(target, ctx);

    return {
      filledCount,
      totalFields: fields.length,
      upload,
      verification,
    };
  },

  async reviewState(page) {
    const target = await resolveTarget(page);
    const fields = await collectFieldDescriptors(target);
    const requiredMissing = requiredMissingFromFields(fields);
    const hasCustomGap = requiredMissing.length > 0;
    return {
      requiredMissing,
      summary: hasCustomGap
        ? `Greenhouse form has ${requiredMissing.length} unanswered required field(s): ${requiredMissing.slice(0, 5).join("; ")}`
        : "Greenhouse form has no outstanding required fields.",
      // Unmatched required questions need a human answer, not a retry.
      recommendation: hasCustomGap ? "needs_attention" : "needs_review",
    };
  },

  async findSubmitButton(page) {
    const target = await resolveTarget(page);
    return await target.evaluate(() => {
      const accepted = /^(submit|submit application|send application|verify|verify code|confirm application)$/;
      const elements = Array.from(document.querySelectorAll('button, input[type="submit"], #submit_app'));
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        const label = (element.textContent || element.getAttribute("value") || "").toLowerCase().replace(/\s+/g, " ").trim();
        const rect = element.getBoundingClientRect();
        const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
        if ((accepted.test(label) || element.id === "submit_app") && rect.width > 0 && rect.height > 0 && !disabled) {
          return { index, label: label || "submit" };
        }
      }
      return null;
    });
  },

  async submit(page, ctx) {
    const refusal = submitRefusal(ctx);
    if (refusal) return refusal;
    const target = await resolveTarget(page);
    const button = ctx.submitButton || await greenhouseAdapter.findSubmitButton(page);
    if (!button) return { clicked: false, label: null, reason: "no submit button detected" };
    const finalButtons = target.locator('button, input[type="submit"], #submit_app');
    await finalButtons.nth(button.index).click({ timeout: 10000 });
    return { clicked: true, label: button.label };
  },

  async verifyReceipt(page, ctx) {
    await page.waitForTimeout(1800);
    const target = await resolveTarget(page);
    const state = await target.evaluate(() => {
      const confirmationNode = document.querySelector(
        '#application_confirmation, .application-confirmation, [data-provides="application-confirmation"], #confirmation'
      );
      const bodyText = document.body?.innerText || "";
      const text = bodyText.slice(0, 8000);
      const idMatch = text.match(/application (?:id|#)\s*[:#]?\s*([A-Za-z0-9-]{4,})/i);
      return {
        hasConfirmationContainer: Boolean(confirmationNode),
        containerText: confirmationNode ? (confirmationNode.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300) : null,
        text: text.toLowerCase(),
        applicationId: idMatch ? idMatch[1] : null,
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
    const textConfirmed = /(thank you for applying|thanks for applying|your application has been (received|submitted)|application submitted)/i.test(state.text);
    const confirmed = state.hasConfirmationContainer || textConfirmed;
    return {
      confirmed,
      evidence: {
        url: page.url(),
        urlChanged: page.url() !== (ctx.previousUrl || ""),
        signal: state.hasConfirmationContainer ? "greenhouse-confirmation-container" : textConfirmed ? "confirmation-text" : null,
        containerText: state.containerText,
        applicationId: state.applicationId,
        invalidFields: state.invalidFields,
        verificationRequired: state.verificationRequired,
        visibleAlerts: state.visibleAlerts,
      },
    };
  },

  // Post-submit verification handoff: Greenhouse frequently reveals the
  // emailed security-code step only AFTER the first submit (428 response), so
  // the worker re-runs verification on the resolved iframe/page target.
  async handleVerification(page, ctx) {
    const target = await resolveTarget(page);
    return await runVerificationLoop(target, ctx);
  },
});

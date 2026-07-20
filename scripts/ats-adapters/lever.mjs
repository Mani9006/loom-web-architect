// Lever adapter for jobs.lever.co postings.
//
// Posting URLs look like jobs.lever.co/<org>/<uuid>; the application form
// lives at .../apply (form[action*="apply"]) with fields name, email, phone,
// org, urls[LinkedIn|GitHub|Portfolio|Twitter|Other], resume upload, and
// custom question cards. Confirmation lands on /thanks or renders a
// .confirmation container.
//
// Same policies as every adapter: fuzzy-matched custom answers only on a
// strong match, consent checkboxes only with an explicit stored affirmative,
// no CAPTCHA/login workarounds, submit gated by autoSubmit + approval.

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
  runVerificationLoop,
  setFieldValueByIndex,
  uploadResume,
} from "./generic.mjs";

const FORM_SELECTOR = 'form[action*="apply"], form.application-form';

function isLeverUrl(url) {
  return detectAtsFromUrl(url) === "lever";
}

function standardValueFor(field, profile) {
  const key = normalizeText(`${field.name} ${field.id}`);
  const labelKey = normalizeText(field.label || field.placeholder || field.ariaLabel || "");
  if (key === "name" || /^(full )?name$/.test(labelKey)) return profile.fullName || "";
  if (key === "email" || /\bemail\b/.test(key)) return profile.email || "";
  if (key === "phone" || /\bphone\b/.test(key)) return profile.phone || "";
  if (key === "org" || /current (company|organization)/.test(labelKey)) return profile.currentCompany || profile.company || "";
  if (key === "location" || /location/.test(labelKey)) return profile.location || "";
  if (/urls\[linkedin\]|linkedin/.test(key + " " + labelKey)) return profile.linkedinUrl || "";
  if (/urls\[(github|portfolio|other)\]|portfolio|github|website/.test(key + " " + labelKey)) return profile.portfolioUrl || "";
  if (/urls\[twitter\]/.test(key)) return profile.twitterUrl || "";
  return "";
}

function isStandardLeverField(field) {
  const key = normalizeText(`${field.name} ${field.id}`);
  return /^(name|email|phone|org|location|comments)$/.test(key) || /^urls\[/.test(field.name || "") || /resume/.test(key);
}

export const leverAdapter = defineAdapter({
  metadata: { name: "lever", version: "1.0.0" },

  async detect(url, page) {
    if (isLeverUrl(url)) return true;
    if (page) {
      try {
        return await page.evaluate(() => Boolean(document.querySelector(
          'form[action*="lever.co"], a[href*="jobs.lever.co"][class*="postings-btn"], meta[content*="lever.co"]'
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

    let hasForm = await page.locator(FORM_SELECTOR).count().then((c) => c > 0).catch(() => false);

    if (!hasForm) {
      // Posting page -> follow the "Apply for this job" button to /apply.
      const applyLink = page.locator('a.postings-btn[href$="/apply"], a[href$="/apply"], a:has-text("Apply for this job")').first();
      if (await applyLink.count().catch(() => 0)) {
        await applyLink.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
      } else if (isLeverUrl(page.url()) && !/\/apply\/?$/.test(new URL(page.url()).pathname)) {
        const applyUrl = page.url().replace(/\/?(\?.*)?$/, "/apply");
        await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
      hasForm = await page.locator(FORM_SELECTOR).count().then((c) => c > 0).catch(() => false);
    }

    const lateBlockers = await detectBlockers(page);
    if (lateBlockers.length > 0) return { ok: false, blocked: lateBlockers[0] };

    return { ok: true, blocked: null, note: hasForm ? "application form present" : "application form not confirmed" };
  },

  async fillFields(page, ctx) {
    const profile = ctx.profile || {};
    const answers = ctx.answers || {};
    const fields = await collectFieldDescriptors(page);

    let filledCount = 0;

    for (const field of fields) {
      if (!field.visible) continue;
      if (field.type === "file" || field.type === "hidden" || field.type === "submit" || field.type === "button") continue;
      const alreadyFilled = field.type === "checkbox" || field.type === "radio"
        ? field.checked
        : String(field.value || "").trim().length > 0;
      if (alreadyFilled) continue;

      const label = field.label || field.ariaLabel || field.placeholder || field.name;

      if (field.type === "checkbox") {
        if (looksLikeConsentLabel(label)) {
          const match = fuzzyMatchAnswer(label, answers);
          if (match && isAffirmativeAnswer(match.answer)) {
            if (await setFieldValueByIndex(page, field.index, "true")) filledCount += 1;
          }
        } else {
          // Lever multiple-choice checkboxes (cards): only tick on a strong
          // match where the stored answer equals this option's label.
          const match = fuzzyMatchAnswer(label, answers);
          if (match && normalizeText(match.answer) === normalizeText(label)) {
            if (await setFieldValueByIndex(page, field.index, "true")) filledCount += 1;
          }
        }
        continue;
      }
      if (field.type === "radio") continue; // Never guess single-choice answers.

      const standardValue = standardValueFor(field, profile);
      if (standardValue) {
        if (await setFieldValueByIndex(page, field.index, standardValue)) filledCount += 1;
        continue;
      }
      if (isStandardLeverField(field)) continue;

      // Custom question cards: label-driven fuzzy match only.
      const match = fuzzyMatchAnswer(label, answers);
      if (match) {
        if (await setFieldValueByIndex(page, field.index, match.answer)) filledCount += 1;
      }
    }

    const upload = await uploadResume(page, ctx.documents?.resumePath || null);
    const verification = await runVerificationLoop(page, ctx);

    return {
      filledCount,
      totalFields: fields.length,
      upload,
      verification,
    };
  },

  async reviewState(page) {
    const fields = await collectFieldDescriptors(page);
    const requiredMissing = requiredMissingFromFields(fields);
    const hasGap = requiredMissing.length > 0;
    return {
      requiredMissing,
      summary: hasGap
        ? `Lever form has ${requiredMissing.length} unanswered required field(s): ${requiredMissing.slice(0, 5).join("; ")}`
        : "Lever form has no outstanding required fields.",
      recommendation: hasGap ? "needs_attention" : "needs_review",
    };
  },

  async findSubmitButton(page) {
    return await page.evaluate(() => {
      const accepted = /^(submit|submit application|send application|submit your application|verify|verify code|confirm application)$/;
      const elements = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        const label = (element.textContent || element.getAttribute("value") || "").toLowerCase().replace(/\s+/g, " ").trim();
        const rect = element.getBoundingClientRect();
        const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
        const isTemplateButton = element.classList.contains("postings-btn") && element.getAttribute("type") === "submit";
        if ((accepted.test(label) || isTemplateButton) && rect.width > 0 && rect.height > 0 && !disabled) {
          return { index, label: label || "submit application" };
        }
      }
      return null;
    });
  },

  async submit(page, ctx) {
    const refusal = submitRefusal(ctx);
    if (refusal) return refusal;
    const button = ctx.submitButton || await leverAdapter.findSubmitButton(page);
    if (!button) return { clicked: false, label: null, reason: "no submit button detected" };
    const finalButtons = page.locator('button, input[type="submit"]');
    await finalButtons.nth(button.index).click({ timeout: 10000 });
    return { clicked: true, label: button.label };
  },

  async verifyReceipt(page, ctx) {
    await page.waitForTimeout(1800);
    const url = page.url();
    const onThanksPage = /\/thanks\/?(\?|$)/.test(url);
    const state = await page.evaluate(() => {
      const confirmationNode = document.querySelector('.confirmation, [data-qa="confirmation"], .posting-thanks');
      const bodyText = document.body?.innerText || "";
      return {
        hasConfirmationContainer: Boolean(confirmationNode),
        containerText: confirmationNode ? (confirmationNode.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300) : null,
        text: bodyText.slice(0, 8000).toLowerCase(),
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
    const textConfirmed = /(application (?:has been )?(?:received|submitted)|thank you for applying|thanks for applying)/i.test(state.text);
    const confirmed = onThanksPage || state.hasConfirmationContainer || textConfirmed;
    return {
      confirmed,
      evidence: {
        url,
        urlChanged: url !== (ctx.previousUrl || ""),
        signal: onThanksPage ? "lever-thanks-url" : state.hasConfirmationContainer ? "lever-confirmation-container" : textConfirmed ? "confirmation-text" : null,
        containerText: state.containerText,
        invalidFields: state.invalidFields,
        verificationRequired: state.verificationRequired,
        visibleAlerts: state.visibleAlerts,
      },
    };
  },

  // Post-submit verification handoff: re-run the emailed security-code loop
  // if a submit reveals a verification step.
  async handleVerification(page, ctx) {
    return await runVerificationLoop(page, ctx);
  },
});

// Workday adapter for *.myworkdayjobs.com / *.myworkday.com apply flows.
//
// Workday tenants vary (SSO, "Apply Manually", multi-step wizards). This
// adapter fills identity fields it can see and only reports submitted when
// verifyReceipt() finds a confirmation. Login walls, SSO, and CAPTCHA are
// blockers → needs_you. Never invent a success.

import { defineAdapter, submitRefusal } from "./contract.mjs";
import { detectAts } from "./catalog.mjs";
import {
  detectBlockers,
  collectFieldDescriptors,
  setFieldValueByIndex,
  uploadResume,
} from "./generic.mjs";
import { requiredMissingFromFields } from "./helpers.mjs";

export function isWorkdayUrl(url) {
  return detectAts(url).ats === "workday";
}

async function pageLooksLikeWorkday(page) {
  try {
    return await page.evaluate(() => {
      const host = location.hostname.toLowerCase();
      if (host.includes("myworkday")) return true;
      return Boolean(document.querySelector("[data-automation-id], [id*='workday'], css-1 [class*='WD']"));
    });
  } catch {
    return false;
  }
}

function workdayValueFor(field, profile = {}) {
  const key = `${field?.name || ""} ${field?.id || ""} ${field?.label || ""} ${field?.ariaLabel || ""}`.toLowerCase();
  if (/legal\s*name|first\s*name/.test(key) && /first/.test(key)) return (profile.fullName || "").split(/\s+/)[0] || "";
  if (/last\s*name|family\s*name|surname/.test(key)) return (profile.fullName || "").split(/\s+/).slice(1).join(" ") || "";
  if (/\bemail\b/.test(key) || field?.type === "email") return profile.email || "";
  if (/\bphone\b|mobile/.test(key) || field?.type === "tel") return profile.phone || "";
  if (/linkedin/.test(key)) return profile.linkedinUrl || "";
  if (/\bcity\b|\blocation\b|country/.test(key)) return profile.location || "";
  return "";
}

export const workdayAdapter = defineAdapter({
  metadata: { name: "workday", version: "1.0.0" },

  async detect(url, page) {
    if (isWorkdayUrl(url)) return true;
    if (page) return pageLooksLikeWorkday(page);
    return false;
  },

  async prepare(page, ctx) {
    await ctx.heartbeat({ step: "workday_prepare", at: new Date().toISOString() });
    const blockers = await detectBlockers(page);
    if (blockers?.kind) {
      return { ok: false, blocked: { kind: blockers.kind, message: blockers.message || "Workday blocked this page (login, SSO, or CAPTCHA)." } };
    }

    const loginWall = await page.evaluate(() => {
      const text = (document.body?.innerText || "").toLowerCase();
      return /sign in to workday|log in to workday|use your company credentials|sso/.test(text)
        && Boolean(document.querySelector("input[type='password'], input[name*='password' i]"));
    }).catch(() => false);
    if (loginWall) {
      return {
        ok: false,
        blocked: { kind: "login", message: "This Workday posting requires a sign-in. Open the tailored packet and apply on the employer site." },
      };
    }

    // Best-effort: click Apply / Apply Manually when still on the job page.
    const clicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button, a, [role='button']")];
      const apply = buttons.find((el) => /^(apply|apply manually|apply now)$/i.test((el.textContent || "").trim()));
      if (apply && typeof apply.click === "function") {
        apply.click();
        return true;
      }
      return false;
    }).catch(() => false);
    if (clicked) await page.waitForTimeout(1500);

    return { ok: true, note: "Workday apply surface opened when available." };
  },

  async fillFields(page, ctx) {
    const upload = await uploadResume(page, ctx.documents?.resumePath || null);
    const fields = await collectFieldDescriptors(page);
    let filledCount = 0;
    for (let index = 0; index < fields.length; index += 1) {
      const value = workdayValueFor(fields[index], ctx.profile);
      if (!value) continue;
      const ok = await setFieldValueByIndex(page, index, value);
      if (ok) filledCount += 1;
    }
    return {
      filledCount,
      totalFields: fields.length,
      upload,
      verification: { requested: false, completed: false },
    };
  },

  async reviewState(page) {
    const fields = await collectFieldDescriptors(page);
    const requiredMissing = requiredMissingFromFields(fields);
    return {
      requiredMissing,
      summary: requiredMissing.length
        ? `${requiredMissing.length} required Workday field(s) still need you.`
        : "Visible Workday fields are filled. Submit still requires a portal receipt.",
      recommendation: requiredMissing.length ? "needs_review" : undefined,
    };
  },

  async findSubmitButton(page) {
    return page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button, input[type='submit'], [role='button']")];
      const match = buttons.find((el) => /submit application|submit|review and submit/i.test((el.textContent || el.value || "").trim()));
      if (!match) return null;
      return { index: buttons.indexOf(match), label: (match.textContent || match.value || "Submit").trim() };
    }).catch(() => null);
  },

  async submit(page, ctx) {
    const refused = submitRefusal(ctx);
    if (refused) return refused;
    const button = ctx.submitButton;
    if (!button) return { clicked: false, label: null, reason: "no Workday submit button" };
    const clicked = await page.evaluate((index) => {
      const buttons = [...document.querySelectorAll("button, input[type='submit'], [role='button']")];
      const el = buttons[index];
      if (!el) return false;
      el.click();
      return true;
    }, button.index).catch(() => false);
    return { clicked, label: button.label || "Submit" };
  },

  async verifyReceipt(page) {
    const evidence = await page.evaluate(() => {
      const text = (document.body?.innerText || "").slice(0, 4000);
      const url = location.href;
      const confirmed = /thank you for (your )?application|application (has been )?submitted|successfully submitted|we have received your application/i.test(text)
        || /submitted|confirmation/i.test(url);
      return { confirmed, url, snippet: text.slice(0, 400) };
    }).catch(() => ({ confirmed: false, url: "", snippet: "" }));
    return { confirmed: evidence.confirmed === true, evidence };
  },

  async handleVerification() {
    return { requested: false, completed: false, reason: "Workday does not use the emailed Greenhouse-style code step." };
  },
});

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
  mapResumeExperience,
  normalizeText,
  parseMonthYear,
  requiredMissingFromFields,
} from "./helpers.mjs";
import {
  collectFieldDescriptors,
  chooseVisibleOption,
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
        // Match by HOSTNAME only. Matching the raw URL also hits frames like
        // Google Drive's upload proxy (content.googleapis.com/...&parent=
        // https://job-boards.greenhouse.io/...), which made the adapter drive
        // an empty proxy frame and fill 0 fields on new-style Greenhouse boards.
        const host = new URL(frame.url()).hostname;
        if (/(^|\.)greenhouse\.io$/i.test(host) && frame !== page.mainFrame()) {
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

// ---------------------------------------------------------------------------
// Employment History sections (old-style Greenhouse boards, e.g. Lyft embed)
// ---------------------------------------------------------------------------

/**
 * In-page detection of repeating employment blocks. A block starts at a
 * "Company name / employer" field and runs until the next one; date fields are
 * assigned to start/end via their own metadata or the nearest preceding
 * heading ("Start date" / "End date"). Month/year may be selects, paired text
 * inputs, or one combined date input — all three are recorded.
 */
async function detectEmploymentBlocks(target) {
  return await target.evaluate(() => {    const allInputs = Array.from(document.querySelectorAll("input, textarea, select"));

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

    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
        && !el.hasAttribute("disabled") && !el.hasAttribute("readonly");
    }

    function ownContext(el) {
      return [
        findLabelText(el),
        el.getAttribute("aria-label") || "",
        el.getAttribute("placeholder") || "",
        el.getAttribute("name") || "",
        el.getAttribute("id") || "",
      ].join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    }

    const isCompanyField = (el) => {
      const ctx = ownContext(el);
      return /(company|employer)/.test(ctx) && !/(contact|employed by|previously|authorized)/.test(ctx);
    };

    // "start" | "end" | null for a date-ish field, based on its own metadata
    // first, then the closest preceding heading/sibling text.
    function dateContext(el, stopInside) {
      const own = ownContext(el);
      if (/(start|from)/.test(own) && !/end/.test(own)) return "start";
      if (/(end|through|\bto\b)/.test(own) && !/start/.test(own)) return "end";
      let node = el;
      while (node && node !== document.body) {
        let sib = node.previousElementSibling;
        while (sib) {
          if (stopInside && (sib === stopInside || sib.contains(stopInside))) return null;
          const text = (sib.innerText || sib.textContent || "").replace(/\s+/g, " ").trim();
          if (text && text.length <= 80) {
            if (/(start|from)/i.test(text)) return "start";
            if (/(end|through|^to$)/i.test(text)) return "end";
          }
          sib = sib.previousElementSibling;
        }
        node = node.parentElement;
      }
      return null;
    }

    function describeField(el) {
      const index = allInputs.indexOf(el);
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || (tag === "select" ? "select" : tag === "textarea" ? "textarea" : "text")).toLowerCase();
      return {
        index,
        id: el.getAttribute("id") || "",
        tag,
        type,
        role: el.getAttribute("role") || "",
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        context: ownContext(el),
        value: el.value || "",
        checked: el.checked === true,
        options: tag === "select"
          ? Array.from(el.options).map((o) => ({ value: o.value, text: (o.textContent || "").trim() }))
          : null,
        dateContext: null,
      };
    }

    const anchors = allInputs.filter((el) => visible(el) && isCompanyField(el));
    // Blocks are DOM-order slices: from each company anchor to the next one.
    const ordered = allInputs.filter((el) => visible(el));
    const anchorPositions = anchors.map((anchor) => ordered.indexOf(anchor));
    const blocks = [];
    for (let i = 0; i < anchors.length; i += 1) {
      const slice = ordered.slice(anchorPositions[i], anchorPositions[i + 1] ?? ordered.length);
      const described = slice.map(describeField);
      for (const field of described) {
        field.dateContext = dateContext(allInputs[field.index], anchors[i]);
      }
      blocks.push(described);
    }

    const buttons = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"));
    let addButton = null;
    for (let index = 0; index < buttons.length; index += 1) {
      const el = buttons[index];
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const text = `${el.innerText || el.value || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
      if (/add another|add employment|add work|add more/.test(text)) {
        addButton = { index };
        break;
      }
    }

    return { blocks, addButton };
  });
}

function emptyDatePart() {
  return { monthSelect: null, yearSelect: null, monthText: null, yearText: null, singleText: null, monthCombo: null, yearCombo: null };
}

// Exported for adapter tests / live debugging of block classification.
export { detectEmploymentBlocks as __detectEmploymentBlocks };
export function __planEmploymentBlock(fields) {
  return planEmploymentBlock(fields);
}

/** Turn one detected block (ordered field descriptors) into a fill plan. */
function planEmploymentBlock(fields) {
  const block = {
    company: null, title: null, location: null, currentCheckbox: null,
    start: emptyDatePart(), end: emptyDatePart(), filled: false,
  };
  const monthish = (options) => {
    const texts = (options || []).map((o) => o.text.toLowerCase());
    return texts.some((t) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(t))
      || texts.filter((t) => /^(0?[1-9]|1[0-2])$/.test(t)).length >= 10;
  };
  const yearish = (options) => (options || []).filter((o) => /^(19|20)\d{2}$/.test(o.text.trim())).length >= 3;

  for (const field of fields) {
    const ctx = field.context;
    if (!block.company && /(company|employer)/.test(ctx) && !/(contact|employed by|previously|authorized)/.test(ctx)) {
      block.company = field; continue;
    }
    if (!block.title && /(\btitle\b|position)/.test(ctx)) { block.title = field; continue; }
    if (!block.location && /location/.test(ctx)) { block.location = field; continue; }
    if (field.type === "checkbox") {
      if (!block.currentCheckbox && /currently work here|i currently|current role|current position|present employer/.test(ctx)) block.currentCheckbox = field;
      continue;
    }
    const part = field.dateContext === "start" ? block.start : field.dateContext === "end" ? block.end : null;
    if (!part) continue;
    if (field.role === "combobox") {
      // react-select month/year dropdowns (new-style boards): committed via
      // chooseVisibleOption, not by typing.
      if (/month/.test(ctx)) { if (!part.monthCombo) part.monthCombo = field; }
      else if (/year/.test(ctx)) { if (!part.yearCombo) part.yearCombo = field; }
      continue;
    }
    if (field.type === "select") {
      if (/month/.test(ctx) || monthish(field.options)) { if (!part.monthSelect) part.monthSelect = field; }
      else if (/year/.test(ctx) || yearish(field.options)) { if (!part.yearSelect) part.yearSelect = field; }
    } else if (field.tag === "input" && ["text", "", "tel", "number", "date", "month"].includes(field.type)) {
      if (/month/.test(ctx)) { if (!part.monthText) part.monthText = field; }
      else if (/year/.test(ctx)) { if (!part.yearText) part.yearText = field; }
      // A combined single date input must carry an explicit date/month/year
      // word in its own context (a bare "Start date" label qualifies).
      // Word boundaries matter: "gender" contains "end", "to the best of my
      // knowledge" contains "to". Unlabeled companion inputs and unrelated
      // questions swept into the block slice must never receive a date value.
      else if (!part.singleText && /\b(date|month|year)\b/.test(ctx)) part.singleText = field;
    }
  }
  block.filled = Boolean(block.company && String(block.company.value || "").trim());
  return block;
}

function pickMonthOptionValue(options, parsed) {
  if (!parsed?.month) return null;
  const nameRx = new RegExp(`^${parsed.monthName.slice(0, 3)}`, "i");
  for (const option of options || []) {
    if (nameRx.test(option.text.trim()) || nameRx.test(option.value.trim())) return option.value;
  }
  for (const option of options || []) {
    const text = option.text.trim();
    const value = option.value.trim();
    if ([String(parsed.month), parsed.paddedMonth].includes(text) || [String(parsed.month), parsed.paddedMonth].includes(value)) {
      return option.value;
    }
  }
  return null;
}

function pickYearOptionValue(options, year) {
  if (!year) return null;
  for (const option of options || []) {
    if (option.text.trim() === year || option.value.trim() === year) return option.value;
  }
  for (const option of options || []) {
    if (option.text.includes(year) || option.value.includes(year)) return option.value;
  }
  return null;
}

/**
 * Resolve a field descriptor to its CURRENT index. Live boards inject inputs
 * (address-search boxes, react-select mirrors) as they initialize, so indexes
 * captured at detection time drift; ids are stable and win when present.
 */
async function resolveFieldIndex(target, field) {
  if (field?.id) {
    const byId = await target.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return -1;
      return Array.from(document.querySelectorAll("input, textarea, select")).indexOf(el);
    }, field.id).catch(() => -1);
    if (byId >= 0) return byId;
  }
  return field?.index;
}

/** Locator for a descriptor: id-scoped when possible, nth(index) fallback. */
function locatorForField(target, field) {
  if (field?.id) return target.locator(`[id="${String(field.id).replaceAll('"', '\\"')}"]`).first();
  return target.locator("input, textarea, select").nth(field?.index ?? 0);
}

/** setFieldValueByIndex with drift-safe index resolution. */
async function setFieldValue(target, field, value) {
  const index = await resolveFieldIndex(target, field);
  if (index == null || index < 0) return false;
  return await setFieldValueByIndex(target, index, value);
}

/** Type into a field with real key events (mask-safe). */
async function typeIntoField(target, field, value) {
  const handle = await locatorForField(target, field).elementHandle();
  if (!handle) return "";
  await handle.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await handle.click({ timeout: 3000 }).catch(() => {});
  await handle.evaluate((el) => {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }).catch(() => {});
  // ElementHandle.pressSequentially is not available in every driver build;
  // keyboard.type sends the same real key events masked inputs require.
  const keyboard = typeof target.page === "function" ? target.page().keyboard : target.keyboard;
  if (keyboard?.type) await keyboard.type(String(value), { delay: 45 }).catch(() => {});
  return await handle.evaluate((el) => String(el.value || "").trim()).catch(() => "");
}

/**
 * Commit a text value, trying a programmatic set first and falling back to
 * real typing for masked inputs (Greenhouse month fields reject direct sets).
 */
async function commitTextValue(target, field, candidates) {
  for (const candidate of candidates) {
    if (await setFieldValue(target, field, candidate)) {
      const committed = await locatorForField(target, field)
        .evaluate((el) => String(el?.value || "").trim())
        .catch(() => "");
      if (committed) return true;
    }
    if (await typeIntoField(target, field, candidate)) return true;
  }
  return false;
}

/** Fill one start/end date group; handles selects, paired inputs, one input. */
async function fillDatePart(target, part, dateString) {
  const parsed = parseMonthYear(dateString);
  if (!parsed) return 0;
  let filled = 0;
  if (part.monthCombo && parsed.month) {
    // react-select dropdown: options are month names ("January"...). Fall
    // back to the padded number for numeric-styled option lists.
    if (await chooseVisibleOption(target, locatorForField(target, part.monthCombo), parsed.monthName)) filled += 1;
    else if (await chooseVisibleOption(target, locatorForField(target, part.monthCombo), parsed.paddedMonth)) filled += 1;
  }
  if (part.yearCombo) {
    if (await chooseVisibleOption(target, locatorForField(target, part.yearCombo), parsed.year)) filled += 1;
  }
  if (part.monthSelect && parsed.month) {
    const value = pickMonthOptionValue(part.monthSelect.options, parsed);
    if (value !== null && await setFieldValue(target, part.monthSelect, value)) filled += 1;
  }
  if (part.yearSelect) {
    const value = pickYearOptionValue(part.yearSelect.options, parsed.year);
    if (value !== null && await setFieldValue(target, part.yearSelect, value)) filled += 1;
  }
  if (part.monthText && parsed.month) {
    // Masked month inputs usually want digits ("01"); plain text ones a name.
    const numeric = (part.monthText.maxLength || 99) <= 2;
    const candidates = numeric ? [parsed.paddedMonth] : [parsed.paddedMonth, parsed.monthName];
    if (await commitTextValue(target, part.monthText, candidates)) filled += 1;
  }
  if (part.yearText) {
    if (await commitTextValue(target, part.yearText, [parsed.year])) filled += 1;
  }
  if (part.singleText) {
    let value = parsed.year;
    if (part.singleText.type === "month" && parsed.month) value = `${parsed.year}-${parsed.paddedMonth}`;
    else if (part.singleText.type === "date" && parsed.month) value = `${parsed.year}-${parsed.paddedMonth}-01`;
    else if (parsed.month) value = `${parsed.paddedMonth}/${parsed.year}`;
    if (await commitTextValue(target, part.singleText, [value])) filled += 1;
  }
  return filled;
}

async function fillEmploymentBlock(target, plan, entry) {
  let filled = 0;
  const fill = async (field, value) => {
    if (!field || !String(value || "").trim()) return;
    if (String(field.value || "").trim()) return; // never overwrite existing data
    if (await setFieldValue(target, field, value)) filled += 1;
  };
  await fill(plan.company, entry.company);
  await fill(plan.title, entry.title);
  await fill(plan.location, entry.location);
  filled += await fillDatePart(target, plan.start, entry.startDate);
  if (entry.current && plan.currentCheckbox) {
    if (!plan.currentCheckbox.checked && await setFieldValue(target, plan.currentCheckbox, "true")) filled += 1;
  } else if (!entry.current) {
    filled += await fillDatePart(target, plan.end, entry.endDate);
  }
  return filled;
}

/**
 * Fill an old-style Greenhouse EMPLOYMENT HISTORY section from resume-derived
 * entries ({ company, title, startDate, endDate, location, current }).
 *
 * Blocks that already carry values (e.g. Company name filled through the
 * standard current-company answer) are skipped, never overwritten. Missing
 * blocks are created via the board's "+ Add Another Employment" button,
 * capped at entries.length. Only resume/profile data is entered — anything
 * unknown stays blank and surfaces in reviewState().requiredMissing.
 *
 * @param {Object} target Playwright Page or Frame containing the form.
 * @param {Array} experience Resume-derived employment entries (first 4).
 * @returns {{ detected: boolean, blocksDetected: number, blocksFilled: number, fieldsFilled: number, addedBlocks: number }}
 */
export async function fillEmploymentHistory(target, experience) {
  const result = { detected: false, blocksDetected: 0, blocksFilled: 0, fieldsFilled: 0, addedBlocks: 0 };
  const entries = mapResumeExperience(
    (Array.isArray(experience) ? experience : []).map((entry) => ({
      company_or_client: entry?.company || entry?.company_or_client,
      role: entry?.title || entry?.role,
      start_date: entry?.startDate || entry?.start_date,
      end_date: entry?.current === true ? "Present" : entry?.endDate || entry?.end_date,
      location: entry?.location,
    })),
    4,
  );
  if (entries.length === 0) return result;

  let snapshot = await detectEmploymentBlocks(target).catch(() => null);
  if (!snapshot || snapshot.blocks.length === 0) return result;
  result.detected = true;

  // Phase 1: create every needed block up front. Clicking
  // "+ Add Another Employment" re-renders the React board, so all structural
  // changes must happen BEFORE any value is committed, or the re-render
  // wipes fields the board's state never registered.
  while (snapshot.blocks.length < entries.length && snapshot.addButton) {
    let grew = false;
    for (let clickAttempt = 0; clickAttempt < 3 && !grew; clickAttempt += 1) {
      const previousCount = snapshot.blocks.length;
      // In-page click: robust for React-rendered buttons/links and immune to
      // locator index drift when the board re-renders between detection and
      // click. Retry with fresh detection — a click landing mid-re-render
      // can be swallowed by the board.
      const clicked = await target.evaluate((buttonIndex) => {
        const buttons = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"));
        const el = buttons[buttonIndex];
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      }, snapshot.addButton.index).catch(() => false);
      if (!clicked) break;
      for (let wait = 0; wait < 6; wait += 1) {
        await target.waitForTimeout(500);
        snapshot = await detectEmploymentBlocks(target).catch(() => snapshot);
        if (snapshot.blocks.length > previousCount) { grew = true; break; }
      }
    }
    if (!grew) break;
    result.addedBlocks += 1;
  }

  // Phase 2: fill blocks top-down; skip any that already carry values.
  for (let i = 0; i < Math.min(entries.length, snapshot.blocks.length); i += 1) {
    const plan = planEmploymentBlock(snapshot.blocks[i]);
    if (plan.filled) continue; // standard answers already committed this block
    const fieldsFilled = await fillEmploymentBlock(target, plan, entries[i]);
    result.fieldsFilled += fieldsFilled;
    if (fieldsFilled > 0) result.blocksFilled += 1;
  }
  result.blocksDetected = snapshot.blocks.length;
  return result;
}


function standardValueFor(field, profile) {
  const key = normalizeText(`${field.name} ${field.id}`);
  const nameParts = String(profile.fullName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  if (/first[_ ]?name/.test(key)) return firstName;
  // Mononym profiles: reuse the single name; Greenhouse rejects empty last names.
  if (/last[_ ]?name/.test(key)) return lastName || firstName;
  if (/\bemail\b/.test(key) && field.type !== "checkbox") return profile.email || "";
  if (/\bphone\b/.test(key)) return profile.phone || "";
  if (/location|candidate[_ ]?location/.test(key)) return profile.location || "";
  if (/linkedin/.test(key + " " + normalizeText(field.label))) return profile.linkedinUrl || "";
  if (/website|portfolio|github/.test(key + " " + normalizeText(field.label))) return profile.portfolioUrl || "";
  return "";
}

export const greenhouseAdapter = defineAdapter({
  metadata: { name: "greenhouse", version: "1.1.0" },

  async detect(url, page) {
    if (isGreenhouseUrl(url)) return true;
    if (page) {
      if (await pageLooksLikeGreenhouse(page)) return true;
      // JS shells (e.g. app.careerpuck.com custom Greenhouse domains) inject
      // the job-boards.greenhouse.io embed iframe several seconds after load.
      // Poll briefly before yielding to the generic adapter.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await page.waitForTimeout(1000);
        if (await pageLooksLikeGreenhouse(page)) return true;
      }
    }
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

    // Re-check blockers after navigation/expansion (an interactive CAPTCHA
    // challenge may render late; the invisible badge never blocks).
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

    // Old-style EMPLOYMENT HISTORY sections (e.g. Lyft): fill repeating
    // company/title/date blocks from the tailored resume's experience array.
    // This runs BEFORE fillCustomFields and the standard field loop, not
    // after: clicking "+ Add Another Employment" re-renders the React board
    // and would wipe values committed earlier. Blocks that already carry
    // values (browser autofill, prior passes) are still skipped, never
    // overwritten. Field descriptors are collected afterwards so indexes
    // match the final DOM.
    const employment = await fillEmploymentHistory(target, profile.experience);

    const custom = await fillCustomFields(target, profile, answers, ctx.approved === true);

    const fields = await collectFieldDescriptors(target);

    let filledCount = Number(custom?.filledCount || 0) + Number(employment.fieldsFilled || 0);

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
      employment,
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
          const form = element.form || element.closest("form");
          return {
            index,
            label: label || "submit",
            formAction: element.formAction || form?.action || null,
            formMethod: (element.formMethod || form?.method || "post").toUpperCase(),
          };
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
      const confirmationRect = confirmationNode?.getBoundingClientRect();
      return {
        hasConfirmationContainer: Boolean(
          confirmationNode
          && confirmationRect
          && confirmationRect.width > 0
          && confirmationRect.height > 0
        ),
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
    const confirmed = state.hasConfirmationContainer || Boolean(state.applicationId);
    return {
      confirmed,
      evidence: {
        url: page.url(),
        urlChanged: page.url() !== (ctx.previousUrl || ""),
        signal: state.hasConfirmationContainer ? "greenhouse-confirmation-container" : null,
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

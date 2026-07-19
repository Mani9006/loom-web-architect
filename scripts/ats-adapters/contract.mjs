// Adapter contract for per-ATS application automation.
//
// Each adapter is a plain object created with `defineAdapter()`. Adapters get
// a Playwright `page` plus a context object; they never talk to the queue API
// directly — the worker injects capabilities (verification-code retrieval,
// heartbeats) through the context so all authorization checks stay in one
// place.
//
// SAFETY INVARIANTS every adapter must uphold:
// - `submit()` clicks the final submit ONLY when `ctx.autoSubmit === true`
//   (APPLYPASS_AUTO_SUBMIT env gate) AND `ctx.approved === true` (per-job
//   approval receipt). The worker additionally re-checks continuous-apply
//   authorization immediately before calling `submit()`; adapters must not
//   submit outside that call.
// - Never bypass CAPTCHAs, login walls, or anti-bot measures. Surface them as
//   blockers from `prepare()` so the worker records `needs_attention`.
// - Never auto-accept consent checkboxes unless the user's answer memory
//   contains an explicit affirmative for that question.
// - Leave unmatched REQUIRED questions blank and report them via
//   `reviewState().requiredMissing` instead of guessing answers.

/**
 * @typedef {Object} AdapterDocuments
 * @property {string|null} resumePath      Local path of the tailored resume, if downloaded.
 * @property {string|null} coverLetterPath Local path of the cover letter, if any.
 */

/**
 * @typedef {Object} AdapterContext
 * @property {Object} profile   Candidate profile (fullName, email, phone, linkedinUrl, portfolioUrl, location, ...).
 * @property {Record<string, string>} answers Stored question -> answer memory for custom questions and consents.
 * @property {AdapterDocuments} documents
 * @property {boolean} autoSubmit  Mirrors APPLYPASS_AUTO_SUBMIT (default false).
 * @property {boolean} approved    True only when a valid per-job approval receipt exists.
 * @property {string} taskId
 * @property {string} jobId
 * @property {string} workerId
 * @property {() => Promise<string|null>} requestVerificationCode  One-shot fetch of an emailed code from the queue API.
 * @property {(log: Object) => Promise<unknown>} heartbeat         Stream a progress log entry to the queue.
 * @property {{ index: number, label: string }|null} [submitButton] Pre-detected submit button (set by the worker before submit()).
 * @property {string} [previousUrl] URL captured just before the submit click (set by the worker before verifyReceipt()).
 */

/**
 * @typedef {Object} AdapterPrepareResult
 * @property {boolean} ok
 * @property {{ kind: string, message: string }|null} [blocked] Hard blocker (captcha/login wall) -> needs_attention.
 * @property {string} [note]
 */

/**
 * @typedef {Object} AdapterFillResult
 * @property {number} filledCount
 * @property {number} totalFields
 * @property {{ fileInputs: number, resumeInputs: number, uploaded: number, requiredMissing: boolean }} upload
 * @property {{ requested: boolean, completed: boolean }} verification Email verification-code step state.
 */

/**
 * @typedef {Object} AdapterReviewState
 * @property {string[]} requiredMissing Labels of required fields still unfilled.
 * @property {string} summary Human-readable review summary.
 * @property {"needs_review"|"needs_attention"} [recommendation] Escalation hint when blocked (default needs_review).
 */

/**
 * @typedef {Object} AdapterSubmitResult
 * @property {boolean} clicked
 * @property {string|null} [label]
 * @property {string} [reason] Why the click was refused.
 */

/**
 * @typedef {Object} AdapterReceipt
 * @property {boolean} confirmed
 * @property {Object} evidence ATS-specific confirmation signals (matched text, confirmation URL, application id, invalid-field count...).
 */

/**
 * @typedef {Object} AtsAdapter
 * @property {{ name: string, version: string }} metadata
 * @property {(url: string, page: import("@playwright/test").Page|null) => Promise<boolean>|boolean} detect
 * @property {(page: Object, ctx: AdapterContext) => Promise<AdapterPrepareResult>} prepare
 * @property {(page: Object, ctx: AdapterContext) => Promise<AdapterFillResult>} fillFields
 * @property {(page: Object) => Promise<AdapterReviewState>} reviewState
 * @property {(page: Object) => Promise<{ index: number, label: string }|null>} findSubmitButton
 * @property {(page: Object, ctx: AdapterContext) => Promise<AdapterSubmitResult>} submit
 * @property {(page: Object, ctx: AdapterContext) => Promise<AdapterReceipt>} verifyReceipt
 * @property {(page: Object, ctx: AdapterContext) => Promise<{ requested: boolean, completed: boolean, reason?: string }>} handleVerification Re-run the emailed verification-code loop post-submit (Greenhouse 428 handoff step).
 */

const REQUIRED_METHODS = [
  "detect",
  "prepare",
  "fillFields",
  "reviewState",
  "findSubmitButton",
  "submit",
  "verifyReceipt",
  "handleVerification",
];

/**
 * Validate and freeze an adapter definition.
 * @param {AtsAdapter} spec
 * @returns {AtsAdapter}
 */
export function defineAdapter(spec) {
  if (!spec || typeof spec !== "object") {
    throw new TypeError("Adapter spec must be an object");
  }
  const name = spec?.metadata?.name;
  const version = spec?.metadata?.version;
  if (typeof name !== "string" || !name || typeof version !== "string" || !version) {
    throw new TypeError("Adapter metadata requires string name and version");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof spec[method] !== "function") {
      throw new TypeError(`Adapter "${name}" is missing required method ${method}()`);
    }
  }
  return Object.freeze({ ...spec, metadata: Object.freeze({ name, version }) });
}

/**
 * Shared guard used by every adapter's submit(): refuse to click unless the
 * env gate AND the per-job approval are both present. Returns a refusal
 * result or null when submission may proceed.
 */
export function submitRefusal(ctx) {
  if (!ctx || ctx.autoSubmit !== true) {
    return { clicked: false, label: null, reason: "auto-submit disabled (APPLYPASS_AUTO_SUBMIT gate)" };
  }
  if (ctx.approved !== true) {
    return { clicked: false, label: null, reason: "no per-job approval receipt" };
  }
  return null;
}

// Pure helpers shared by the ATS adapters.
//
// Everything in this module is intentionally free of Playwright and DOM
// dependencies so it can be unit-tested with `node --test` (see
// adapters.test.mjs). Browser-touching routines live in the adapter modules.

export function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((token) => token.length > 2);
}

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "are", "this", "that", "with",
  "have", "has", "how", "what", "please", "would", "will", "can", "any",
  "our", "out", "from", "about", "into", "been", "were", "was", "did",
]);

function meaningfulTokens(value) {
  return tokenize(value).filter((token) => !STOPWORDS.has(token));
}

/**
 * Fuzzy-match a form question label against the user's stored answers.
 *
 * Policy (shared by every adapter): an answer is only used when the match is
 * strong — an exact/containment match of the normalized question text, or a
 * token overlap of at least two meaningful tokens covering at least half of
 * the shorter token set. Anything weaker returns null so the field is left
 * blank and, if required, surfaces in `reviewState().requiredMissing`.
 *
 * @param {string} label - question/label text from the form
 * @param {Record<string, string>} answers - stored question -> answer map
 * @returns {{ key: string, answer: string, score: number } | null}
 */
export function fuzzyMatchAnswer(label, answers = {}) {
  const labelNorm = normalizeText(label);
  const labelTokens = meaningfulTokens(label);
  if (!labelNorm || labelTokens.length === 0) return null;
  const labelSet = new Set(labelTokens);

  let best = null;
  for (const [question, rawAnswer] of Object.entries(answers || {})) {
    const answer = String(rawAnswer ?? "").trim();
    if (!answer) continue;
    const questionNorm = normalizeText(question);
    if (!questionNorm) continue;

    if (questionNorm === labelNorm || labelNorm.includes(questionNorm) || questionNorm.includes(labelNorm)) {
      return { key: question, answer, score: Number.MAX_SAFE_INTEGER };
    }

    const questionTokens = meaningfulTokens(question);
    if (questionTokens.length === 0) continue;
    let overlap = 0;
    for (const token of questionTokens) {
      if (labelSet.has(token)) overlap += 1;
    }
    const coverage = overlap / Math.min(questionTokens.length, labelTokens.length);
    if (overlap >= 2 && coverage >= 0.5 && (!best || overlap > best.score)) {
      best = { key: question, answer, score: overlap };
    }
  }
  return best;
}

const AFFIRMATIVES = new Set([
  "yes", "y", "true", "1", "agree", "agreed", "i agree", "accept",
  "accepted", "i accept", "i consent", "consent", "ok", "confirm",
  "confirmed", "checked",
]);

/**
 * Whether a stored answer counts as an explicit affirmative. Used for consent
 * checkboxes: adapters NEVER auto-accept a consent unless the user's answer
 * memory contains an explicit affirmative for that specific question.
 */
export function isAffirmativeAnswer(value) {
  return AFFIRMATIVES.has(normalizeText(value));
}

/** "Decline to answer" phrasings vary by employer form; treat them as one. */
const DECLINE_ANSWER_VARIANTS = new Set([
  "decline to self identify",
  "decline to self-identify",
  "i do not want to answer",
  "i don't want to answer",
  "do not wish to answer",
  "i do not wish to answer",
  "i don't wish to answer",
  "prefer not to say",
  "i prefer not to say",
  "decline to state",
  "choose not to answer",
  "not wish to disclose",
  "prefer not to disclose",
]);

export function isDeclineAnswer(value) {
  return DECLINE_ANSWER_VARIANTS.has(normalizeText(value));
}

/** Heuristic: does a checkbox label look like a consent/legal agreement? */
export function looksLikeConsentLabel(label) {
  return /(consent|i agree|agree to|acknowledg|privacy (policy|notice)|terms (of|and)|gdpr|data (processing|protection)|opt[ -]?in|authoriz\w* .*(contact|process))/i.test(String(label || ""));
}

/**
 * URL-only ATS classification. Returns "greenhouse", "lever", or null.
 * Kept pure so detect() logic is unit-testable without a browser.
 */
export function detectAtsFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "greenhouse.io" || host.endsWith(".greenhouse.io")) return "greenhouse";
  if (host === "lever.co" || host.endsWith(".lever.co")) return "lever";
  return null;
}

/**
 * Given serialized field descriptors, return the labels of required fields
 * that are still unfilled. A descriptor is:
 *   { label, name, type, required, value, checked, filesCount, visible }
 * Hidden/disabled fields are skipped — the applicant cannot interact with
 * them, so they are the site's responsibility, not ours.
 */
export function requiredMissingFromFields(fields = []) {
  const missing = [];
  for (const field of fields) {
    if (!field || !field.required) continue;
    if (field.visible === false) continue;
    const type = String(field.type || "").toLowerCase();
    let filled;
    if (type === "checkbox" || type === "radio") {
      filled = field.checked === true;
    } else if (type === "file") {
      filled = Number(field.filesCount || 0) > 0;
    } else {
      filled = String(field.value || "").trim().length > 0;
    }
    if (!filled) {
      missing.push(String(field.label || field.name || field.id || "Unlabeled required field").trim() || "Unlabeled required field");
    }
  }
  return missing;
}

/**
 * Whether a serialized CAPTCHA-ish element descriptor (produced in-page by
 * detectBlockers) is a VISIBLE interactive challenge the worker must stop
 * for. Only rendered, user-facing challenge iframes count:
 *   - reCAPTCHA v2 checkbox ("anchor") / puzzle ("bframe") iframes
 *   - hCaptcha and Cloudflare Turnstile challenge iframes
 *
 * Invisible / score-based integrations are NOT challenges and must not block:
 *   - the .grecaptcha-badge (reCAPTCHA v3 / Enterprise invisible badge, which
 *     appears on most Greenhouse forms)
 *   - .g-recaptcha[data-size="invisible"] containers
 *   - bare [data-sitekey] containers with no rendered widget iframe
 *   - hidden nodes (zero bounding box, display:none, aria-hidden)
 * Widget containers themselves only become interactive once their challenge
 * iframe renders, so non-iframe elements never count on their own.
 */
export function isVisibleInteractiveChallenge(element) {
  if (!element || element.visible !== true) return false;
  if (element.inBadge === true) return false;
  if (String(element.size || "").toLowerCase() === "invisible") return false;
  if (element.tag !== "iframe") return false;
  const src = String(element.src || "");
  return /recaptcha[^"'\s]*(?:anchor|bframe)|hcaptcha|turnstile|challenges\.cloudflare/i.test(src);
}

/**
 * Classify page snapshot into hard blockers the worker must not work around.
 * We NEVER solve or bypass interactive CAPTCHAs or authenticate through login
 * walls — detection here routes the job to `needs_attention` for a human.
 *
 * CAPTCHA classification is deliberately precise: only a VISIBLE interactive
 * challenge (see isVisibleInteractiveChallenge) or human-verification
 * interstitial text (including Cloudflare "checking your browser" pages)
 * blocks the run. Invisible / score-based reCAPTCHA integrations do NOT
 * block — prepare() proceeds and, if the ATS still rejects the submission,
 * the receipt check reports that honestly.
 *
 * @param {{ captchaElements?: Array, hasCaptcha?: boolean, hasPassword?: boolean, text?: string }} snapshot
 * @returns {Array<{ kind: string, message: string }>}
 */
export function classifyBlockers(snapshot = {}) {
  const blockers = [];
  const text = normalizeText(snapshot.text || "");
  const elements = Array.isArray(snapshot.captchaElements) ? snapshot.captchaElements : [];
  const visibleChallenge = elements.some(isVisibleInteractiveChallenge);
  // `hasCaptcha` is the legacy coarse presence signal; still honored
  // conservatively (fail closed) for any caller that has not migrated to
  // captchaElements descriptors.
  if (snapshot.hasCaptcha === true || visibleChallenge
    || /(verify (that )?you are (a )?human|are you a robot|complete the captcha|unusual traffic|checking your browser|security verification|malicious bots|attention required! |cloudflare ray id)/i.test(text)) {
    blockers.push({
      kind: "captcha",
      message: "CAPTCHA or human-verification challenge detected. The worker never bypasses these; a human must complete this application.",
    });
  }
  if (snapshot.hasPassword) {
    blockers.push({
      kind: "login_wall",
      message: "A login/password wall was detected. The worker does not authenticate into third-party accounts; a human must complete this application.",
    });
  }
  return blockers;
}

/**
 * Looser token-overlap matcher used by the generic autofill path (kept
 * behavior-identical to the worker's original matchingMemoryAnswer). The
 * ATS-specific adapters use the stricter fuzzyMatchAnswer above.
 */
export function matchingMemoryAnswer(answerMemory, label) {
  const labelTokens = normalizeText(label).split(" ").filter((token) => token.length > 3);
  let bestAnswer = "";
  let bestScore = 0;
  for (const [question, answer] of Object.entries(answerMemory || {})) {
    const response = String(answer || "").trim();
    if (!response) continue;
    const questionText = normalizeText(question);
    const score = labelTokens.reduce((total, token) => total + (questionText.includes(token) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = response;
    }
  }
  return bestScore >= 2 ? bestAnswer : "";
}

/** Infer "United States" from a US city/state location string; "" otherwise. */
export function inferCountry(location) {
  const value = normalizeText(location);
  if (!value) return "";
  if (/\b(united states|u\.?s\.?a?|usa)\b/i.test(value)) return "United States";
  const stateNames = /(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)/i;
  const stateCodes = /(?:,|\s)\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)(?:\s|,|$)/i;
  return stateNames.test(value) || stateCodes.test(value) ? "United States" : "";
}

/**
 * Derive Yes/No work-authorization and sponsorship answers from the profile
 * plus authorization-related answer memory. Returns "" when unknown so the
 * field is left blank instead of guessed.
 */
export function inferAuthorizationAnswers(profile, answerMemory) {
  const relevantMemory = Object.entries(answerMemory || {})
    .filter(([question]) => /(authoriz|sponsor|visa|work permit)/i.test(question))
    .map(([, answer]) => String(answer || ""));
  const text = normalizeText([profile?.workAuthorization, ...relevantMemory].filter(Boolean).join(". "));
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

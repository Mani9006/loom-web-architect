const PROVIDER_DOMAINS = Object.freeze({
  greenhouse: "greenhouse.io",
  lever: "lever.co",
  ashby: "ashbyhq.com",
  workable: "workable.com",
});

const PROVIDER_SUBMISSION_PATHS = Object.freeze({
  greenhouse: [
    /\/applications?\/?$/i,
    /\/jobs\/[^/]+\/applications?\/?$/i,
    /\/embed\/job_app\/?$/i,
  ],
  lever: [
    /\/postings\/[^/]+\/apply\/?$/i,
    /\/applications?\/?$/i,
  ],
  ashby: [
    /\/application(?:form)?(?:\.submit|\/submit)?\/?$/i,
    /\/applications?\/?$/i,
  ],
  workable: [
    /\/jobs\/[^/]+\/(?:applications?|candidates?)\/?$/i,
    /\/(?:applications?|candidates?)\/?$/i,
  ],
});

const PROVIDER_RECEIPT_SIGNALS = Object.freeze({
  greenhouse: new Set(["greenhouse-confirmation-container"]),
  lever: new Set(["lever-thanks-url", "lever-confirmation-container"]),
  ashby: new Set(["ashby-submitted-url", "ashby-confirmation-container"]),
  workable: new Set(["workable-confirmation-container"]),
});

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const SUBMISSION_RESOURCE_TYPES = new Set(["document", "fetch", "xhr"]);

function hostnameMatchesDomain(hostname, domain) {
  const host = String(hostname || "").toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeApplicationId(value) {
  const id = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(id) ? id : null;
}

function findJsonApplicationId(value, depth = 0) {
  if (!value || depth > 4) return null;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) {
      const found = findJsonApplicationId(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  for (const [key, entry] of Object.entries(value)) {
    if (/^(application|submission)[_-]?(id|reference)$/i.test(key)) {
      const found = normalizeApplicationId(entry);
      if (found) return found;
    }
  }
  for (const entry of Object.values(value)) {
    const found = findJsonApplicationId(entry, depth + 1);
    if (found) return found;
  }
  return null;
}

function jsonHasExplicitSubmissionSuccess(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return false;
  if (Array.isArray(value)) {
    return value.slice(0, 20).some((entry) => jsonHasExplicitSubmissionSuccess(entry, depth + 1));
  }

  const record = value;
  if (record.submitted === true || record.applicationSubmitted === true) return true;
  const status = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
  if (["application_submitted", "submitted", "received"].includes(status)) return true;
  return Object.values(record).some((entry) => jsonHasExplicitSubmissionSuccess(entry, depth + 1));
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/**
 * Match only the write caused by the final submit control. An exact HTML form
 * action wins; JavaScript forms fall back to provider-specific submission
 * endpoint shapes. Provider-domain analytics, telemetry, and autosave writes
 * are deliberately excluded.
 */
export function isSubmissionRequestCandidate(request, context) {
  const method = String(request?.method || "").toUpperCase();
  if (!WRITE_METHODS.has(method)) return false;

  const resourceType = String(request?.resourceType || "").toLowerCase();
  if (resourceType && !SUBMISSION_RESOURCE_TYPES.has(resourceType)) return false;

  const requestUrl = normalizeComparableUrl(request?.url);
  if (!requestUrl) return false;

  const provider = String(context?.provider || "").toLowerCase();
  const trustedOrigin = String(context?.trustedOrigin || "");
  if (trustedOrigin) {
    const trustedUrl = normalizeComparableUrl(trustedOrigin);
    if (!trustedUrl || requestUrl.origin !== trustedUrl.origin) return false;
  } else {
    const domain = PROVIDER_DOMAINS[provider];
    if (!domain || requestUrl.protocol !== "https:" || !hostnameMatchesDomain(requestUrl.hostname, domain)) {
      return false;
    }
  }

  const formMethod = String(context?.formMethod || "").toUpperCase();
  if (WRITE_METHODS.has(formMethod) && method !== formMethod) return false;

  const formAction = normalizeComparableUrl(context?.formAction);
  const formActionQueryMatches = formAction
    ? Array.from(formAction.searchParams.entries())
      .every(([key, value]) => requestUrl.searchParams.getAll(key).includes(value))
    : false;
  if (
    formAction
    && formAction.origin === requestUrl.origin
    && formAction.pathname.replace(/\/+$/, "") === requestUrl.pathname.replace(/\/+$/, "")
    && formActionQueryMatches
  ) {
    return true;
  }

  return (PROVIDER_SUBMISSION_PATHS[provider] || [])
    .some((pattern) => pattern.test(requestUrl.pathname));
}

/**
 * A response is transport proof only when the already-correlated submission
 * request returns a structured success or a concrete application reference.
 * Generic prose such as "thank you" is never transport proof.
 */
export async function inspectSubmissionResponse(response) {
  if (!response) {
    return { status: null, path: null, confirmed: false, signal: null, applicationId: null };
  }

  const status = Number(response.status());
  let pathName = null;
  try {
    pathName = new URL(response.url()).pathname;
  } catch {
    pathName = null;
  }

  const body = await response.text().catch(() => "");
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  const jsonApplicationId = findJsonApplicationId(parsed);
  const textApplicationId = normalizeApplicationId(
    body.match(/(?:application|submission)\s*(?:id|reference|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9._:-]{3,127})/i)?.[1],
  );
  const applicationId = jsonApplicationId || textApplicationId;
  const explicitSuccess = jsonHasExplicitSubmissionSuccess(parsed);
  const responseOk = Number.isInteger(status) && status >= 200 && status < 300;
  const confirmed = responseOk && Boolean(applicationId || explicitSuccess);

  return {
    status,
    path: pathName,
    confirmed,
    signal: confirmed
      ? applicationId
        ? "ats-submission-application-id"
        : "ats-submission-explicit-success"
      : null,
    applicationId,
  };
}

/**
 * DOM evidence must be provider-specific or include a concrete application
 * reference. A page-wide generic thank-you match is intentionally weak.
 */
export function hasStrongReceiptEvidence(provider, evidence) {
  const record = evidence && typeof evidence === "object" ? evidence : {};
  if (normalizeApplicationId(record.applicationId)) return true;
  const signal = typeof record.signal === "string" ? record.signal.trim() : "";
  return PROVIDER_RECEIPT_SIGNALS[String(provider || "").toLowerCase()]?.has(signal) === true;
}

export function developmentScreenshotsEnabled(env = process.env) {
  return String(env.APPLYPASS_RUNTIME_ENV || "").toLowerCase() === "development"
    && String(env.APPLYPASS_DEV_DIAGNOSTIC_SCREENSHOTS || "").toLowerCase() === "true"
    && Boolean(String(env.APPLYPASS_SCREENSHOT_DIR || "").trim());
}

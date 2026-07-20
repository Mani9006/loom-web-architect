/**
 * Converts internal failures into a small, stable customer-facing vocabulary.
 *
 * Never render raw Error.message values in product UI. They may contain a
 * provider name, secret identifier, database object, function route, request
 * payload, or upstream response. Raw detail belongs in the incident stream.
 */

type ErrorOptions = {
  operation: string;
  defaultMessage?: string;
};

export type UserFacingError = {
  title: string;
  message: string;
  reference: string;
};

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return typeof error === "string" ? error : "unknown error";
}

function referenceFor(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `RP-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

export function toUserFacingError(error: unknown, options: ErrorOptions): UserFacingError {
  const internal = errorText(error);
  const normalized = internal.toLocaleLowerCase();
  const reference = referenceFor(`${options.operation}|${internal}`);

  if (/abort|timeout|timed out|took too long/.test(normalized)) {
    return {
      title: "This is taking longer than expected",
      message: "Narrow the request and try again. Your existing work is safe.",
      reference,
    };
  }

  if (/network|failed to fetch|offline|load failed/.test(normalized)) {
    return {
      title: "Connection interrupted",
      message: "Check your connection and try again. Your existing work is safe.",
      reference,
    };
  }

  if (/401|unauthorized|not authenticated|session/.test(normalized)) {
    return {
      title: "Please sign in again",
      message: "Your session is no longer active. Sign in again to continue.",
      reference,
    };
  }

  if (/429|rate limit|usage limit|daily cap|weekly (?:cap|application allowance)|monthly (?:cap|application allowance)|quota/.test(normalized)) {
    return {
      title: "Usage limit reached",
      message: "This action is temporarily paused. Try again later or review your plan limits.",
      reference,
    };
  }

  if (/403|forbidden|access denied|entitlement|subscription/.test(normalized)) {
    return {
      title: "This action is not available",
      message: "Review your plan and workspace permissions, then try again.",
      reference,
    };
  }

  return {
    title: "We could not complete that action",
    message: options.defaultMessage || "Try again in a moment. If it continues, share the reference below with support.",
    reference,
  };
}

export function withSupportReference(error: UserFacingError): string {
  return `${error.message} Reference: ${error.reference}`;
}

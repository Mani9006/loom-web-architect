const PRODUCTION_HOSTS = new Set([
  "resumepreps.com",
  "www.resumepreps.com",
]);

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
]);

function isResumePrepsPreviewHost(hostname: string): boolean {
  return hostname === "loom-web-architect.vercel.app" ||
    (
      hostname.startsWith("loom-web-architect-") &&
      hostname.endsWith("-maanys-projects-8bbfa798.vercel.app")
    );
}

export function isTrustedResumePrepsOrigin(url: URL): boolean {
  if (PRODUCTION_HOSTS.has(url.hostname)) return url.protocol === "https:";
  if (LOCAL_HOSTS.has(url.hostname)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  return url.protocol === "https:" && isResumePrepsPreviewHost(url.hostname);
}

/**
 * Reduce every accepted destination to the fixed application inbox route.
 *
 * OAuth state must not become an open redirect. In particular, accepting every
 * `*.vercel.app` origin would allow an unrelated Vercel project to receive the
 * callback result. Only the ResumePreps project and team preview pattern are
 * trusted.
 */
export function resolveInboxReturnTo(candidate: unknown, fallback: string): string {
  const values = [candidate, fallback, "https://www.resumepreps.com"];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      const parsed = new URL(value);
      if (isTrustedResumePrepsOrigin(parsed)) return `${parsed.origin}/inbox`;
    } catch {
      // Try the next trusted fallback.
    }
  }
  return "https://www.resumepreps.com/inbox";
}

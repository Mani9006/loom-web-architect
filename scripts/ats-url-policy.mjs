const PROVIDER_DOMAINS = Object.freeze({
  greenhouse: "greenhouse.io",
  ashby: "ashbyhq.com",
  lever: "lever.co",
  workable: "workable.com",
});

export function hostnameMatchesDomain(hostname, domain) {
  const host = String(hostname || "").toLowerCase();
  const expected = String(domain || "").toLowerCase();
  return Boolean(host && expected && (host === expected || host.endsWith(`.${expected}`)));
}

function isUnsafeHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host.includes(":")) return true;
  const octets = host.split(".");
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) return false;
  const values = octets.map(Number);
  if (values.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = values;
  return a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

export function classifyWorkerAtsUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return { ok: false, provider: null, normalizedUrl: "", reason: "invalid_url" };
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, provider: null, normalizedUrl: "", reason: "unsafe_url" };
  }
  if (isUnsafeHostname(url.hostname)) {
    return { ok: false, provider: null, normalizedUrl: "", reason: "unsafe_host" };
  }
  const provider = providerForApplyUrl(url);
  if (!provider) {
    return { ok: false, provider: null, normalizedUrl: "", reason: "unsupported_host" };
  }
  url.hash = "";
  return { ok: true, provider, normalizedUrl: url.toString(), reason: null };
}

function providerForApplyUrl(url) {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    (host === "boards.greenhouse.io"
      || host === "job-boards.greenhouse.io"
      || /^(boards|job-boards)\.[a-z]{2}\.greenhouse\.io$/.test(host))
    && parts.length >= 1
  ) return "greenhouse";
  if ((host === "jobs.lever.co" || host === "jobs.eu.lever.co") && parts.length >= 2) return "lever";
  if (host === "jobs.ashbyhq.com" && parts.length >= 1) return "ashby";
  if (host === "apply.workable.com") {
    const marker = parts.indexOf("j");
    return marker >= 0 && parts[marker + 1] ? "workable" : null;
  }
  if (
    host.endsWith(".workable.com")
    && !["www.workable.com", "api.workable.com", "help.workable.com", "support.workable.com"].includes(host)
    && parts[0] === "jobs"
    && parts[1]
  ) return "workable";
  return null;
}

export function validateWorkerProviderUrl(value, expectedProvider) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return { ok: false, provider: null, normalizedUrl: "", reason: "invalid_url" };
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, provider: null, normalizedUrl: "", reason: "unsafe_url" };
  }
  if (isUnsafeHostname(url.hostname)) {
    return { ok: false, provider: null, normalizedUrl: "", reason: "unsafe_host" };
  }
  const provider = Object.entries(PROVIDER_DOMAINS)
    .find(([, domain]) => hostnameMatchesDomain(url.hostname, domain))?.[0] || null;
  if (!provider || (expectedProvider && provider !== expectedProvider)) {
    return { ok: false, provider, normalizedUrl: "", reason: provider ? "provider_mismatch" : "unsupported_host" };
  }
  url.hash = "";
  return { ok: true, provider, normalizedUrl: url.toString(), reason: null };
}

export function validateWorkerAtsUrl(value, expectedProvider = null) {
  const result = classifyWorkerAtsUrl(value);
  if (!result.ok) return result;
  if (expectedProvider && result.provider !== expectedProvider) {
    return { ...result, ok: false, reason: "provider_mismatch" };
  }
  return result;
}

export function isTrustedResumeDownloadUrl(value, supabaseUrl) {
  try {
    const fileUrl = new URL(String(value || ""));
    const projectUrl = new URL(String(supabaseUrl || ""));
    return fileUrl.protocol === "https:"
      && !fileUrl.username
      && !fileUrl.password
      && (!fileUrl.port || fileUrl.port === "443")
      && fileUrl.origin === projectUrl.origin
      && fileUrl.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}

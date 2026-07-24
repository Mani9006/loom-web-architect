export type SupportedAtsPortal = "greenhouse" | "ashby" | "lever" | "workable";

export interface AtsUrlClassification {
  normalizedUrl: string;
  type: SupportedAtsPortal | "manual";
  identifier: string;
  supported: boolean;
}

const PROVIDER_DOMAINS: ReadonlyArray<readonly [SupportedAtsPortal, string]> = [
  ["greenhouse", "greenhouse.io"],
  ["ashby", "ashbyhq.com"],
  ["lever", "lever.co"],
  ["workable", "workable.com"],
];

export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const expected = domain.toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function isUnsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }

  // User-entered IP literals are never valid ATS application destinations.
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

export function normalizePublicHttpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim().slice(0, 2_000);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (url.port && url.port !== "443") return "";
    if (isUnsafeHostname(url.hostname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function providerForApplyUrl(url: URL): SupportedAtsPortal | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (
    (host === "boards.greenhouse.io" ||
      host === "job-boards.greenhouse.io" ||
      /^(boards|job-boards)\.[a-z]{2}\.greenhouse\.io$/.test(host)) &&
    parts.length >= 1
  ) {
    return "greenhouse";
  }
  if ((host === "jobs.lever.co" || host === "jobs.eu.lever.co") && parts.length >= 2) {
    return "lever";
  }
  if (host === "jobs.ashbyhq.com" && parts.length >= 1) {
    return "ashby";
  }
  if (host === "apply.workable.com") {
    const jobMarker = parts.indexOf("j");
    return jobMarker >= 0 && Boolean(parts[jobMarker + 1]) ? "workable" : null;
  }
  if (
    host.endsWith(".workable.com") &&
    !["www.workable.com", "api.workable.com", "help.workable.com", "support.workable.com"].includes(host) &&
    parts[0] === "jobs" &&
    Boolean(parts[1])
  ) {
    return "workable";
  }
  return null;
}

function identifierFor(provider: SupportedAtsPortal, url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  if (provider === "greenhouse") {
    const boardsIndex = parts.findIndex((part) => ["boards", "job-boards"].includes(part));
    return parts[boardsIndex + 1] || parts[0] || "";
  }
  if (provider === "workable") {
    if (url.hostname === "apply.workable.com") {
      return parts[0] === "j" ? parts[1] || "" : parts[0] || "";
    }
    return url.hostname.split(".")[0] || "";
  }
  return parts[0] || "";
}

export function classifyAtsApplyUrl(value: unknown): AtsUrlClassification {
  const normalizedUrl = normalizePublicHttpsUrl(value);
  if (!normalizedUrl) {
    return { normalizedUrl: "", type: "manual", identifier: "", supported: false };
  }

  const url = new URL(normalizedUrl);
  const provider = providerForApplyUrl(url);
  if (!provider) {
    return { normalizedUrl, type: "manual", identifier: "", supported: false };
  }

  const identifier = identifierFor(provider, url);
  return {
    normalizedUrl,
    type: provider,
    identifier,
    supported: Boolean(identifier),
  };
}

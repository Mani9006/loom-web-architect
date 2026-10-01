// Pure helpers for the hosted application mailbox (Resend Inbound).
//
// No Deno globals and no remote imports: vitest imports this module directly
// (src/test/hosted-mailbox.test.ts). Runtime-specific work (env, Supabase,
// fetch to Resend) lives in the edge functions and _shared/resend-mail.ts.

// ── Svix webhook signature verification ─────────────────────────────────────
// Resend signs webhooks with Svix. Signed content is
// `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 keyed with the
// base64-decoded secret that follows the "whsec_" prefix. The svix-signature
// header carries one or more space-separated "v1,<base64>" entries (several
// during secret rotation).

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function constantTimeEqual(left: string, right: string): boolean {
  // Compare over the longer length so the loop time does not reveal where the
  // strings first differ; a length mismatch still fails.
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function svixSign(secret: string, id: string, timestamp: string, rawBody: string): Promise<string> {
  const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
  return bytesToBase64(new Uint8Array(digest));
}

export async function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string | undefined,
  nowMs = Date.now(),
  toleranceSeconds = SVIX_TOLERANCE_SECONDS,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
  if (ageSeconds > toleranceSeconds) return false;

  let expected: string;
  try {
    expected = await svixSign(secret, id, timestamp, rawBody);
  } catch {
    return false; // malformed secret
  }
  const candidates = signature
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const comma = entry.indexOf(",");
      return comma > 0 ? { version: entry.slice(0, comma), value: entry.slice(comma + 1) } : null;
    })
    .filter((entry): entry is { version: string; value: string } => Boolean(entry) && entry!.version === "v1");
  let matched = false;
  // Check every entry (no early exit) to keep timing independent of position.
  for (const candidate of candidates) {
    if (constantTimeEqual(candidate.value, expected)) matched = true;
  }
  return matched;
}

// ── Local-part generation ───────────────────────────────────────────────────

export const RESERVED_LOCAL_PARTS = new Set([
  "admin", "support", "postmaster", "abuse", "noreply", "inbox", "mail", "root",
  "security", "billing", "help", "info", "hello", "jobs", "careers", "hr",
]);

export const LOCAL_PART_MIN = 3;
export const LOCAL_PART_MAX = 24;

/** Slug of the first name: a-z0-9 only, 3–24 chars. Returns null if unusable. */
export function slugifyFirstName(fullName: string | null | undefined): string | null {
  const first = String(fullName || "").trim().split(/\s+/)[0] || "";
  const slug = first
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, LOCAL_PART_MAX);
  return slug.length >= LOCAL_PART_MIN ? slug : null;
}

/** Fallback base when the profile has no usable first name. */
export function fallbackLocalBase(email: string | null | undefined): string {
  const local = String(email || "").split("@")[0] || "";
  const slug = local.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^\d+/, "").slice(0, LOCAL_PART_MAX);
  return slug.length >= LOCAL_PART_MIN ? slug : "applicant";
}

export function isReservedLocalPart(value: string): boolean {
  return RESERVED_LOCAL_PARTS.has(value.toLowerCase());
}

/**
 * Pick the local part: the base itself when free and not reserved, else the
 * base with the smallest numeric suffix (2, 3, …) that is free. `taken` holds
 * existing local parts that start with the base.
 */
export function pickLocalPart(base: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (value) => value.toLowerCase()));
  const root = base.toLowerCase();
  if (!isReservedLocalPart(root) && !used.has(root)) return root;
  for (let suffix = 2; suffix < 100_000; suffix += 1) {
    const candidate = `${root}${suffix}`;
    if (!used.has(candidate) && !isReservedLocalPart(candidate)) return candidate;
  }
  throw new Error("local_part_exhausted");
}

export const LOCAL_PART_PATTERN = /^[a-z0-9]{3,30}$/;

// ── Address parsing and recipient matching ──────────────────────────────────

export interface ParsedAddress {
  name: string;
  address: string;
}

/** Parse `"Jane Doe" <jane@x.com>`, `Jane <jane@x.com>` or `jane@x.com`. */
export function parseAddress(value: string | null | undefined): ParsedAddress {
  const raw = String(value || "").trim();
  const angle = raw.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim();
    return { name, address: angle[2].trim().toLowerCase() };
  }
  const bare = raw.match(/[^\s<>"]+@[^\s<>"]+/);
  return { name: "", address: (bare?.[0] || "").toLowerCase() };
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).toLowerCase() : "";
}

/**
 * If `address` is on the mailbox domain, return its mailbox local part with
 * any +tag removed (name+tag@domain → name). Otherwise null.
 */
export function mailboxLocalPartFor(address: string, mailboxDomain: string): string | null {
  const parsed = parseAddress(address).address;
  const domain = mailboxDomain.trim().toLowerCase();
  if (!parsed || !domain || domainOf(parsed) !== domain) return null;
  const local = parsed.slice(0, parsed.lastIndexOf("@")).split("+")[0];
  return local || null;
}

/** Unique mailbox local parts addressed in to/cc on the mailbox domain. */
export function matchMailboxRecipients(
  recipients: Array<string | null | undefined>,
  mailboxDomain: string,
): string[] {
  const found = new Set<string>();
  for (const recipient of recipients) {
    const local = mailboxLocalPartFor(String(recipient || ""), mailboxDomain);
    if (local) found.add(local);
  }
  return Array.from(found);
}

// ── Forwarding ──────────────────────────────────────────────────────────────

export const FORWARDED_HEADER = "X-ResumePreps-Forwarded";

export function headerValue(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return String(value ?? "");
  }
  return null;
}

/**
 * Loop guards: never forward mail that came from our own mailbox domain, from
 * the forwarding sender's domain, or that already carries our forwarded
 * marker header.
 */
export function shouldSkipForward(args: {
  from: string;
  headers: Record<string, string> | null | undefined;
  mailboxDomain: string;
  forwardFrom: string;
}): string | null {
  const fromDomain = domainOf(parseAddress(args.from).address);
  const mailboxDomain = args.mailboxDomain.trim().toLowerCase();
  const forwardDomain = domainOf(parseAddress(args.forwardFrom).address);
  if (!fromDomain) return "missing_sender";
  if (fromDomain === mailboxDomain) return "sender_on_mailbox_domain";
  if (forwardDomain && fromDomain === forwardDomain) return "sender_on_forward_domain";
  if (headerValue(args.headers, FORWARDED_HEADER) !== null) return "already_forwarded";
  return null;
}

const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** forward_to must be a real address and never on the mailbox domain. */
export function isAllowedForwardTarget(value: string, mailboxDomain: string): boolean {
  const address = value.trim().toLowerCase();
  if (!isValidEmail(address)) return false;
  const domain = domainOf(address);
  const mailbox = mailboxDomain.trim().toLowerCase();
  return domain !== mailbox && !domain.endsWith(`.${mailbox}`);
}

/** Strip characters that could break or inject into an address header. */
export function sanitizeDisplayName(value: string): string {
  return value.replace(/[\r\n"<>\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** `"Recruiter Name via ResumePreps" <inbox@mail.example.com>` */
export function buildForwardFrom(originalFrom: string, forwardFrom: string): string {
  const parsed = parseAddress(originalFrom);
  const label = sanitizeDisplayName(parsed.name || parsed.address || "Someone");
  const forwardAddress = parseAddress(forwardFrom).address || forwardFrom.trim();
  return `"${label} via ResumePreps" <${forwardAddress}>`;
}

export function buildMailboxFrom(fullName: string | null | undefined, address: string): string {
  const name = sanitizeDisplayName(String(fullName || ""));
  return name ? `"${name}" <${address}>` : address;
}

export const FORWARD_ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024;

/** Whether attachments fit the forward budget (sum of declared sizes). */
export function attachmentsFitBudget(sizes: number[], limit = FORWARD_ATTACHMENT_LIMIT_BYTES): boolean {
  return sizes.reduce((total, size) => total + (Number(size) || 0), 0) <= limit;
}

// ── Forwarding verification codes ───────────────────────────────────────────

export const FORWARD_CODE_TTL_MS = 10 * 60_000;
export const FORWARD_CODE_MAX_ATTEMPTS = 5;

export function generateSixDigitCode(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

/** SHA-256 over user id + target + code so a hash cannot be replayed elsewhere. */
export async function hashForwardCode(userId: string, target: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${target.trim().toLowerCase()}:${code.trim()}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ── Outbound replies ────────────────────────────────────────────────────────

export const MAILBOX_SEND_DAILY_LIMIT = 30;

export function replySubject(subject: string | null | undefined): string {
  const value = String(subject || "").trim();
  if (!value) return "Re: your message";
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

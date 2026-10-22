/**
 * US-only product defaults. Location, work authorization, and sponsorship
 * questions assume a United States search unless the user says otherwise.
 */

export const US_COUNTRY = "United States";

export const US_WORK_AUTH_OPTIONS = [
  "US citizen",
  "Permanent resident (Green Card)",
  "F-1",
  "OPT",
  "H-1B",
  "EAD",
  "Need sponsorship",
  "Other",
] as const;

export type UsWorkAuth = (typeof US_WORK_AUTH_OPTIONS)[number];

export function sponsorshipDefault(workAuth: string): "yes" | "no" | "" {
  const value = workAuth.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("need sponsorship") || value === "h-1b" || value === "f-1" || value === "opt") return "yes";
  if (value.includes("citizen") || value.includes("green card") || value.includes("permanent resident")) return "no";
  return "";
}

export function looksLikeUsLocation(value: string | null | undefined): boolean {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return true;
  if (/\b(united states|u\.s\.a?|usa|us\b)/.test(text)) return true;
  if (/\b(remote|nationwide|anywhere)\b/.test(text)) return true;
  // Common US state abbreviations and names.
  if (/\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy|dc)\b/.test(text)) {
    return true;
  }
  return !/\b(india|uk|united kingdom|canada|germany|singapore|uae|australia|remote.?india)\b/.test(text);
}

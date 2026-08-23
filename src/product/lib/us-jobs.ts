/** US-only location gate. Never surface non-US roles in product feeds. */

const US_POSITIVE = [
  /\bunited states\b/i,
  /\bu\.?s\.?a\.?\b/i,
  /\bu\.?s\.?\b/,
  /\bremote[-\s]?us\b/i,
  /\bus[-\s]?remote\b/i,
  /\bunited states only\b/i,
  /\bnationwide\b/i,
  /, (AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV)\b/,
];

const US_NEGATIVE = [
  /\bunited kingdom\b/i,
  /\bcanada\b/i,
  /\bindia\b/i,
  /\bgermany\b/i,
  /\baustralia\b/i,
  /\bireland\b/i,
  /\bnetherlands\b/i,
  /\bsingapore\b/i,
  /\bemea\b/i,
  /\beu only\b/i,
  /\buk only\b/i,
  /\blondon\b/i,
  /\btoronto\b/i,
  /\bbengaluru\b/i,
  /\bbangalore\b/i,
  /\bhyderabad\b/i,
  /\bmunich\b/i,
  /\bberlin\b/i,
];

export function isUsLocation(location: string | null | undefined, country?: string | null): boolean {
  const countryNorm = (country || "").trim().toLowerCase();
  if (countryNorm === "us" || countryNorm === "usa" || countryNorm === "united states") return true;
  if (countryNorm && !["us", "usa", "united states", "united states of america"].includes(countryNorm)) {
    return false;
  }

  const text = (location || "").trim();
  if (!text) return true; // unknown treated as allowed only when country is US or unset
  if (US_NEGATIVE.some((re) => re.test(text)) && !US_POSITIVE.some((re) => re.test(text))) {
    return false;
  }
  if (US_POSITIVE.some((re) => re.test(text))) return true;
  // City, ST patterns already covered. Bare "Remote" is allowed (US-only product).
  if (/^remote\b/i.test(text)) return true;
  return !US_NEGATIVE.some((re) => re.test(text));
}

export function assertUsOnly<T extends { location?: string | null; country?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => isUsLocation(row.location, row.country));
}

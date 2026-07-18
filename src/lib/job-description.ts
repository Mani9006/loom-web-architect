export function cleanJobDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (!value) return "";

  if ((value.startsWith('"') && value.endsWith('"')) || value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      value = typeof parsed === "string"
        ? parsed
        : String(parsed?.description ?? parsed?.content ?? parsed?.text ?? value);
    } catch {
      // Keep the original and continue with safe text normalization.
    }
  }

  return value
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 40_000);
}

export function safeMatchText(raw: unknown): string {
  return cleanJobDescription(raw)
    .replace(/blocked by a hard preference:?/gi, "Needs a preference review:")
    .replace(/\bblocked\b/gi, "held for review");
}

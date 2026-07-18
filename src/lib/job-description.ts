const SECTION_HEADING = /\b(About the role|The role|Responsibilities|What you(?:'|’)ll do|What we(?:'|’)re looking for|Minimum qualifications|Required qualifications|Preferred qualifications|Qualifications|Requirements|Skills|Experience|Benefits|Compensation)\s*:?[ \t]*(?=[•▪◦])/gi;

function dedupeRepeatedSentences(value: string): string {
  const seen = new Set<string>();
  return value
    .split("\n")
    .map((line) => {
      const bullet = line.match(/^([•▪◦]\s*)/);
      const body = bullet ? line.slice(bullet[0].length) : line;
      const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/);
      const unique = sentences.filter((sentence) => {
        const key = sentence.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (key.length < 32) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return `${bullet?.[1] ?? ""}${unique.join(" ")}`.trim();
    })
    .filter(Boolean)
    .join("\n");
}

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

  const clean = value
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
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(SECTION_HEADING, "\n\n$1\n")
    .replace(/\s*[•▪◦]\s*/g, "\n• ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return dedupeRepeatedSentences(clean).slice(0, 40_000);
}

export function jobDescriptionPreview(raw: unknown, maxLength = 260): string {
  const flattened = cleanJobDescription(raw)
    .replace(/^(?:About the role|The role|Responsibilities|Qualifications|Requirements|Skills|Experience|Benefits|Compensation)$/gim, "")
    .replace(/^[•▪◦]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flattened.length <= maxLength) return flattened;
  const cut = flattened.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  const wordEnd = cut.lastIndexOf(" ");
  const end = sentenceEnd >= Math.floor(maxLength * 0.55) ? sentenceEnd + 1 : wordEnd;
  return `${cut.slice(0, Math.max(1, end)).trim()}…`;
}

export function safeMatchText(raw: unknown): string {
  return cleanJobDescription(raw)
    .replace(/blocked by a hard preference:?/gi, "Needs a preference review:")
    .replace(/\bblocked\b/gi, "held for review");
}

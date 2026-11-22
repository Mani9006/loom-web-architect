/** Strips characters that are illegal in file names on Windows/macOS (e.g. "/"
 *  in "Acme, ML/AI Engineer") so downloads don't fail or get truncated. */
export function safeFileName(name: string, fallback = "resume"): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-.\s]+|[-.\s]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

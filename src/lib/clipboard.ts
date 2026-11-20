/**
 * Writes text to the clipboard and reports whether it worked. The async
 * Clipboard API rejects in insecure contexts, unfocused documents and when
 * permission is denied; callers should only show "Copied" on true.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const PDF_HEADER = new TextEncoder().encode("%PDF-");
const PDF_EOF = new TextEncoder().encode("%%EOF");

function containsSequence(bytes, sequence, start, end) {
  const upperBound = Math.min(end, bytes.byteLength) - sequence.byteLength;
  for (let offset = Math.max(0, start); offset <= upperBound; offset += 1) {
    let matches = true;
    for (let index = 0; index < sequence.byteLength; index += 1) {
      if (bytes[offset + index] !== sequence[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * Browser workers only accept the immutable PDF produced by mc-render-resume.
 * Do not infer a file type from a server-controlled Content-Type header: ATS
 * upload controls will parse the bytes, so the worker must validate them too.
 */
export function validateGeneratedResumePdf(bytes, contentType = "") {
  if (!(bytes instanceof Uint8Array)) {
    return { ok: false, reason: "not_binary" };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, reason: "empty" };
  }
  if (bytes.byteLength > 10 * 1024 * 1024) {
    return { ok: false, reason: "too_large" };
  }

  const normalizedType = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (normalizedType !== "application/pdf") {
    return { ok: false, reason: "unexpected_content_type" };
  }

  // ISO 32000 permits the PDF header within the first 1024 bytes. Requiring
  // an EOF marker near the tail catches HTML/error bodies mislabeled as PDFs.
  const hasHeader = containsSequence(bytes, PDF_HEADER, 0, 1024);
  const hasEof = containsSequence(
    bytes,
    PDF_EOF,
    Math.max(0, bytes.byteLength - 1024),
    bytes.byteLength,
  );
  if (!hasHeader || !hasEof) {
    return { ok: false, reason: "invalid_pdf_signature" };
  }

  return { ok: true, reason: null };
}

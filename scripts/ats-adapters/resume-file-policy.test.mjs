import assert from "node:assert/strict";
import test from "node:test";
import { validateGeneratedResumePdf } from "./resume-file-policy.mjs";

const encoder = new TextEncoder();

test("accepts a generated PDF with an exact PDF content type", () => {
  const bytes = encoder.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  assert.deepEqual(
    validateGeneratedResumePdf(bytes, "application/pdf; charset=binary"),
    { ok: true, reason: null },
  );
});

test("rejects HTML and ZIP bytes even when mislabeled as a PDF", () => {
  assert.equal(
    validateGeneratedResumePdf(encoder.encode("<html>login required</html>"), "application/pdf").ok,
    false,
  );
  assert.equal(
    validateGeneratedResumePdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/pdf").ok,
    false,
  );
});

test("rejects a valid-looking PDF served with an unexpected type", () => {
  const bytes = encoder.encode("%PDF-1.7\n%%EOF");
  assert.deepEqual(
    validateGeneratedResumePdf(bytes, "application/octet-stream"),
    { ok: false, reason: "unexpected_content_type" },
  );
});

test("rejects truncated PDFs without an EOF marker", () => {
  const bytes = encoder.encode("%PDF-1.7\n1 0 obj\n<<>>");
  assert.deepEqual(
    validateGeneratedResumePdf(bytes, "application/pdf"),
    { ok: false, reason: "invalid_pdf_signature" },
  );
});

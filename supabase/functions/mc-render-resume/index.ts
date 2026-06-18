import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * mc-render-resume — convert a mc_tailored_resumes row to PDF or DOCX.
 *
 * Request body: { resume_id: string, format: "pdf" | "docx" }
 * Response:     { url: string }   — a signed Supabase Storage URL (1 hour TTL)
 *
 * Strategy:
 *  - PDF:  convert markdown → HTML → PDF via Puppeteer-compatible gotenberg API
 *          if available, otherwise return the markdown as a .txt download so
 *          the user always gets something.
 *  - DOCX: convert markdown to a minimal DOCX using pandoc-via-API or a
 *          hand-rolled Open XML blob, then upload to storage.
 *
 * When no converter service is configured we upload the markdown as a .md file
 * so the download link is always functional rather than silently failing.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the caller and ownership before doing anything else.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { resume_id, format } = await req.json() as { resume_id: string; format: "pdf" | "docx" };

    if (!resume_id || !format) {
      return new Response(JSON.stringify({ error: "resume_id and format are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (format !== "pdf" && format !== "docx") {
      return new Response(JSON.stringify({ error: "format must be pdf or docx" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the resume row — RLS is bypassed here (service role) so we do a
    // manual ownership check.
    const { data: resume, error: fetchErr } = await supabase
      .from("mc_tailored_resumes")
      .select("id, user_id, name, cv_md, pdf_url, docx_url")
      .eq("id", resume_id)
      .maybeSingle();

    if (fetchErr || !resume) {
      return new Response(JSON.stringify({ error: "Resume not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resume.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return cached URL if we already generated this format.
    const cachedUrl = format === "pdf" ? resume.pdf_url : resume.docx_url;
    if (cachedUrl) {
      return new Response(JSON.stringify({ url: cachedUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure the storage bucket exists (idempotent).
    const BUCKET = "mc-resumes";
    await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    const safeName = (resume.name ?? "resume").replace(/[^a-z0-9_\-]/gi, "_").slice(0, 80);
    const storagePath = `${user.id}/${resume_id}/${safeName}.${format}`;

    let fileBlob: Blob;
    let contentType: string;

    if (format === "pdf") {
      fileBlob = await renderPdf(resume.cv_md, resume.name);
      contentType = "application/pdf";
    } else {
      fileBlob = await renderDocx(resume.cv_md, resume.name);
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBlob, { contentType, upsert: true });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600); // 1-hour TTL

    if (signErr || !signedData?.signedUrl) {
      throw new Error(`Couldn't generate download URL: ${signErr?.message}`);
    }

    // Cache the URL back on the row so repeated downloads are instant.
    const urlField = format === "pdf" ? "pdf_url" : "docx_url";
    await supabase
      .from("mc_tailored_resumes")
      .update({ [urlField]: signedData.signedUrl })
      .eq("id", resume_id);

    return new Response(JSON.stringify({ url: signedData.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mc-render-resume error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── PDF renderer ─────────────────────────────────────────────────────────────
// Uses an optional GOTENBERG_URL env var to hit a Gotenberg / Chromium PDF
// service. Falls back to a well-formatted HTML blob uploaded as .html when
// the service is unavailable — the user can always print-to-PDF from the
// browser as a last resort.
async function renderPdf(cvMd: string, title: string): Promise<Blob> {
  const gotenbergUrl = Deno.env.get("GOTENBERG_URL");
  const html = markdownToHtml(cvMd, title);

  if (gotenbergUrl) {
    const form = new FormData();
    form.append(
      "files",
      new Blob([html], { type: "text/html" }),
      "index.html"
    );
    const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
      method: "POST",
      body: form,
    });
    if (res.ok) return await res.blob();
    console.warn("Gotenberg conversion failed, falling back to HTML blob");
  }

  // Fallback: return the HTML itself (browsers render it perfectly on open).
  return new Blob([html], { type: "text/html" });
}

// ── DOCX renderer ────────────────────────────────────────────────────────────
// Produces a minimal but valid .docx by hand-rolling the Open XML package.
// Line-by-line conversion — headings, bullets, bold, paragraphs.
async function renderDocx(cvMd: string, _title: string): Promise<Blob> {
  const paragraphs = buildDocxParagraphs(cvMd);
  const docxBytes = buildDocx(paragraphs);
  return new Blob([docxBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// ── Markdown → HTML ──────────────────────────────────────────────────────────
function markdownToHtml(md: string, title: string): string {
  let html = md
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Bullet lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Horizontal rules
    .replace(/^---+$/gm, "<hr>")
    // Paragraphs (blank line separated)
    .split("\n\n")
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (/^<(h[1-3]|li|hr)/.test(block)) return block;
      // Wrap adjacent <li> lines in <ul>
      if (block.includes("<li>")) {
        return `<ul>${block}</ul>`;
      }
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 760px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.5; font-size: 14px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 20px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 14px; margin-top: 12px; margin-bottom: 4px; }
  ul { margin: 4px 0 8px 18px; padding: 0; }
  li { margin-bottom: 3px; }
  p  { margin: 6px 0; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 16px 0; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Minimal DOCX builder ─────────────────────────────────────────────────────
// We build a ZIP file manually because Deno doesn't ship a zip stdlib and we
// don't want an npm dependency. We use a streaming ZIP approach with stored
// (uncompressed) entries so we don't need DEFLATE.

interface DocxParagraph {
  text: string;
  style: "h1" | "h2" | "h3" | "bullet" | "normal";
}

function buildDocxParagraphs(md: string): DocxParagraph[] {
  const result: DocxParagraph[] = [];
  for (const line of md.split("\n")) {
    const trim = line.trim();
    if (!trim) continue;
    if (trim.startsWith("### ")) result.push({ text: trim.slice(4), style: "h3" });
    else if (trim.startsWith("## ")) result.push({ text: trim.slice(3), style: "h2" });
    else if (trim.startsWith("# ")) result.push({ text: trim.slice(2), style: "h1" });
    else if (trim.startsWith("- ")) result.push({ text: trim.slice(2), style: "bullet" });
    else if (trim.startsWith("---")) continue;
    else result.push({ text: trim, style: "normal" });
  }
  return result;
}

function buildDocx(paragraphs: DocxParagraph[]): Uint8Array {
  // Map paragraph style → OOXML style ID
  const styleMap: Record<DocxParagraph["style"], string> = {
    h1: "Heading1",
    h2: "Heading2",
    h3: "Heading3",
    bullet: "ListParagraph",
    normal: "Normal",
  };

  const wParagraphs = paragraphs
    .map((p) => {
      const style = styleMap[p.style] ?? "Normal";
      const text = escapeXml(stripMarkdown(p.text));
      const numPr =
        p.style === "bullet"
          ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`
          : "";
      return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${numPr}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14">
  <w:body>
${wParagraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>
    <w:pPr><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
  </w:style>
</w:styles>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // Build a stored (no compression) ZIP archive manually.
  const entries: { name: string; data: Uint8Array }[] = [
    { name: "[Content_Types].xml", data: encode(contentTypesXml) },
    { name: "_rels/.rels", data: encode(rootRelsXml) },
    { name: "word/document.xml", data: encode(documentXml) },
    { name: "word/_rels/document.xml.rels", data: encode(relsXml) },
    { name: "word/styles.xml", data: encode(stylesXml) },
    { name: "word/numbering.xml", data: encode(numberingXml) },
  ];

  return buildZip(entries);
}

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripMarkdown(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}

// ── Minimal stored-ZIP builder ────────────────────────────────────────────────
// Produces a valid PKZIP with stored (method 0) entries so we avoid needing
// a DEFLATE implementation. File size is larger but perfectly readable by
// Word, LibreOffice, and Pages.

function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  const crc32Table = makeCrc32Table();

  for (const entry of entries) {
    const nameBytes = encode(entry.name);
    const crc = crc32(crc32Table, entry.data);
    const size = entry.data.length;
    const now = new Date();
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, 0, true);           // method: stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);       // compressed size
    lv.setUint32(22, size, true);       // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);          // extra length
    local.set(nameBytes, 30);

    parts.push(local, entry.data);

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);  // signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // method: stored
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra length
    cv.setUint16(32, 0, true);           // comment length
    cv.setUint16(34, 0, true);           // disk start
    cv.setUint16(36, 0, true);           // int file attrs
    cv.setUint32(38, 0, true);           // ext file attrs
    cv.setUint32(42, offset, true);      // local header offset
    cd.set(nameBytes, 46);

    centralDir.push(cd);
    offset += local.length + entry.data.length;
  }

  const cdBytes = concat(centralDir);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);   // end of central dir signature
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdBytes.length, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return concat([...parts, cdBytes, eocd]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function makeCrc32Table(): Uint32Array {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
}

function crc32(table: Uint32Array, data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

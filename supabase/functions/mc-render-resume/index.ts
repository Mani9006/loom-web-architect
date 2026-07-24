import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthedUserOrService, HttpError, jsonResponse, serviceClient } from "../_shared/guards.ts";
import {
  ATS_PDF_SPEC,
  blocksFromResumeLines,
  type LayoutBlock,
  paginateWithAutoFit,
} from "../_shared/resume-pdf-layout.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === "string" ? [item.trim()] : [] ).filter(Boolean);
  if (value && typeof value === "object") return Object.values(value as RecordValue).flatMap((item) => strings(item));
  return [];
}

function resumeLines(row: RecordValue): string[] {
  if (text(row.cv_md)) return text(row.cv_md).split(/\r?\n/).map((line) => line.trimEnd());

  const personal = asRecord(row.personal_info);
  const lines: string[] = [];
  const name = text(personal.fullName) || text(personal.name) || text(row.title) || "Resume";
  lines.push(name);
  const contact = [personal.email, personal.phone, personal.location, personal.linkedin]
    .map(text).filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  const summary = text(row.summary) || text(personal.summary);
  if (summary) lines.push("", "SUMMARY", summary);

  const experience = Array.isArray(row.experience) ? row.experience : [];
  if (experience.length) {
    lines.push("", "EXPERIENCE");
    for (const item of experience) {
      const role = text(asRecord(item).role) || text(asRecord(item).title);
      const company = text(asRecord(item).company_or_client) || text(asRecord(item).company) || text(asRecord(item).client);
      const dates = [text(asRecord(item).start_date), text(asRecord(item).end_date) || "Present"].filter(Boolean).join(" – ");
      lines.push([role, company, dates ? `(${dates})` : ""].filter(Boolean).join(" · "));
      const bullets = strings(asRecord(item).bullets);
      for (const bullet of bullets) lines.push(`• ${bullet}`);
    }
  }

  const skills = strings(row.skills);
  if (skills.length) lines.push("", "SKILLS", skills.join(" · "));
  const education = Array.isArray(row.education) ? row.education : [];
  if (education.length) {
    lines.push("", "EDUCATION");
    for (const item of education) {
      const value = asRecord(item);
      lines.push([text(value.degree), text(value.school) || text(value.institution), text(value.graduation_date)].filter(Boolean).join(" · "));
    }
  }
  return lines;
}

function wrap(value: string, font: any, size: number, width: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

const BODY_COLOR = rgb(0.12, 0.12, 0.12);
const HEADING_COLOR = rgb(0.12, 0.18, 0.25);
const RULE_COLOR = rgb(0.72, 0.75, 0.78);
const FOOTER_COLOR = rgb(0.5, 0.5, 0.5);

/**
 * Renders the resume with the shared pagination engine:
 * entries never split across pages, section headings stay with their first
 * item, bullets never split mid-line, and small (≤8%) one-page overflows
 * auto-tighten line-height/spacing instead of stranding a line on page 2.
 *
 * ATS-guideline format: single column, Helvetica (standard sans), 10.5pt
 * body / 14pt name, 0.75in margins, real selectable text, no tables,
 * text-boxes, or graphics.
 */
async function renderPdf(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const spec = ATS_PDF_SPEC;
  const pageSize: [number, number] = [spec.pageWidthPt, spec.pageHeightPt];
  const margin = spec.marginPt;
  const width = spec.pageWidthPt - margin * 2;
  const lineHeight = (size: number) => size * spec.lineHeightScale;

  const blocks = blocksFromResumeLines(lines, {
    wrap: (value, size, style, indent = 0) => wrap(value, style === "bold" ? bold : regular, size, width - indent),
  });
  const layout = paginateWithAutoFit(blocks, {
    usableHeight: spec.pageHeightPt - margin * 2,
    lineHeight,
  });
  const density = layout.density;

  const drawBlock = (page: any, block: LayoutBlock, yStart: number): number => {
    let y = yStart - block.gapBefore * density;
    if (block.kind === "heading" && y < pageSize[1] - margin - 20) {
      page.drawLine({
        start: { x: margin, y: y + 3 },
        end: { x: pageSize[0] - margin, y: y + 3 },
        thickness: 0.6,
        color: RULE_COLOR,
      });
    }
    for (const line of block.lines) {
      y -= lineHeight(line.size) * density;
      page.drawText(line.text, {
        x: margin + (line.indent ?? 0),
        y,
        size: line.size,
        font: line.style === "bold" ? bold : regular,
        color: block.kind === "heading" ? HEADING_COLOR : BODY_COLOR,
      });
    }
    return y;
  };

  const name = lines.map((line) => line.replace(/^#{1,6}\s*/, "").trim()).find(Boolean) || "Resume";
  layout.pages.forEach((pageBlocks, pageIndex) => {
    const page = pdf.addPage(pageSize);
    let y = pageSize[1] - margin;
    for (const block of pageBlocks) y = drawBlock(page, block, y);
    if (layout.pages.length > 1) {
      page.drawText(`${name} — Page ${pageIndex + 1} of ${layout.pages.length}`, {
        x: pageSize[0] / 2 - regular.widthOfTextAtSize(`${name} — Page ${pageIndex + 1} of ${layout.pages.length}`, 8) / 2,
        y: 18,
        size: 8,
        font: regular,
        color: FOOTER_COLOR,
      });
    }
  });

  return pdf.save();
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({})) as { resume_id?: string; format?: string; user_id?: string };
    const user = await getAuthedUserOrService(req, body.user_id);
    const resumeId = text(body.resume_id);
    if (!resumeId) throw new HttpError(400, "resume_id required");
    if (text(body.format).toLowerCase() && text(body.format).toLowerCase() !== "pdf") {
      throw new HttpError(422, "PDF export is the supported application artifact. DOCX export is available from the resume editor.");
    }

    const svc = serviceClient();
    let row: RecordValue | null = null;
    let table: "resumes" | "mc_tailored_resumes" = "resumes";
    const { data: resume } = await svc.from("resumes").select("*").eq("id", resumeId).eq("user_id", user.id).maybeSingle();
    if (resume) row = resume as RecordValue;
    else {
      const { data: tailored } = await svc.from("mc_tailored_resumes").select("*").eq("id", resumeId).eq("user_id", user.id).maybeSingle();
      if (tailored) { row = tailored as RecordValue; table = "mc_tailored_resumes"; }
    }
    if (!row) throw new HttpError(404, "resume not found");

    const bytes = await renderPdf(resumeLines(row));
    const path = `${user.id}/generated/${resumeId}-${Date.now()}.pdf`;
    const { error: uploadError } = await svc.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new HttpError(500, "resume artifact could not be stored");
    const { data: signed, error: signedError } = await svc.storage.from("documents").createSignedUrl(path, 3600);
    if (signedError || !signed?.signedUrl) throw new HttpError(500, "resume artifact could not be opened");

    const column = table === "resumes" ? { tailored_cv_pdf_url: signed.signedUrl } : { pdf_url: signed.signedUrl };
    await svc.from(table).update(column).eq("id", resumeId).eq("user_id", user.id);
    return jsonResponse({ ok: true, format: "pdf", url: signed.signedUrl, storage_path: path });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : "resume export failed" }, status);
  }
}

serve(handler);

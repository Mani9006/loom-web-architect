import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthedUserOrService, HttpError, jsonResponse, serviceClient } from "../_shared/guards.ts";

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

async function renderPdf(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  const width = pageSize[0] - margin * 2;
  const bodySize = 9.5;
  const lineHeight = 13;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  let index = 0;
  let first = true;

  const newPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; first = false; };
  const ensure = (height: number) => { if (y - height < margin) newPage(); };

  for (const raw of lines) {
    const line = raw.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").replace(/__/g, "").replace(/\s+$/, "");
    if (!line) { y -= 6; continue; }
    const isHeading = /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|LANGUAGES|PROFILE)$/i.test(line);
    const isName = first && index === 0;
    const font = isName || isHeading ? bold : regular;
    const size = isName ? 16 : isHeading ? 10.5 : bodySize;
    const color = isHeading ? rgb(0.12, 0.18, 0.25) : rgb(0.12, 0.12, 0.12);
    const gap = isHeading ? 5 : 0;
    const rows = wrap(line, font, size, width);
    ensure(rows.length * lineHeight + gap + 2);
    if (isHeading && y < pageSize[1] - margin - 20) {
      page.drawLine({ start: { x: margin, y: y + 3 }, end: { x: pageSize[0] - margin, y: y + 3 }, thickness: 0.6, color: rgb(0.72, 0.75, 0.78) });
    }
    for (const row of rows) {
      page.drawText(row, { x: margin, y, size, font, color });
      y -= lineHeight;
    }
    y -= gap;
    index += 1;
  }
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

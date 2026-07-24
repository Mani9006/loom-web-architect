import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthedUserOrService, HttpError, jsonResponse, serviceClient } from "../_shared/guards.ts";
import {
  mergeResumeArtifactSource,
  resumeArtifactIdentity,
  resumeArtifactLines,
  sourceResumeId,
} from "../_shared/resume-artifact.ts";
import { renderResumePdf } from "../_shared/resume-pdf-renderer.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RecordValue = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

    if (table === "resumes") {
      const sourceId = sourceResumeId(row);
      if (sourceId && sourceId !== resumeId) {
        const { data: source } = await svc
          .from("resumes")
          .select("*")
          .eq("id", sourceId)
          .eq("user_id", user.id)
          .maybeSingle();
        row = mergeResumeArtifactSource(row, source as RecordValue | null);
      }
    }

    const lines = resumeArtifactLines(row);
    const contentSha256 = await sha256Hex(resumeArtifactIdentity(lines));
    const bytes = await renderResumePdf(lines);
    const path = `${user.id}/generated/${resumeId}/${contentSha256}.pdf`;
    const { error: uploadError } = await svc.storage.from("documents").upload(path, bytes, {
      contentType: "application/pdf",
      cacheControl: "31536000",
      upsert: false,
    });
    const duplicateArtifact = uploadError && (
      String((uploadError as { statusCode?: string | number }).statusCode) === "409"
      || /already exists|duplicate/i.test(uploadError.message)
    );
    if (uploadError && !duplicateArtifact) {
      throw new HttpError(500, "resume artifact could not be stored");
    }
    const { data: signed, error: signedError } = await svc.storage.from("documents").createSignedUrl(path, 3600);
    if (signedError || !signed?.signedUrl) throw new HttpError(500, "resume artifact could not be opened");

    // My Collection has a PDF cache column. Application snapshots are linked
    // from draft_applications, whose submit path stores this returned URL.
    if (table === "mc_tailored_resumes") {
      await svc
        .from("mc_tailored_resumes")
        .update({ pdf_url: signed.signedUrl })
        .eq("id", resumeId)
        .eq("user_id", user.id);
    }
    return jsonResponse({
      ok: true,
      format: "pdf",
      url: signed.signedUrl,
      storage_path: path,
      content_sha256: contentSha256,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : "resume export failed" }, status);
  }
}

serve(handler);

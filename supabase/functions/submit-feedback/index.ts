/**
 * submit-feedback — Persist feedback to feedback_submissions and email owner.
 *
 * Body: { category, subject, message, page_url?, user_agent? }
 * Returns: { id }
 *
 * Email is best-effort — if Resend isn't configured, the row is still saved
 * and admins can read it via the feedback table.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser, HttpError,
  serviceClient,
} from "../_shared/guards.ts";

const OWNER_EMAIL_ENV = "OWNER_EMAIL";
const RESEND_URL = "https://api.resend.com/emails";

interface Body {
  category?: "bug" | "feature" | "praise" | "other";
  subject?: string;
  message?: string;
  page_url?: string;
  user_agent?: string;
}

async function sendToOwner(row: {
  id: string; category: string; subject: string; message: string;
  user_email: string | null; page_url: string | null;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get(OWNER_EMAIL_ENV);
  if (!apiKey || !to) return; // silent no-op if not configured

  const html = `
    <h2>New feedback — ${row.category}</h2>
    <p><strong>Subject:</strong> ${escape(row.subject)}</p>
    <p><strong>From:</strong> ${escape(row.user_email ?? "anonymous")}</p>
    ${row.page_url ? `<p><strong>Page:</strong> ${escape(row.page_url)}</p>` : ""}
    <hr/>
    <pre style="white-space:pre-wrap;font-family:ui-sans-serif">${escape(row.message)}</pre>
    <hr/>
    <p style="color:#888;font-size:12px">id: ${row.id}</p>
  `;

  await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ResumePreps Feedback <feedback@resumepreps.com>",
      to: [to],
      subject: `[Feedback · ${row.category}] ${row.subject}`,
      html,
    }),
  }).catch((err) => {
    console.error("resend:", err);
  });
}

function escape(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({})) as Body;
    const category = body.category ?? "other";
    if (!["bug", "feature", "praise", "other"].includes(category)) {
      throw new HttpError(400, "invalid category");
    }
    const subject = (body.subject ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!subject || !message) throw new HttpError(400, "subject and message required");
    if (subject.length > 200) throw new HttpError(400, "subject too long");
    if (message.length > 5000) throw new HttpError(400, "message too long");

    const svc = serviceClient();
    const { data: saved, error } = await svc.from("feedback_submissions").insert({
      user_id: user.id,
      user_email: user.email,
      category,
      subject,
      message,
      page_url: body.page_url ?? null,
      user_agent: body.user_agent ?? null,
    }).select("id").single();
    if (error) throw new HttpError(500, error.message);

    // Best-effort email notification
    sendToOwner({
      id: (saved as { id: string }).id,
      category,
      subject,
      message,
      user_email: user.email,
      page_url: body.page_url ?? null,
    }).catch((e) => console.error("email notify:", e));

    return jsonResponse({ id: (saved as { id: string }).id });
  });
});

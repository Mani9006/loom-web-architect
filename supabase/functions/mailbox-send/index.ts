// Reply from the in-app inbox using the caller's hosted address (JWT).
//
// POST { reply_to_email_id?: uuid, to?: string, subject?: string, body: string, client_request_id?: string }
//
// Abuse limits: the recipient must have emailed this mailbox before (a stored
// source = 'hosted' message from that address), and each user can send at
// most MAILBOX_SEND_DAILY_LIMIT messages per rolling 24 hours.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  buildMailboxFrom,
  isValidEmail,
  MAILBOX_SEND_DAILY_LIMIT,
  parseAddress,
  replySubject,
  textToHtml,
} from "../_shared/hosted-mailbox.ts";
import {
  adminClient,
  authenticatedUser,
  corsHeaders,
  json,
  mailboxAddress,
  readMailboxConfig,
  unavailable,
} from "../_shared/mailbox-runtime.ts";
import { sendResendEmail } from "../_shared/resend-mail.ts";

const MAX_BODY = 20_000;
const MAX_SUBJECT = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = readMailboxConfig();
  if (!config) return unavailable();

  const user = await authenticatedUser(req, config);
  if (!user) return json({ error: "Sign in to send a reply.", code: "AUTH_REQUIRED" }, 401);

  const body = await req.json().catch(() => ({}));
  const text = String(body?.body || "").replace(/\r\n/g, "\n").trim();
  if (!text) return json({ error: "Write a message before sending.", code: "BODY_REQUIRED" }, 400);
  if (text.length > MAX_BODY) return json({ error: "That message is too long to send.", code: "BODY_TOO_LONG" }, 400);

  const admin = adminClient(config);
  const { data: mailbox } = await admin
    .from("user_mailboxes")
    .select("local_part,domain,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mailbox || mailbox.status !== "active") {
    return json({ error: "Your application address isn't active.", code: "MAILBOX_MISSING" }, 404);
  }

  let to = parseAddress(String(body?.to || "")).address;
  let subject = String(body?.subject || "").trim();
  let replyToRowId: string | null = null;
  let inReplyTo: string | null = null;

  if (body?.reply_to_email_id) {
    const { data: original } = await admin
      .from("mc_inbound_emails")
      .select("id,from_email,subject,raw")
      .eq("id", String(body.reply_to_email_id))
      .eq("user_id", user.id)
      .eq("source", "hosted")
      .maybeSingle();
    if (!original) return json({ error: "That message can't be replied to.", code: "ORIGINAL_MISSING" }, 404);
    replyToRowId = original.id;
    to = to || parseAddress(original.from_email).address;
    subject = subject || replySubject(original.subject);
    const header = String(original.raw?.message_id_header || "").trim();
    if (/^<[^<>\s]+>$/.test(header)) inReplyTo = header;
    else if (/^[^<>\s]+@[^<>\s]+$/.test(header)) inReplyTo = `<${header}>`;
  }

  if (!to || !isValidEmail(to)) return json({ error: "Add a valid recipient.", code: "TO_INVALID" }, 400);
  subject = (subject || "Following up").slice(0, MAX_SUBJECT).replace(/[\r\n]+/g, " ");

  // Recipient allow-list: someone who has emailed this mailbox. Rows with
  // source = 'hosted' are written only by the webhook (DB trigger guard).
  const pattern = `%${to.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  const { data: senders, error: senderError } = await admin
    .from("mc_inbound_emails")
    .select("from_email")
    .eq("user_id", user.id)
    .eq("source", "hosted")
    .ilike("from_email", pattern)
    .limit(25);
  if (senderError) {
    console.error("mailbox-send sender check", senderError.code);
    return json({ error: "The reply couldn't be sent. Try again.", code: "SEND_FAILED" }, 500);
  }
  const knownSender = (senders ?? []).some((row: any) => parseAddress(row.from_email).address === to);
  if (!knownSender) {
    return json({ error: "You can only reply to people who have emailed your application address.", code: "RECIPIENT_NOT_ALLOWED" }, 403);
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count, error: countError } = await admin
    .from("mailbox_outbound")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countError) {
    console.error("mailbox-send rate check", countError.code);
    return json({ error: "The reply couldn't be sent. Try again.", code: "SEND_FAILED" }, 500);
  }
  if ((count ?? 0) >= MAILBOX_SEND_DAILY_LIMIT) {
    return json({ error: `You've sent ${MAILBOX_SEND_DAILY_LIMIT} replies today. Try again tomorrow.`, code: "RATE_LIMITED" }, 429);
  }

  const { data: profile } = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
  const address = mailboxAddress(mailbox);
  const headers: Record<string, string> = {};
  if (inReplyTo) {
    headers["In-Reply-To"] = inReplyTo;
    headers["References"] = inReplyTo;
  }
  const clientRequestId = typeof body?.client_request_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.client_request_id)
    ? body.client_request_id
    : null;

  let resendId: string | null = null;
  try {
    const sent = await sendResendEmail(config.resendApiKey, {
      from: buildMailboxFrom(profile?.full_name, address),
      to: [to],
      subject,
      text,
      html: textToHtml(text),
      ...(Object.keys(headers).length ? { headers } : {}),
    }, clientRequestId ? `send-${user.id}-${clientRequestId}` : undefined);
    resendId = sent?.id ?? null;
  } catch (error) {
    console.error("mailbox-send send", error instanceof Error ? error.message : "unknown");
    return json({ error: "The reply couldn't be sent. Try again.", code: "SEND_FAILED" }, 502);
  }

  const { error: logError } = await admin.from("mailbox_outbound").insert({
    user_id: user.id,
    to_email: to,
    subject,
    resend_id: resendId,
    in_reply_to_email_id: replyToRowId,
  });
  if (logError) console.error("mailbox-send log", logError.code);

  return json({ ok: true, id: resendId });
});

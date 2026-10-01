// Resend Inbound webhook for the hosted application mailbox.
//
// Resend → POST (Svix-signed) { type: "email.received", data: { email_id, from, to[], cc[], … } }
//
// 1. Verify the Svix signature with RESEND_WEBHOOK_SECRET.
// 2. Map to/cc recipients on MAILBOX_DOMAIN (plus-tags stripped) to active
//    mailboxes. Unknown recipients → 200 + log (Resend must not retry).
// 3. Fetch the body from Resend, run the shared classifier / verification-code
//    screening / job linking (_shared/inbound-email.ts — same pipeline as
//    mc-gmail-poll) and store in mc_inbound_emails (source = 'hosted').
// 4. Forward to the user's verified address with reply_to = original sender.
//
// Resend retries non-2xx deliveries, so everything is idempotent: the row key
// is message_id = 'resend:' + email_id and forwards carry an Idempotency-Key.
// Never log bodies, subjects, addresses or verification codes.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { chatFree } from "../_shared/llm.ts";
import {
  applyEmailStatusMove,
  classifyEmail,
  type ClassifiedEmail,
  matchTrackedJob,
  normalizeBody,
  redactVerificationCode,
  screenVerificationCode,
} from "../_shared/inbound-email.ts";
import {
  attachmentsFitBudget,
  buildForwardFrom,
  bytesToBase64,
  escapeHtml,
  FORWARDED_HEADER,
  matchMailboxRecipients,
  parseAddress,
  shouldSkipForward,
  verifySvixSignature,
} from "../_shared/hosted-mailbox.ts";
import { adminClient, json, mailboxAddress, readMailboxConfig, unavailable } from "../_shared/mailbox-runtime.ts";
import {
  getReceivedEmail,
  listReceivedAttachments,
  type OutgoingAttachment,
  type ReceivedEmail,
  ResendError,
  sendResendEmail,
} from "../_shared/resend-mail.ts";

const LOG = "inbound-email-webhook";

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = readMailboxConfig();
  if (!config) return unavailable();

  const rawBody = await req.text();
  const verified = await verifySvixSignature(rawBody, {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  }, config.webhookSecret);
  if (!verified) return json({ error: "Invalid signature" }, 401);

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (event?.type !== "email.received") return json({ ignored: true });

  const data = event.data ?? {};
  const emailId = typeof data.email_id === "string" ? data.email_id : "";
  if (!emailId) return json({ error: "Missing email_id" }, 400);

  const recipients = [...asArray(data.to), ...asArray(data.cc)];
  const localParts = matchMailboxRecipients(recipients, config.mailboxDomain);
  if (localParts.length === 0) {
    console.log(`${LOG} no mailbox recipient`, emailId);
    return json({ ok: true, delivered: 0 });
  }

  const admin = adminClient(config);
  const { data: mailboxes, error: mailboxError } = await admin
    .from("user_mailboxes")
    .select("user_id,local_part,domain,forward_to,forward_verified_at,forwarding_enabled,status")
    .eq("domain", config.mailboxDomain)
    .eq("status", "active")
    .in("local_part", localParts);
  if (mailboxError) {
    console.error(`${LOG} mailbox lookup`, emailId, mailboxError.code);
    return json({ error: "Mailbox lookup failed" }, 500);
  }
  if (!mailboxes?.length) {
    console.log(`${LOG} unknown or paused recipient`, emailId);
    return json({ ok: true, delivered: 0 });
  }

  let received: ReceivedEmail;
  try {
    received = await getReceivedEmail(config.resendApiKey, emailId);
  } catch (error) {
    // Transient Resend failure: a non-2xx makes Resend retry the webhook.
    console.error(`${LOG} fetch body`, emailId, error instanceof Error ? error.message : "unknown");
    return json({ error: "Message body unavailable" }, 502);
  }

  let forwardFailures = 0;
  let delivered = 0;
  for (const mailbox of mailboxes) {
    try {
      await storeHostedEmail(admin, mailbox, emailId, received, data);
      delivered += 1;
    } catch (error) {
      console.error(`${LOG} store`, emailId, error instanceof Error ? error.message : "unknown");
      return json({ error: "Message could not be stored" }, 500);
    }

    const skip = shouldSkipForward({
      from: received.from || String(data.from || ""),
      headers: received.headers,
      mailboxDomain: config.mailboxDomain,
      forwardFrom: config.forwardFrom,
    });
    if (!mailbox.forwarding_enabled || !mailbox.forward_to || !mailbox.forward_verified_at) continue;
    if (skip) {
      console.log(`${LOG} forward skipped`, emailId, skip);
      continue;
    }
    const idempotencyKey = mailboxes.length === 1 ? `fwd-${emailId}` : `fwd-${emailId}-${mailbox.local_part}`;
    try {
      await forwardEmail(config, mailbox, emailId, received, idempotencyKey);
    } catch (error) {
      // Retry (via non-2xx) only when it can help: rate limits, Resend 5xx and
      // network errors. A 4xx such as an invalid payload would fail forever.
      const permanent = error instanceof ResendError && error.status < 500 && error.status !== 429;
      if (!permanent) forwardFailures += 1;
      console.error(`${LOG} forward`, emailId, permanent ? "permanent" : "retryable", error instanceof Error ? error.message : "unknown");
    }
  }

  // The message is stored either way; a retry re-attempts only the forward
  // (Idempotency-Key prevents duplicates for those that already went out).
  if (forwardFailures > 0) return json({ error: "Forward failed", delivered }, 502);
  return json({ ok: true, delivered });
});

// Readable text for the in-app message view: the plain-text part with line
// breaks kept, else the tag-stripped HTML.
function displayText(received: ReceivedEmail, fallback: string): string {
  const text = String(received.text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return (text || fallback).slice(0, 20_000);
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean) : [];
}

async function storeHostedEmail(admin: any, mailbox: any, emailId: string, received: ReceivedEmail, eventData: any) {
  const userId = mailbox.user_id as string;
  const messageId = `resend:${emailId}`;
  const { data: existing } = await admin
    .from("mc_inbound_emails")
    .select("id")
    .eq("user_id", userId)
    .eq("message_id", messageId)
    .maybeSingle();
  if (existing) return; // already stored on an earlier delivery

  const subject = String(received.subject ?? eventData.subject ?? "");
  const fromEmail = String(received.from || eventData.from || "");
  const bodyText = normalizeBody(received.text || received.html || "");
  const receivedAt = received.created_at && !Number.isNaN(Date.parse(received.created_at))
    ? new Date(received.created_at).toISOString()
    : new Date().toISOString();

  const { data: trackedJobs } = await admin
    .from("mc_tracked_jobs")
    .select("id,company,job_title,status,apply_url,session_id")
    .eq("user_id", userId);

  const screening = screenVerificationCode({ subject, bodyText, fromEmail, receivedAt });
  const { activeCode, codeExpiresAt, fromApplicationSender } = screening;
  const matched = matchTrackedJob(trackedJobs ?? [], { subject, fromEmail, bodyText }, screening);

  // Unlike Gmail (a personal inbox), every message to the hosted address is
  // application mail, so unmatched mail is kept and classified too. Unmatched
  // code mail from an ATS keeps the Gmail pipeline's "verification" label.
  const classification: ClassifiedEmail = !matched && activeCode && fromApplicationSender
    ? { classification: "verification", confidence: 1, summary: "Employer verification code" }
    : await classifyEmail({ subject, from: fromEmail, body: bodyText }, chatFree, LOG);

  let sessionId: string | null = matched?.session_id ?? null;
  if (!sessionId) {
    const { data: session } = await admin
      .from("mc_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionId = session?.id ?? null;
  }

  const attachments = Array.isArray((received as any).attachments) ? (received as any).attachments : [];
  const { data: emailRow, error: insertError } = await admin
    .from("mc_inbound_emails")
    .insert({
      user_id: userId,
      session_id: sessionId,
      tracked_job_id: matched?.id ?? null,
      message_id: messageId,
      source: "hosted",
      from_email: fromEmail,
      to_email: mailboxAddress(mailbox),
      subject,
      body_preview: redactVerificationCode(bodyText.slice(0, 600), activeCode),
      // Kept so the in-app inbox can show the full message and compose a
      // reply. The code itself lives only in the short-lived code field.
      body_full: redactVerificationCode(displayText(received, bodyText), activeCode),
      classification: classification.classification,
      classification_confidence: classification.confidence,
      classification_summary: classification.summary,
      next_action: classification.next_action,
      verification_code: activeCode,
      verification_code_expires_at: activeCode ? codeExpiresAt : null,
      parsed_at: new Date().toISOString(),
      received_at: receivedAt,
      raw: {
        provider: "resend",
        resend_email_id: emailId,
        message_id_header: received.message_id || null,
        attachments: attachments.map((item: any) => ({
          filename: item?.filename ?? null,
          size: Number(item?.size) || 0,
          content_type: item?.content_type ?? null,
        })),
      },
    })
    .select("id")
    .single();
  if (insertError) {
    // (user_id, message_id) is unique: a concurrent delivery already stored it.
    if (insertError.code === "23505") return;
    throw new Error(`insert_${insertError.code || "failed"}`);
  }

  await applyEmailStatusMove(admin, {
    userId,
    matched,
    classification,
    emailRowId: emailRow?.id,
    getEnv: (key) => Deno.env.get(key),
    logLabel: LOG,
    logContext: emailId,
  });
}

async function forwardEmail(
  config: { resendApiKey: string; forwardFrom: string },
  mailbox: any,
  emailId: string,
  received: ReceivedEmail,
  idempotencyKey: string,
) {
  const notes: string[] = [];
  let attachments: OutgoingAttachment[] = [];
  try {
    const listed = await listReceivedAttachments(config.resendApiKey, emailId);
    if (listed.length > 0) {
      if (!attachmentsFitBudget(listed.map((item) => item.size))) {
        notes.push(`This message had ${listed.length} attachment${listed.length === 1 ? "" : "s"} over 10 MB in total. Open it in ResumePreps or ask the sender for a link.`);
      } else {
        for (const item of listed) {
          const response = await fetch(item.download_url);
          if (!response.ok) throw new Error(`attachment_download_${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          attachments.push({
            filename: item.filename || "attachment",
            content: bytesToBase64(bytes),
            content_type: item.content_type || undefined,
          });
        }
      }
    }
  } catch (error) {
    attachments = [];
    notes.push("Attachments couldn't be included in this forward. Open the message in ResumePreps.");
    console.error(`${LOG} attachments`, emailId, error instanceof Error ? error.message : "unknown");
  }

  const originalFrom = received.from || "";
  const replyTo = parseAddress(originalFrom).address;
  const noteText = notes.length ? `${notes.join("\n")}\n\n` : "";
  const noteHtml = notes.length
    ? `<p style="color:#555;font-size:13px">${notes.map(escapeHtml).join("<br>")}</p>`
    : "";
  const text = `${noteText}${received.text || (received.html ? normalizeBody(received.html) : "")}`;
  const html = received.html
    ? `${noteHtml}${received.html}`
    : `${noteHtml}<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(received.text || "")}</pre>`;

  await sendResendEmail(config.resendApiKey, {
    from: buildForwardFrom(originalFrom, config.forwardFrom),
    to: [mailbox.forward_to],
    subject: received.subject || "(no subject)",
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
    headers: { [FORWARDED_HEADER]: "1" },
    ...(attachments.length ? { attachments } : {}),
  }, idempotencyKey);
}

// Hosted mailbox settings (JWT).
//
// POST { action: "set_forwarding", enabled: boolean }
// POST { action: "request_forward_change", forward_to: string }
//      → emails a 6-digit code to the NEW address (10 min, 5 attempts)
// POST { action: "confirm_forward_change", forward_to: string, code: string }
//      → on success sets forward_to + forward_verified_at
//
// We never forward to an address that has not proven ownership (otherwise the
// mailbox could be used as an open relay), and never to MAILBOX_DOMAIN.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  escapeHtml,
  FORWARD_CODE_MAX_ATTEMPTS,
  FORWARD_CODE_TTL_MS,
  generateSixDigitCode,
  hashForwardCode,
  isAllowedForwardTarget,
  parseAddress,
} from "../_shared/hosted-mailbox.ts";
import {
  adminClient,
  authenticatedUser,
  corsHeaders,
  json,
  mailboxAddress,
  presentMailbox,
  readMailboxConfig,
  unavailable,
} from "../_shared/mailbox-runtime.ts";
import { sendResendEmail } from "../_shared/resend-mail.ts";

const MAILBOX_COLUMNS = "local_part,domain,forward_to,forward_verified_at,forwarding_enabled,status";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = readMailboxConfig();
  if (!config) return unavailable();

  const user = await authenticatedUser(req, config);
  if (!user) return json({ error: "Sign in to change mailbox settings.", code: "AUTH_REQUIRED" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const admin = adminClient(config);

  const { data: mailbox, error: loadError } = await admin
    .from("user_mailboxes")
    .select(MAILBOX_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadError) {
    console.error("mailbox-settings load", loadError.code);
    return json({ error: "Settings couldn't be loaded. Try again.", code: "MAILBOX_FAILED" }, 500);
  }
  if (!mailbox) return json({ error: "Create your application address first.", code: "MAILBOX_MISSING" }, 404);

  if (action === "set_forwarding") {
    if (typeof body?.enabled !== "boolean") return json({ error: "enabled must be true or false", code: "BAD_REQUEST" }, 400);
    if (body.enabled && !(mailbox.forward_to && mailbox.forward_verified_at)) {
      return json({ error: "Verify a forwarding address before turning forwarding on.", code: "FORWARD_UNVERIFIED" }, 409);
    }
    const { data: updated, error } = await admin
      .from("user_mailboxes")
      .update({ forwarding_enabled: body.enabled })
      .eq("user_id", user.id)
      .select(MAILBOX_COLUMNS)
      .single();
    if (error || !updated) {
      console.error("mailbox-settings forwarding", error?.code);
      return json({ error: "Forwarding wasn't changed. Try again.", code: "MAILBOX_FAILED" }, 500);
    }
    return json({ mailbox: presentMailbox(updated) });
  }

  if (action === "request_forward_change") {
    const target = String(body?.forward_to || "").trim().toLowerCase();
    if (!isAllowedForwardTarget(target, config.mailboxDomain)) {
      return json({ error: "Enter a personal email address that isn't your application address.", code: "FORWARD_INVALID" }, 400);
    }
    if (target === String(mailbox.forward_to || "").toLowerCase() && mailbox.forward_verified_at) {
      return json({ mailbox: presentMailbox(mailbox), unchanged: true });
    }
    const code = generateSixDigitCode();
    const codeHash = await hashForwardCode(user.id, target, code);
    const expiresAt = new Date(Date.now() + FORWARD_CODE_TTL_MS).toISOString();
    const { data: putResult, error: putError } = await admin.rpc("mailbox_forward_code_put", {
      p_user_id: user.id,
      p_target: target,
      p_code_hash: codeHash,
      p_expires_at: expiresAt,
    });
    if (putError) {
      console.error("mailbox-settings code store", putError.code);
      return json({ error: "A code couldn't be sent. Try again.", code: "MAILBOX_FAILED" }, 500);
    }
    if (putResult === "too_soon") {
      return json({ error: "A code was just sent. Wait a minute before asking for another.", code: "CODE_TOO_SOON" }, 429);
    }

    const address = mailboxAddress(mailbox);
    try {
      await sendResendEmail(config.resendApiKey, {
        from: `"ResumePreps" <${parseAddress(config.forwardFrom).address}>`,
        to: [target],
        subject: `${code} is your ResumePreps forwarding code`,
        text: [
          `Enter ${code} in ResumePreps to forward mail sent to ${address} to this address.`,
          "",
          "The code expires in 10 minutes. If you didn't ask for this, ignore this email and nothing will be forwarded.",
        ].join("\n"),
        html: `<p>Enter <strong style="font-size:18px;letter-spacing:2px">${code}</strong> in ResumePreps to forward mail sent to ${escapeHtml(address)} to this address.</p><p>The code expires in 10 minutes. If you didn't ask for this, ignore this email and nothing will be forwarded.</p>`,
        headers: { "X-ResumePreps-Forwarded": "verification" },
      });
    } catch (error) {
      // Log the status only — never the code or the address.
      console.error("mailbox-settings code send", error instanceof Error ? error.message : "unknown");
      return json({ error: "A code couldn't be sent to that address. Check it and try again.", code: "CODE_SEND_FAILED" }, 502);
    }
    return json({ pending: { forward_to: target, expires_at: expiresAt } });
  }

  if (action === "confirm_forward_change") {
    const target = String(body?.forward_to || "").trim().toLowerCase();
    const code = String(body?.code || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code) || !isAllowedForwardTarget(target, config.mailboxDomain)) {
      return json({ error: "Enter the 6-digit code from the email.", code: "CODE_INVALID" }, 400);
    }
    const codeHash = await hashForwardCode(user.id, target, code);
    const { data: status, error: checkError } = await admin.rpc("mailbox_forward_code_check", {
      p_user_id: user.id,
      p_target: target,
      p_code_hash: codeHash,
      p_max_attempts: FORWARD_CODE_MAX_ATTEMPTS,
    });
    if (checkError) {
      console.error("mailbox-settings code check", checkError.code);
      return json({ error: "The code couldn't be checked. Try again.", code: "MAILBOX_FAILED" }, 500);
    }
    if (status !== "ok") {
      const messages: Record<string, string> = {
        invalid: "That code doesn't match. Check the email and try again.",
        expired: "That code expired. Send a new one.",
        locked: "Too many wrong codes. Send a new one.",
        missing: "Send a code to the new address first.",
      };
      return json({ error: messages[String(status)] || messages.invalid, code: `CODE_${String(status || "invalid").toUpperCase()}` }, 400);
    }
    const { data: updated, error: updateError } = await admin
      .from("user_mailboxes")
      .update({ forward_to: target, forward_verified_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select(MAILBOX_COLUMNS)
      .single();
    if (updateError || !updated) {
      console.error("mailbox-settings confirm", updateError?.code);
      return json({ error: "The forwarding address wasn't saved. Try again.", code: "MAILBOX_FAILED" }, 500);
    }
    return json({ mailbox: presentMailbox(updated) });
  }

  return json({ error: "Unknown action", code: "BAD_REQUEST" }, 400);
});

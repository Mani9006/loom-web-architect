import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cache vault secret in memory so we only query once per cold start
let _cachedResendKey: string | null = null;

async function getResendApiKey(): Promise<string | null> {
  // 1. Check Deno env first (set via supabase secrets)
  const envKey = Deno.env.get("RESEND_API_KEY");
  if (envKey) return envKey;

  // 2. Fallback: read from vault.decrypted_secrets
  if (_cachedResendKey) return _cachedResendKey;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return null;

    const sb = createClient(supabaseUrl, serviceKey);
    const { data } = await sb.rpc("read_secret", { secret_name: "RESEND_API_KEY" });
    // read_secret RPC might not exist, so also try direct query
    if (data) {
      _cachedResendKey = typeof data === "string" ? data : null;
      return _cachedResendKey;
    }

    // Direct vault query fallback
    const { data: vaultData } = await sb
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "RESEND_API_KEY")
      .single();
    if (vaultData?.decrypted_secret) {
      _cachedResendKey = vaultData.decrypted_secret;
      return _cachedResendKey;
    }
  } catch (err) {
    console.warn("Vault lookup failed:", err);
  }

  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

// ── Security Helpers ────────────────────────────────────────────────────

// Escape a string for safe interpolation into HTML markup/attribute context.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Constant-time string comparison so token checks don't leak via timing.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

// The direct-send endpoint (handleDirectEmail) can send arbitrary email to
// arbitrary recipients through our Resend account, so it must not be open to
// the public internet. Callers must present either:
//   1. the shared internal secret via the `x-internal-token` header
//      (Deno env: INTERNAL_EMAIL_TOKEN), or
//   2. the project service-role key as a Bearer token (backend-to-backend).
function isAuthorizedDirectRequest(req: Request): boolean {
  const internalToken = Deno.env.get("INTERNAL_EMAIL_TOKEN");
  const providedToken = req.headers.get("x-internal-token");
  if (internalToken && providedToken && timingSafeEqual(providedToken, internalToken)) {
    return true;
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (serviceKey && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer && timingSafeEqual(bearer, serviceKey)) return true;
  }

  return false;
}

// The Supabase Auth "Send Email" hook is the OTHER way this function gets
// called (payload shaped like {user, email_data} instead of {type, to,
// data}), and this function's verify_jwt is off (supabase/config.toml), so
// that branch was reachable by anyone on the public internet with zero
// authentication — a POST of a fabricated {user:{email:"victim@..."},
// email_data:{...}} body would make our own Resend account send a branded,
// attacker-chosen-redirect email (signup/magic-link/reset/email-change) to
// any address. Close it the same way handleDirectEmail is closed: require a
// shared secret, configured as the AUTH_EMAIL_HOOK_SECRET function secret and
// sent back as the `x-auth-hook-token` custom header on the Supabase Auth
// Hook (Dashboard → Authentication → Hooks → Send Email → HTTP → Custom
// Headers). Fails OPEN (unchanged behavior) until that secret is set, so
// wiring this up doesn't require synchronized deploys — but it means the
// hole stays open until an operator actually configures both sides.
function isAuthorizedAuthHookRequest(req: Request): boolean {
  const hookSecret = Deno.env.get("AUTH_EMAIL_HOOK_SECRET");
  if (!hookSecret) return true;
  const providedToken = req.headers.get("x-auth-hook-token") ?? "";
  return Boolean(providedToken) && timingSafeEqual(providedToken, hookSecret);
}

// ── Email Templates ─────────────────────────────────────────────────────

const BRAND = {
  name: "ResumePreps",
  color: "#6366f1", // indigo-500
  colorDark: "#4f46e5", // indigo-600
  logo: "https://resumepreps.com/lovable-uploads/bb2d8416-e498-4920-8c1e-e0cca5eaa52d.png",
  supportEmail: "support@resumepreps.com",
  siteUrl: "https://resumepreps.com",
  // Sender addresses
  noReplyFrom: "ResumePreps <donotreply@resumepreps.com>",
  supportFrom: "ResumePreps Support <support@resumepreps.com>",
};

function baseLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <!-- Header -->
  <tr>
    <td style="background:${BRAND.color};padding:24px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${BRAND.name}</h1>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px;">
      ${content}
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="padding:24px 32px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
      <p style="margin:0 0 8px;color:#71717a;font-size:12px;">
        &copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
      </p>
      <p style="margin:0;color:#a1a1aa;font-size:11px;">
        <a href="${BRAND.siteUrl}" style="color:#6366f1;text-decoration:none;">${BRAND.name}</a>
        &nbsp;&middot;&nbsp;
        <a href="${BRAND.siteUrl}/settings" style="color:#6366f1;text-decoration:none;">Email Preferences</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:${BRAND.supportEmail}" style="color:#6366f1;text-decoration:none;">Support</a>
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buttonHtml(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td style="background:${BRAND.color};border-radius:8px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

// ── Template Builders ───────────────────────────────────────────────────

function welcomeEmail(name: string): { subject: string; html: string } {
  const firstName = (name || "there").split(" ")[0];
  return {
    subject: `Welcome to ${BRAND.name}! Let's land your dream job 🚀`,
    html: baseLayout(`Welcome to ${BRAND.name}`, `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Welcome, ${firstName}!</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
        We're thrilled to have you on board. ${BRAND.name} is your AI-powered career toolkit — from crafting the perfect resume to landing interviews and tracking your applications.
      </p>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 8px;">Here's what you can do right away:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr><td style="padding:6px 0;color:#3f3f46;font-size:15px;">✨ <strong>Build your resume</strong> with AI assistance</td></tr>
        <tr><td style="padding:6px 0;color:#3f3f46;font-size:15px;">🔍 <strong>Search & discover jobs</strong> matched to your profile</td></tr>
        <tr><td style="padding:6px 0;color:#3f3f46;font-size:15px;">📊 <strong>Track applications</strong> with our Kanban board</td></tr>
        <tr><td style="padding:6px 0;color:#3f3f46;font-size:15px;">🤖 <strong>Auto-apply</strong> to jobs (Premium)</td></tr>
      </table>
      ${buttonHtml("Get Started", BRAND.siteUrl + "/home")}
      <p style="color:#71717a;font-size:13px;text-align:center;margin:0;">
        Questions? Just reply to this email or reach out at ${BRAND.supportEmail}
      </p>
    `),
  };
}

function verifyEmail(token: string, redirectUrl: string, email: string): { subject: string; html: string } {
  const confirmUrl = redirectUrl || `${BRAND.siteUrl}/auth/confirm`;
  return {
    subject: `Verify your ${BRAND.name} email`,
    html: baseLayout("Verify Email", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Verify your email</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Thanks for signing up! Please verify your email address <strong>${email}</strong> to get started.
      </p>
      ${buttonHtml("Verify Email Address", confirmUrl)}
      <p style="color:#71717a;font-size:13px;text-align:center;margin:16px 0 0;">
        Or use this 6-digit code: <strong style="font-size:24px;letter-spacing:4px;color:#18181b;">${token}</strong>
      </p>
      <p style="color:#a1a1aa;font-size:12px;text-align:center;margin:16px 0 0;">
        This code expires in 24 hours. If you didn't create an account, you can safely ignore this email.
      </p>
    `),
  };
}

function otpEmail(token: string, email: string): { subject: string; html: string } {
  return {
    subject: `Your ${BRAND.name} verification code: ${token}`,
    html: baseLayout("Verification Code", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Your verification code</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Use this code to verify your identity for <strong>${email}</strong>:
      </p>
      <div style="text-align:center;padding:24px;background:#f4f4f5;border-radius:12px;margin:0 0 24px;">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#18181b;font-family:monospace;">${token}</span>
      </div>
      <p style="color:#71717a;font-size:13px;text-align:center;margin:0;">
        This code expires in 10 minutes. Don't share it with anyone.
      </p>
    `),
  };
}

function resetPasswordEmail(token: string, redirectUrl: string): { subject: string; html: string } {
  const resetUrl = redirectUrl || `${BRAND.siteUrl}/auth/reset-password`;
  return {
    subject: `Reset your ${BRAND.name} password`,
    html: baseLayout("Reset Password", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Reset your password</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
        We received a request to reset your password. Click the button below to choose a new one.
      </p>
      ${buttonHtml("Reset Password", resetUrl)}
      <p style="color:#71717a;font-size:13px;text-align:center;margin:16px 0 0;">
        Or use this code: <strong style="font-size:20px;letter-spacing:4px;color:#18181b;">${token}</strong>
      </p>
      <p style="color:#a1a1aa;font-size:12px;text-align:center;margin:16px 0 0;">
        This link expires in 1 hour. If you didn't request a password reset, please ignore this email.
      </p>
    `),
  };
}

function emailChangeEmail(token: string, newEmail: string, redirectUrl: string): { subject: string; html: string } {
  const confirmUrl = redirectUrl || `${BRAND.siteUrl}/auth/confirm`;
  return {
    subject: `Confirm your new email for ${BRAND.name}`,
    html: baseLayout("Email Change", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Confirm your new email</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
        You requested to change your email to <strong>${newEmail}</strong>. Please verify this change:
      </p>
      ${buttonHtml("Confirm Email Change", confirmUrl)}
      <p style="color:#71717a;font-size:13px;text-align:center;margin:16px 0 0;">
        Or use this code: <strong style="font-size:20px;letter-spacing:4px;color:#18181b;">${token}</strong>
      </p>
      <p style="color:#a1a1aa;font-size:12px;text-align:center;margin:16px 0 0;">
        If you didn't request this change, please contact us immediately at ${BRAND.supportEmail}
      </p>
    `),
  };
}

function accountChangeEmail(changeType: string, details: string): { subject: string; html: string } {
  return {
    subject: `Account ${changeType} notification — ${BRAND.name}`,
    html: baseLayout("Account Change", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Account Update</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
        A change was made to your ${BRAND.name} account:
      </p>
      <div style="padding:16px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;margin:0 0 24px;">
        <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">${changeType}</p>
        <p style="margin:8px 0 0;color:#78350f;font-size:14px;">${details}</p>
      </div>
      <p style="color:#71717a;font-size:13px;margin:0;">
        If you didn't make this change, please <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.color};">contact support</a> immediately.
      </p>
    `),
  };
}

function subscriptionEmail(planName: string, status: string, periodEnd?: string): { subject: string; html: string } {
  const statusColor = status === "active" ? "#22c55e" : status === "canceled" ? "#ef4444" : "#f59e0b";
  const statusLabel = status === "active" ? "Active" : status === "canceled" ? "Canceled" : "Past Due";
  return {
    subject: `Subscription ${status === "active" ? "confirmed" : "update"} — ${BRAND.name}`,
    html: baseLayout("Subscription Update", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Subscription ${statusLabel}</h2>
      <div style="padding:20px;background:#fafafa;border-radius:12px;border:1px solid #e4e4e7;margin:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:14px;">Plan</td>
            <td style="padding:8px 0;color:#18181b;font-size:14px;font-weight:600;text-align:right;">${planName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:14px;">Status</td>
            <td style="padding:8px 0;text-align:right;">
              <span style="display:inline-block;padding:4px 12px;background:${statusColor}20;color:${statusColor};font-size:13px;font-weight:600;border-radius:99px;">${statusLabel}</span>
            </td>
          </tr>
          ${periodEnd ? `<tr>
            <td style="padding:8px 0;color:#71717a;font-size:14px;">Next billing date</td>
            <td style="padding:8px 0;color:#18181b;font-size:14px;text-align:right;">${periodEnd}</td>
          </tr>` : ""}
        </table>
      </div>
      ${buttonHtml("Manage Subscription", BRAND.siteUrl + "/settings")}
    `),
  };
}

function billingReceiptEmail(
  amount: string,
  planName: string,
  invoiceDate: string,
  invoiceUrl?: string,
): { subject: string; html: string } {
  return {
    subject: `Payment receipt — ${amount} — ${BRAND.name}`,
    html: baseLayout("Payment Receipt", `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Payment Receipt</h2>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Thank you for your payment! Here's your receipt:
      </p>
      <div style="padding:20px;background:#fafafa;border-radius:12px;border:1px solid #e4e4e7;margin:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:14px;">Amount</td>
            <td style="padding:8px 0;color:#18181b;font-size:18px;font-weight:700;text-align:right;">${amount}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:14px;">Plan</td>
            <td style="padding:8px 0;color:#18181b;font-size:14px;text-align:right;">${planName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:14px;">Date</td>
            <td style="padding:8px 0;color:#18181b;font-size:14px;text-align:right;">${invoiceDate}</td>
          </tr>
        </table>
      </div>
      ${invoiceUrl ? buttonHtml("Download Invoice", invoiceUrl) : ""}
      <p style="color:#71717a;font-size:13px;text-align:center;margin:0;">
        Questions about billing? Email us at ${BRAND.supportEmail}
      </p>
    `),
  };
}

function marketingEmail(subject: string, heading: string, body: string, ctaText?: string, ctaUrl?: string): { subject: string; html: string } {
  // All caller-supplied fields are HTML-escaped before interpolation so a
  // marketing request cannot inject markup/scripts into outgoing email.
  // The CTA URL is additionally restricted to http(s) schemes.
  const safeHeading = escapeHtml(heading);
  const safeBody = escapeHtml(body);
  const safeCtaText = ctaText ? escapeHtml(ctaText) : undefined;
  const safeCtaUrl = ctaUrl && /^https?:\/\//i.test(ctaUrl) ? ctaUrl : undefined;
  return {
    subject,
    html: baseLayout(safeHeading, `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">${safeHeading}</h2>
      <div style="color:#3f3f46;font-size:15px;line-height:1.7;margin:0 0 24px;">
        ${safeBody}
      </div>
      ${safeCtaText && safeCtaUrl ? buttonHtml(safeCtaText, safeCtaUrl) : ""}
      <p style="color:#a1a1aa;font-size:11px;text-align:center;margin:16px 0 0;">
        You're receiving this because you signed up for ${BRAND.name}.
        <a href="${BRAND.siteUrl}/settings" style="color:#6366f1;">Unsubscribe</a>
      </p>
    `),
  };
}

// ── Send via Resend ────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string, from?: string): Promise<{ success: boolean; error?: string; id?: string }> {
  const apiKey = await getResendApiKey();
  if (!apiKey) {
    console.error("RESEND_API_KEY not found in env or vault");
    return { success: false, error: "Email service not configured" };
  }

  const fromAddress = from || BRAND.noReplyFrom;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Resend API error (${res.status}):`, errBody);
      return { success: false, error: `Email send failed: ${res.status}` };
    }

    const data = await res.json();
    console.log(`Email sent: ${subject} → ${to} (id: ${data.id})`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: String(err) };
  }
}

// ── Auth Hook Handler (Supabase Send Email Hook) ───────────────────────

async function handleAuthHook(payload: any): Promise<Response> {
  const { user, email_data } = payload;
  const userEmail = user?.email;
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  const token = email_data?.token || "";
  const tokenHash = email_data?.token_hash || "";
  const redirectTo = email_data?.redirect_to || "";
  const emailAction = email_data?.email_action_type || "";

  // Build confirmation URL from token hash
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  // For password recovery, always redirect to /reset-password regardless of what the client sent
  const effectiveRedirect = (emailAction === "recovery" || emailAction === "reset")
    ? BRAND.siteUrl + "/reset-password"
    : (redirectTo || BRAND.siteUrl + "/home");
  const confirmUrl = tokenHash
    ? `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=${emailAction}&redirect_to=${encodeURIComponent(effectiveRedirect)}`
    : redirectTo || BRAND.siteUrl;

  let emailContent: { subject: string; html: string };

  switch (emailAction) {
    case "signup":
    case "confirmation":
      emailContent = verifyEmail(token, confirmUrl, userEmail);
      break;
    case "recovery":
    case "reset":
      emailContent = resetPasswordEmail(token, confirmUrl);
      break;
    case "email_change":
    case "email_change_current":
    case "email_change_new":
      emailContent = emailChangeEmail(token, email_data?.new_email || userEmail, confirmUrl);
      break;
    case "magic_link":
      emailContent = {
        subject: `Sign in to ${BRAND.name}`,
        html: baseLayout("Sign In", `
          <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">Sign in to ${BRAND.name}</h2>
          <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Click the button below to sign in to your account.
          </p>
          ${buttonHtml("Sign In", confirmUrl)}
          <p style="color:#a1a1aa;font-size:12px;text-align:center;margin:16px 0 0;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
        `),
      };
      break;
    case "reauthentication":
      emailContent = otpEmail(token, userEmail);
      break;
    default:
      emailContent = verifyEmail(token, confirmUrl, userEmail);
  }

  // Auth emails always come from donotreply@
  const result = await sendEmail(userEmail, emailContent.subject, emailContent.html, BRAND.noReplyFrom);

  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Direct Email Endpoint ─────────────────────────────────────────────

async function handleDirectEmail(body: any): Promise<Response> {
  const { type, to, data = {} } = body;

  if (!to || !type) {
    return new Response(JSON.stringify({ error: "Missing 'to' and 'type'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let emailContent: { subject: string; html: string };
  // Use support@ for support-related emails, donotreply@ for everything else
  const supportTypes = ["account-change", "subscription", "billing-receipt"];
  const fromAddress = supportTypes.includes(type) ? BRAND.supportFrom : BRAND.noReplyFrom;

  switch (type) {
    case "welcome":
      emailContent = welcomeEmail(data.name || "");
      break;
    case "verify":
      emailContent = verifyEmail(data.token || "", data.redirect_url || "", to);
      break;
    case "otp":
      emailContent = otpEmail(data.token || "", to);
      break;
    case "reset-password":
      emailContent = resetPasswordEmail(data.token || "", data.redirect_url || "");
      break;
    case "email-change":
      emailContent = emailChangeEmail(data.token || "", data.new_email || to, data.redirect_url || "");
      break;
    case "account-change":
      emailContent = accountChangeEmail(data.change_type || "Update", data.details || "Your account was updated.");
      break;
    case "subscription":
      emailContent = subscriptionEmail(data.plan_name || "Premium", data.status || "active", data.period_end);
      break;
    case "billing-receipt":
      emailContent = billingReceiptEmail(
        data.amount || "$0.00",
        data.plan_name || "Premium",
        data.invoice_date || new Date().toLocaleDateString(),
        data.invoice_url,
      );
      break;
    case "marketing":
      emailContent = marketingEmail(
        data.subject || `News from ${BRAND.name}`,
        data.heading || "What's New",
        data.body || "",
        data.cta_text,
        data.cta_url,
      );
      break;
    default:
      return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }

  const result = await sendEmail(to, emailContent.subject, emailContent.html, fromAddress);

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Main Server ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // If this is a Supabase Auth hook call (has user + email_data)
    if (body.user && body.email_data) {
      if (!isAuthorizedAuthHookRequest(req)) {
        console.warn("send-email: unauthorized auth-hook send attempt rejected");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await handleAuthHook(body);
    }

    // Otherwise, it's a direct API call — this path is an open mail relay
    // without an explicit internal credential, so require one.
    if (!isAuthorizedDirectRequest(req)) {
      console.warn("send-email: unauthorized direct send attempt rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return await handleDirectEmail(body);
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Email Templates ─────────────────────────────────────────────────────

const BRAND = {
  name: "ResumePreps",
  color: "#6366f1", // indigo-500
  colorDark: "#4f46e5", // indigo-600
  logo: "https://resumepreps.com/lovable-uploads/bb2d8416-e498-4920-8c1e-e0cca5eaa52d.png",
  supportEmail: "support@resumepreps.com",
  siteUrl: "https://resumepreps.com",
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
  return {
    subject,
    html: baseLayout(heading, `
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:700;">${heading}</h2>
      <div style="color:#3f3f46;font-size:15px;line-height:1.7;margin:0 0 24px;">
        ${body}
      </div>
      ${ctaText && ctaUrl ? buttonHtml(ctaText, ctaUrl) : ""}
      <p style="color:#a1a1aa;font-size:11px;text-align:center;margin:16px 0 0;">
        You're receiving this because you signed up for ${BRAND.name}.
        <a href="${BRAND.siteUrl}/settings" style="color:#6366f1;">Unsubscribe</a>
      </p>
    `),
  };
}

// ── Send via Resend ────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string, from?: string): Promise<{ success: boolean; error?: string; id?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY not set");
    return { success: false, error: "Email service not configured" };
  }

  const fromAddress = from || `${BRAND.name} <noreply@${Deno.env.get("RESEND_DOMAIN") || "resumepreps.com"}>`;

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
  const confirmUrl = tokenHash
    ? `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=${emailAction}&redirect_to=${encodeURIComponent(redirectTo || BRAND.siteUrl + "/home")}`
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

  const result = await sendEmail(userEmail, emailContent.subject, emailContent.html);

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

  const result = await sendEmail(to, emailContent.subject, emailContent.html);

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
      return await handleAuthHook(body);
    }

    // Otherwise, it's a direct API call
    return await handleDirectEmail(body);
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

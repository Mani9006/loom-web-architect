import { supabase } from "@/integrations/supabase/client";

export type EmailType =
  | "welcome"
  | "verify"
  | "otp"
  | "reset-password"
  | "email-change"
  | "account-change"
  | "subscription"
  | "billing-receipt"
  | "marketing";

interface SendEmailParams {
  type: EmailType;
  to: string;
  data?: Record<string, string | undefined>;
}

/**
 * Sends a transactional email via the send-email edge function.
 *
 * Auth emails (verify, reset, OTP) are automatically handled by the
 * Supabase Auth hook — this function is for other transactional emails
 * triggered by app events (welcome, account changes, subscription, billing).
 */
export async function sendEmail({ type, to, data }: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: result, error } = await supabase.functions.invoke("send-email", {
      body: { type, to, data },
    });

    if (error) {
      console.error("sendEmail error:", error);
      return { success: false, error: error.message };
    }

    return result as { success: boolean; error?: string };
  } catch (err) {
    console.error("sendEmail exception:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send a welcome email to a new user.
 */
export function sendWelcomeEmail(email: string, name: string): Promise<{ success: boolean; error?: string }> {
  return sendEmail({ type: "welcome", to: email, data: { name } });
}

/**
 * Send a subscription confirmation/update email.
 */
export function sendSubscriptionEmail(
  email: string,
  planName: string,
  status: string,
  periodEnd?: string,
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    type: "subscription",
    to: email,
    data: { plan_name: planName, status, period_end: periodEnd },
  });
}

/**
 * Send a billing receipt email.
 */
export function sendBillingReceiptEmail(
  email: string,
  amount: string,
  planName: string,
  invoiceDate: string,
  invoiceUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    type: "billing-receipt",
    to: email,
    data: { amount, plan_name: planName, invoice_date: invoiceDate, invoice_url: invoiceUrl },
  });
}

/**
 * Send an account change notification email.
 */
export function sendAccountChangeEmail(
  email: string,
  changeType: string,
  details: string,
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    type: "account-change",
    to: email,
    data: { change_type: changeType, details },
  });
}

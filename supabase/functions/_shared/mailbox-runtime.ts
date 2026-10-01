// Runtime glue shared by the hosted-mailbox edge functions (Deno only; not
// imported by vitest).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

export interface MailboxConfig {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  mailboxDomain: string;
  forwardFrom: string;
  resendApiKey: string;
  webhookSecret: string;
}

/**
 * Read the feature's configuration. Returns null when anything required is
 * missing so callers answer 503 and the feature stays inert until the owner
 * sets MAILBOX_DOMAIN, MAILBOX_FORWARD_FROM, RESEND_API_KEY and
 * RESEND_WEBHOOK_SECRET.
 */
export function readMailboxConfig(): MailboxConfig | null {
  const config: MailboxConfig = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
    mailboxDomain: (Deno.env.get("MAILBOX_DOMAIN") || "").trim().toLowerCase(),
    forwardFrom: (Deno.env.get("MAILBOX_FORWARD_FROM") || "").trim(),
    resendApiKey: Deno.env.get("RESEND_API_KEY") || "",
    webhookSecret: Deno.env.get("RESEND_WEBHOOK_SECRET") || "",
  };
  return Object.values(config).every(Boolean) ? config : null;
}

export const unavailable = () =>
  json({ error: "The application address isn't available yet.", code: "MAILBOX_UNAVAILABLE" }, 503);

export function adminClient(config: MailboxConfig) {
  return createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false } });
}

/** Resolve the signed-in caller from the bearer token; null when signed out. */
export async function authenticatedUser(req: Request, config: MailboxConfig) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const authClient = createClient(config.supabaseUrl, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user ?? null;
}

export function mailboxAddress(row: { local_part: string; domain: string }): string {
  return `${row.local_part}@${row.domain}`;
}

/** Public shape returned to the client (never includes internal ids). */
export function presentMailbox(row: any) {
  return {
    address: mailboxAddress(row),
    local_part: row.local_part,
    domain: row.domain,
    forward_to: row.forward_to,
    forward_verified: Boolean(row.forward_verified_at),
    forwarding_enabled: Boolean(row.forwarding_enabled),
    status: row.status,
  };
}

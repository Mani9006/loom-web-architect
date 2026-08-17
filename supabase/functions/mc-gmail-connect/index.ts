import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSignedState } from "../_shared/oauth-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

function resolveReturnTo(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string" || !candidate.trim()) return fallback;
  try {
    const parsed = new URL(candidate);
    const trustedHost = parsed.hostname === "resumepreps.com" ||
      parsed.hostname === "www.resumepreps.com" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.endsWith(".vercel.app");
    const trustedProtocol = parsed.protocol === "https:" ||
      ((parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && parsed.protocol === "http:");
    if (!trustedHost || !trustedProtocol) return fallback;
    // Preserve the caller's actual path (e.g. a My Collection session's
    // Inbox tab) instead of always bouncing to the standalone /inbox page —
    // host/protocol are already validated above, so the path is safe to keep.
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/inbox";
    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return fallback;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI") || "";
    const stateSecret = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey || !googleClientId || !redirectUri || !stateSecret) {
      return json({ error: "Inbox connection is temporarily unavailable", code: "INBOX_UNAVAILABLE" }, 503);
    }

    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in to connect your inbox", code: "AUTH_REQUIRED" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Sign in to connect your inbox", code: "AUTH_REQUIRED" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!sessionId) return json({ error: "Choose an application workspace first", code: "SESSION_REQUIRED" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: session } = await admin
      .from("mc_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session) return json({ error: "Application workspace not found", code: "SESSION_NOT_FOUND" }, 404);

    const state = await createSignedState({
      session_id: sessionId,
      user_id: user.id,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
      nonce: crypto.randomUUID(),
      return_to: resolveReturnTo(body?.return_to, Deno.env.get("APP_BASE_URL") || "https://www.resumepreps.com"),
    }, stateSecret);

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });

    return json({ auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (error) {
    console.error("mc-gmail-connect", error);
    return json({ error: "Inbox connection could not be started", code: "INBOX_CONNECT_FAILED" }, 500);
  }
});

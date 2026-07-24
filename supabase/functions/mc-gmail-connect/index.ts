import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createOpaqueOAuthState,
  hashOpaqueOAuthState,
} from "../_shared/oauth-crypto.ts";
import { resolveInboxReturnTo } from "../_shared/oauth-return-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI") || "";
    if (!supabaseUrl || !anonKey || !serviceKey || !googleClientId || !redirectUri) {
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

    // Only this 256-bit bearer value crosses the browser/Google boundary.
    // User, workspace, redirect, and expiry stay server-side behind a
    // service-only RPC; the database persists only the state's SHA-256 hash.
    const state = createOpaqueOAuthState();
    const stateHash = await hashOpaqueOAuthState(state);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const returnTo = resolveInboxReturnTo(
      body?.return_to,
      Deno.env.get("APP_BASE_URL") || "https://www.resumepreps.com",
    );
    const { error: stateStoreError } = await admin.rpc("mc_create_gmail_oauth_state", {
      p_state_hash: stateHash,
      p_user_id: user.id,
      p_session_id: sessionId,
      p_return_to: returnTo,
      p_expires_at: expiresAt,
    });
    if (stateStoreError) {
      console.error("mc-gmail-connect state store", stateStoreError.code);
      return json({ error: "Inbox connection could not be started", code: "INBOX_CONNECT_FAILED" }, 500);
    }

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

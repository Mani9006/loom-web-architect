import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  gmailPollFailureHealth,
  gmailPollSuccessHealth,
} from "../_shared/gmail-poll-failure.ts";
import {
  encryptSecret,
  hashOpaqueOAuthState,
} from "../_shared/oauth-crypto.ts";

interface OAuthStateRecord {
  session_id: string;
  user_id: string;
  return_to: string;
}

function safeRedirect(baseUrl: string, path: string, params: Record<string, string>): Response {
  let url: URL;
  try {
    url = new URL(path, baseUrl);
  } catch {
    url = new URL(path, "https://www.resumepreps.com");
  }
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return Response.redirect(url.toString(), 302);
}

serve(async (req) => {
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://resumepreps.com";
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const stateRaw = requestUrl.searchParams.get("state") || "";
  const providerError = requestUrl.searchParams.get("error");

  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI") || "";
  const encryptionKey = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!stateRaw || !supabaseUrl || !serviceKey) {
    return safeRedirect(appBaseUrl, "/inbox", { inbox: "unavailable" });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let state: OAuthStateRecord | null = null;
  try {
    const stateHash = await hashOpaqueOAuthState(stateRaw);
    const { data: stateRows, error: stateError } = await admin.rpc(
      "mc_consume_gmail_oauth_state",
      { p_state_hash: stateHash },
    );
    if (stateError) throw stateError;
    state = Array.isArray(stateRows)
      ? (stateRows[0] as OAuthStateRecord | undefined) ?? null
      : null;
  } catch (error) {
    console.error("mc-gmail-callback state", error);
  }
  if (!state?.session_id || !state?.user_id || !state?.return_to) {
    return safeRedirect(appBaseUrl, "/inbox", { inbox: "invalid_link" });
  }

  const redirectBase = state.return_to;
  if (providerError) {
    return safeRedirect(redirectBase, "/inbox", { inbox: "cancelled" });
  }
  if (!code || !googleClientId || !googleClientSecret || !redirectUri || !encryptionKey) {
    return safeRedirect(redirectBase, "/inbox", { inbox: "unavailable" });
  }

  const { data: session } = await admin
    .from("mc_sessions")
    .select("id")
    .eq("id", state.session_id)
    .eq("user_id", state.user_id)
    .neq("status", "deleted")
    .maybeSingle();
  if (!session) return safeRedirect(appBaseUrl, "/inbox", { inbox: "invalid_link" });

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error(`oauth_exchange_${tokenResponse.status}`);

    const tokens = await tokenResponse.json();
    if (!tokens.access_token || !tokens.expires_in) {
      throw new Error("oauth_tokens_incomplete");
    }

    // Google can omit refresh_token when the user has already granted this
    // client access. Reuse the encrypted refresh token from the existing
    // connection instead of requiring a destructive disconnect/reconnect.
    let existingRefreshCiphertext: string | null = null;
    if (!tokens.refresh_token) {
      const { data: existingConnection } = await admin
        .from("mc_gmail_connections")
        .select("id")
        .eq("session_id", state.session_id)
        .eq("user_id", state.user_id)
        .maybeSingle();
      if (existingConnection?.id) {
        const { data: existingTokens } = await admin.rpc("mc_get_gmail_tokens", {
          p_connection_id: existingConnection.id,
        });
        existingRefreshCiphertext = existingTokens?.[0]?.refresh_ciphertext || null;
      }
      if (!existingRefreshCiphertext) throw new Error("oauth_refresh_token_missing");
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error(`oauth_profile_${profileResponse.status}`);
    const profile = await profileResponse.json();
    if (!profile?.email) throw new Error("oauth_profile_incomplete");

    const expiresAt = new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString();
    const { data: connection, error: connectionError } = await admin
      .from("mc_gmail_connections")
      .upsert({
        user_id: state.user_id,
        session_id: state.session_id,
        gmail_email: profile.email,
        token_expires_at: expiresAt,
        scopes: String(tokens.scope || "").split(" ").filter(Boolean),
        ...gmailPollSuccessHealth(),
      }, { onConflict: "session_id" })
      .select("id")
      .single();
    if (connectionError || !connection) throw new Error("connection_store_failed");

    const [accessCiphertext, refreshCiphertext] = await Promise.all([
      encryptSecret(tokens.access_token, encryptionKey),
      tokens.refresh_token
        ? encryptSecret(tokens.refresh_token, encryptionKey)
        : Promise.resolve(existingRefreshCiphertext),
    ]);
    const { error: tokenStoreError } = await admin.rpc("mc_store_gmail_tokens", {
      p_connection_id: connection.id,
      p_access_ciphertext: accessCiphertext,
      p_refresh_ciphertext: refreshCiphertext,
    });
    if (tokenStoreError) {
      const failureHealth = gmailPollFailureHealth(
        "secure_tokens_missing",
        0,
        new Date().toISOString(),
      );
      await admin
        .from("mc_gmail_connections")
        .update(failureHealth.update)
        .eq("id", connection.id)
        .eq("user_id", state.user_id)
        .eq("session_id", state.session_id);
      throw new Error("token_store_failed");
    }

    return safeRedirect(redirectBase, "/inbox", { inbox: "connected" });
  } catch (error) {
    console.error("mc-gmail-callback", error);
    return safeRedirect(redirectBase, "/inbox", { inbox: "connect_failed" });
  }
});

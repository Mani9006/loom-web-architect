// supabase/functions/mc-gmail-callback/index.ts
// Handles the redirect back from Google. Exchanges code for tokens, stores in mc_gmail_connections.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL")!; // e.g. https://resumepreps.io

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !stateRaw) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=missing_params`, 302);
  }

  // Look up the one-time state token minted by mc-gmail-connect. It maps to
  // the (user_id, session_id) that requested this OAuth flow — we never put
  // the user's JWT in the state param, so there's nothing sensitive for
  // Google's redirect chain (history, Referer, proxy logs) to leak.
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: stateRow } = await supabaseAdmin
    .from("mc_gmail_oauth_state")
    .select("user_id, session_id, expires_at")
    .eq("token", stateRaw)
    .maybeSingle();

  // One-time use: consume it immediately regardless of outcome below.
  if (stateRow) {
    await supabaseAdmin.from("mc_gmail_oauth_state").delete().eq("token", stateRaw);
  }
  if (!stateRow || new Date(stateRow.expires_at) < new Date()) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=bad_state`, 302);
  }
  const session_id: string = stateRow.session_id;
  const user_id: string = stateRow.user_id;

  // 1. Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return Response.redirect(
      `${APP_BASE_URL}/my-collection?gmail_error=${encodeURIComponent(txt.slice(0, 80))}`,
      302
    );
  }
  const tokens = await tokenRes.json();

  // 2. Look up user's email
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();

  // 3. Persist the connection. We already verified ownership of session_id
  // when the state token was minted, so the service-role client (no user
  // JWT available at this point — by design) is safe to use here.
  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await supabaseAdmin
    .from("mc_gmail_connections")
    .upsert({
      user_id,
      session_id,
      gmail_email: profile.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expires_at,
      scopes: tokens.scope.split(" "),
      enabled: true,
    }, { onConflict: "session_id" });

  if (dbError) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=${encodeURIComponent(dbError.message)}`, 302);
  }

  return Response.redirect(`${APP_BASE_URL}/my-collection/${session_id}?gmail_connected=1`, 302);
});

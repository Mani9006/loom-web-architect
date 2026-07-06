// supabase/functions/mc-gmail-callback/index.ts
// Handles the redirect back from Google. Exchanges code for tokens, stores in mc_gmail_connections.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL")!; // e.g. https://resumepreps.io
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// OAuth state tokens expire after 10 minutes — plenty of time for a user to
// complete the Google consent screen, short enough to bound replay risk if a
// state value ever leaked before being consumed.
const STATE_TTL_MS = 10 * 60 * 1000;

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=missing_params`, 302);
  }

  // Resolve the single-use state token minted by mc-gmail-connect back to
  // (user_id, session_id), then delete it so it can never be replayed.
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, SUPABASE_SERVICE_ROLE_KEY);
  const { data: stateRow } = await serviceClient
    .from("mc_oauth_state")
    .select("user_id,session_id,created_at")
    .eq("state", state)
    .maybeSingle();
  if (stateRow) {
    await serviceClient.from("mc_oauth_state").delete().eq("state", state);
  }
  if (!stateRow || Date.now() - new Date(stateRow.created_at).getTime() > STATE_TTL_MS) {
    return Response.redirect(`${APP_BASE_URL}/my-collection?gmail_error=bad_state`, 302);
  }
  const { user_id, session_id } = stateRow;

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

  // 3. Persist using the service-role client — the state token already
  // proved this request belongs to user_id, so we no longer need (or want)
  // a live user JWT in hand for this.
  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await serviceClient
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

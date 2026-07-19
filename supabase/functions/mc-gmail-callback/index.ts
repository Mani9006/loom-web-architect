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

  // `state` is the single-use opaque token minted by mc-gmail-connect —
  // look it up (and consume it) to recover which user/session this
  // authorization is for. Using the service role here is intentional and
  // safe: the token itself, not a bearer JWT, is the proof of ownership,
  // and it can only be spent once.
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: stateRow, error: stateErr } = await svc
    .from("mc_gmail_oauth_state")
    .select("user_id, session_id, expires_at")
    .eq("token", stateRaw)
    .maybeSingle();

  // Consume immediately so the token can't be replayed even if something
  // below fails.
  if (stateRow) {
    await svc.from("mc_gmail_oauth_state").delete().eq("token", stateRaw);
  }

  if (stateErr || !stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
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

  // 3. Persist. The token lookup above already proved ownership of
  // user_id/session_id, so writing via the service role client here (rather
  // than needing a bearer JWT for this unauthenticated redirect request) is
  // safe.
  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await svc
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

// supabase/functions/mc-gmail-connect/index.ts
// Initiates Gmail OAuth flow for a session.
// Returns { auth_url } that the frontend redirects the user to.
// After user authorizes, Google redirects to mc-gmail-callback.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!; // e.g. https://<your-domain>/api/mc-gmail-callback
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Authenticate the caller and confirm they own this session before we
    // hand out an OAuth URL for it — session_id is otherwise just a UUID
    // an attacker could guess/observe and attach their own Gmail to.
    const auth = req.headers.get("authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data: session, error: sessionErr } = await supabase
      .from("mc_sessions")
      .select("id")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // The state param is an opaque one-time token, not the user's JWT — it
    // never leaves our own database, so it's safe to round-trip through
    // Google's redirect (browser history, Referer headers, proxy logs).
    const { data: stateRow, error: stateErr } = await supabase
      .from("mc_gmail_oauth_state")
      .insert({ user_id: user.id, session_id })
      .select("token")
      .single();
    if (stateErr || !stateRow) {
      return new Response(JSON.stringify({ error: stateErr?.message ?? "Could not start OAuth flow" }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const state = stateRow.token as string;

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const auth_url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return new Response(JSON.stringify({ auth_url }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});

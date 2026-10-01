// Creates the caller's hosted application mailbox (idempotent).
//
// POST (JWT) → { mailbox: { address, forward_to, forward_verified, forwarding_enabled, status } }
//
// local_part = slug of the profile's first name (a-z0-9, 3–24 chars), with the
// smallest numeric suffix that makes it unique and avoids reserved words.
// forward_to defaults to the login email and is pre-verified (the user proved
// ownership of it when signing in).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  fallbackLocalBase,
  isAllowedForwardTarget,
  pickLocalPart,
  slugifyFirstName,
} from "../_shared/hosted-mailbox.ts";
import {
  adminClient,
  authenticatedUser,
  corsHeaders,
  json,
  presentMailbox,
  readMailboxConfig,
  unavailable,
} from "../_shared/mailbox-runtime.ts";

const MAILBOX_COLUMNS = "local_part,domain,forward_to,forward_verified_at,forwarding_enabled,status";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = readMailboxConfig();
  if (!config) return unavailable();

  const user = await authenticatedUser(req, config);
  if (!user) return json({ error: "Sign in to get your application address.", code: "AUTH_REQUIRED" }, 401);

  const admin = adminClient(config);
  const { data: existing, error: existingError } = await admin
    .from("user_mailboxes")
    .select(MAILBOX_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) {
    console.error("mailbox-provision load", existingError.code);
    return json({ error: "Your application address couldn't be created. Try again.", code: "MAILBOX_FAILED" }, 500);
  }
  if (existing) return json({ mailbox: presentMailbox(existing), created: false });

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const metadataName = String(user.user_metadata?.full_name || user.user_metadata?.name || "");
  const base = slugifyFirstName(profile?.full_name) || slugifyFirstName(metadataName) || fallbackLocalBase(user.email);

  const loginEmail = String(user.email || "").trim().toLowerCase();
  const canForward = Boolean(loginEmail) && isAllowedForwardTarget(loginEmail, config.mailboxDomain);

  // Retry a few times: two users with the same first name can race for the
  // same suffix; the UNIQUE constraint decides and we pick again.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: takenRows, error: takenError } = await admin
      .from("user_mailboxes")
      .select("local_part")
      .like("local_part", `${base}%`)
      .limit(10_000);
    if (takenError) {
      console.error("mailbox-provision taken", takenError.code);
      break;
    }
    const localPart = pickLocalPart(base, (takenRows ?? []).map((row: any) => String(row.local_part)));
    const now = new Date().toISOString();
    const { data: created, error: insertError } = await admin
      .from("user_mailboxes")
      .insert({
        user_id: user.id,
        local_part: localPart,
        domain: config.mailboxDomain,
        forward_to: canForward ? loginEmail : null,
        forward_verified_at: canForward ? now : null,
        forwarding_enabled: true,
        status: "active",
      })
      .select(MAILBOX_COLUMNS)
      .single();
    if (!insertError && created) return json({ mailbox: presentMailbox(created), created: true });

    if (insertError?.code === "23505") {
      // Either the local part was just taken, or a parallel request created
      // this user's mailbox. Return the latter; otherwise pick again.
      const { data: raced } = await admin
        .from("user_mailboxes")
        .select(MAILBOX_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle();
      if (raced) return json({ mailbox: presentMailbox(raced), created: false });
      continue;
    }
    console.error("mailbox-provision insert", insertError?.code);
    break;
  }

  return json({ error: "Your application address couldn't be created. Try again.", code: "MAILBOX_FAILED" }, 500);
});

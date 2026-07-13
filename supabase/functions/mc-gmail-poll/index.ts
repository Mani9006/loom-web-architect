// supabase/functions/mc-gmail-poll/index.ts
// Cron-triggered: every 15 minutes, polls all enabled mc_gmail_connections,
// fetches new emails since last_polled_at, classifies each with Haiku 4.5,
// matches to mc_tracked_jobs by company name, writes mc_inbound_emails,
// auto-updates kanban status if confidence high enough.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const STATUS_MAP: Record<string, string> = {
  confirmation: "viewed",
  interview_invite: "interview",
  take_home: "take_home",
  reject: "rejected",
  offer: "offer",
};

interface ClassifiedEmail {
  classification: keyof typeof STATUS_MAP | "other_recruiter" | "irrelevant";
  confidence: number;
  summary: string;
  next_action?: string;
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // 1. Find all enabled connections to poll
  const { data: connections, error } = await supabase
    .from("mc_gmail_connections")
    .select("*")
    .eq("enabled", true);

  if (error || !connections) {
    return new Response(JSON.stringify({ error: error?.message }), { status: 500 });
  }

  const results = [];
  for (const conn of connections) {
    try {
      const r = await pollOne(supabase, conn);
      results.push({ session_id: conn.session_id, ...r });
    } catch (e) {
      results.push({
        session_id: conn.session_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return new Response(JSON.stringify({ polled: results.length, results }), {
    headers: { "content-type": "application/json" },
  });
});

async function pollOne(supabase: any, conn: any) {
  // Refresh access token if expired
  let accessToken = conn.access_token;
  if (new Date(conn.token_expires_at).getTime() < Date.now() + 60000) {
    accessToken = await refreshAccessToken(conn.refresh_token);
    await supabase
      .from("mc_gmail_connections")
      .update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + 3500 * 1000).toISOString(),
      })
      .eq("id", conn.id);
  }

  // Fetch tracked jobs for this session — we'll match emails to them.
  // Exclude trashed cards so an incoming email can't silently move a job
  // the user has already deleted.
  const { data: trackedJobs } = await supabase
    .from("mc_tracked_jobs")
    .select("id,company,job_title,status")
    .eq("session_id", conn.session_id)
    .is("deleted_at", null);

  // Fetch new email IDs from Gmail
  const sinceTs = conn.last_polled_at ? Math.floor(new Date(conn.last_polled_at).getTime() / 1000) : 0;
  const query = sinceTs ? `after:${sinceTs}` : `newer_than:7d`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${await listRes.text()}`);
  const list = await listRes.json();
  const messages = list.messages ?? [];

  let processed = 0;
  let auto_moved = 0;
  for (const m of messages) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();

    const headers: Record<string, string> = {};
    (msg.payload?.headers ?? []).forEach((h: any) => (headers[h.name.toLowerCase()] = h.value));
    const subject = headers["subject"] ?? "";
    const fromEmail = headers["from"] ?? "";
    const snippet = msg.snippet ?? "";
    const bodyText = extractBody(msg.payload) || snippet;

    // Skip if we've already processed this message
    const { data: existing } = await supabase
      .from("mc_inbound_emails")
      .select("id")
      .eq("message_id", m.id)
      .maybeSingle();
    if (existing) continue;

    // Match to a tracked job by company name appearing in subject or from-domain
    const matched = (trackedJobs ?? []).find((tj: any) => {
      const co = tj.company.toLowerCase();
      return (
        subject.toLowerCase().includes(co) ||
        fromEmail.toLowerCase().includes(co) ||
        bodyText.toLowerCase().includes(tj.job_title.toLowerCase())
      );
    });
    if (!matched) continue; // not relevant to this session

    // Classify with Haiku
    const classified = await classifyEmail({ subject, from: fromEmail, body: bodyText });
    if (!classified) continue;

    const { data: emailRow } = await supabase
      .from("mc_inbound_emails")
      .insert({
        user_id: conn.user_id,
        session_id: conn.session_id,
        tracked_job_id: matched.id,
        message_id: m.id,
        from_email: fromEmail,
        subject,
        body_preview: snippet.slice(0, 500),
        body_full: bodyText.slice(0, 8000),
        classification: classified.classification,
        classification_confidence: classified.confidence,
        classification_summary: classified.summary,
        next_action: classified.next_action,
        parsed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    processed++;

    // Auto-move kanban if confidence high
    const newStatus = STATUS_MAP[classified.classification];
    if (newStatus && classified.confidence >= 0.7 && newStatus !== matched.status) {
      await supabase.from("mc_tracked_jobs").update({ status: newStatus }).eq("id", matched.id);
      await supabase.from("mc_status_history").insert({
        tracked_job_id: matched.id,
        user_id: conn.user_id,
        status_from: matched.status,
        status_to: newStatus,
        source: "email",
        email_id: emailRow?.id,
      });
      auto_moved++;
    }
  }

  await supabase
    .from("mc_gmail_connections")
    .update({ last_polled_at: new Date().toISOString() })
    .eq("id", conn.id);

  return { processed, auto_moved };
}

async function refreshAccessToken(refresh_token: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  return j.access_token;
}

function extractBody(part: any): string {
  if (!part) return "";
  if (part.body?.data) {
    return atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  }
  if (part.parts) {
    for (const p of part.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  return "";
}

async function classifyEmail({
  subject,
  from,
  body,
}: {
  subject: string;
  from: string;
  body: string;
}): Promise<ClassifiedEmail | null> {
  const prompt = `Classify this email about a job application.

From: ${from}
Subject: ${subject}
Body: ${body.slice(0, 2500)}

Output JSON only:
{
  "classification": "confirmation" | "interview_invite" | "take_home" | "reject" | "offer" | "other_recruiter" | "irrelevant",
  "confidence": 0.0-1.0,
  "summary": "<5-15 word summary>",
  "next_action": "<optional 1-line suggested action>"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

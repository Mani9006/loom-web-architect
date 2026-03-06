import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "rp_analytics_session_id";
const LAST_PAGEVIEW_KEY = "rp_last_pageview";
const PAGEVIEW_DEDUPE_MS = 8000;

type UntypedSupabase = {
  from: (table: string) => {
    insert: (value: unknown) => Promise<{ error: { code?: string; message: string } | null }>;
  };
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
};

const sb = supabase as unknown as UntypedSupabase;

let cachedUserId: string | null | undefined;
let cachedUserTs = 0;

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function detectDeviceType(): "Desktop" | "Mobile" | "Tablet" | "Other" {
  const ua = navigator.userAgent || "";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|android|iphone|ipod/i.test(ua)) return "Mobile";
  if (ua) return "Desktop";
  return "Other";
}

function detectCountry(): string {
  const locale = navigator.language || "";
  const region = locale.split("-")[1] || "";
  if (/^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  return "Unknown";
}

export function getAnalyticsSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId();
    localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

async function getCurrentUserId(): Promise<string | null> {
  const now = Date.now();
  if (cachedUserId !== undefined && now - cachedUserTs < 45_000) return cachedUserId;

  try {
    const { data } = await sb.auth.getUser();
    cachedUserId = data.user?.id || null;
    cachedUserTs = now;
    return cachedUserId;
  } catch {
    cachedUserId = null;
    cachedUserTs = now;
    return null;
  }
}

type TrackEventOptions = {
  path?: string;
  referrer?: string | null;
  source?: string;
  userId?: string | null;
  dedupeKey?: string;
};

export async function trackProductEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  options: TrackEventOptions = {},
): Promise<void> {
  try {
    const sessionId = getAnalyticsSessionId();
    const userId = options.userId !== undefined ? options.userId : await getCurrentUserId();
    const path = options.path ?? `${window.location.pathname}${window.location.search || ""}`;
    const referrer = options.referrer ?? (document.referrer || null);
    const enriched = {
      ...properties,
      device_type: detectDeviceType(),
      country: detectCountry(),
      language: navigator.language || "unknown",
    };

    const { error } = await sb.from("product_analytics_events").insert({
      session_id: sessionId,
      user_id: userId,
      event_name: eventName,
      path,
      referrer,
      source: options.source || "web",
      properties: enriched,
    });

    if (error && error.code !== "42P01") {
      console.warn("Analytics event insert failed:", error.message);
    }
  } catch {
    // Never break UX for analytics write failures.
  }
}

export function trackPageView(path: string): void {
  try {
    const now = Date.now();
    const payload = localStorage.getItem(LAST_PAGEVIEW_KEY);
    if (payload) {
      const parsed = JSON.parse(payload) as { path: string; ts: number };
      if (parsed.path === path && now - parsed.ts < PAGEVIEW_DEDUPE_MS) return;
    }
    localStorage.setItem(LAST_PAGEVIEW_KEY, JSON.stringify({ path, ts: now }));
  } catch {
    // ignore localStorage errors
  }

  void trackProductEvent("page_view", {}, { path });
}

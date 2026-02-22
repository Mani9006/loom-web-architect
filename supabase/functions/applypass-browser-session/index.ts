import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "create" | "inspect" | "close" | "open-url";

type BrowserSession = {
  provider: "browserbase";
  sessionId: string;
  status?: string;
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
  wsUrl?: string;
  pages: Array<{
    id: string;
    url?: string;
    title?: string;
    debuggerUrl?: string;
    debuggerFullscreenUrl?: string;
  }>;
  createdAt: string;
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function navigateSessionToUrl(wsUrl: string, targetUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 12_000;
    let settled = false;
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // Ignore close errors.
      }
      reject(new Error("Timed out while opening target URL in cloud browser."));
    }, timeoutMs);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // Ignore close errors.
      }
      if (error) reject(error);
      else resolve();
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Target.createTarget",
          params: { url: targetUrl },
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { id?: number; error?: { message?: string } };
        if (payload.id !== 1) return;
        if (payload.error?.message) {
          finish(new Error(`Cloud browser navigation failed: ${payload.error.message}`));
          return;
        }
        finish();
      } catch {
        // Ignore unrelated socket messages.
      }
    };

    ws.onerror = () => {
      finish(new Error("Cloud browser websocket error while opening target URL."));
    };

    ws.onclose = () => {
      if (!settled) {
        finish(new Error("Cloud browser websocket closed before navigation completed."));
      }
    };
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function browserbaseFetch(path: string, init: RequestInit = {}) {
  const apiKey = env("BROWSERBASE_API_KEY");
  const response = await fetch(`https://api.browserbase.com${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const parsed = asObject(data);
  if (!response.ok) {
    const message =
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.error === "string" && parsed.error) ||
      (typeof parsed.detail === "string" && parsed.detail) ||
      text.slice(0, 300);
    throw new Error(`Browserbase API ${response.status}: ${message}`);
  }

  return parsed;
}

function normalizeSession(created: Record<string, unknown>, debugData?: Record<string, unknown>): BrowserSession {
  const live = asObject(debugData);
  const createdAt =
    (typeof created.createdAt === "string" && created.createdAt) ||
    (typeof created.created_at === "string" && created.created_at) ||
    new Date().toISOString();

  const pagesRaw = Array.isArray(live.pages) ? live.pages : [];
  const pages = pagesRaw.map((entry, idx) => {
    const page = asObject(entry);
    return {
      id: String(page.id || `page-${idx + 1}`),
      url: typeof page.url === "string" ? page.url : undefined,
      title: typeof page.title === "string" ? page.title : undefined,
      debuggerUrl: typeof page.debuggerUrl === "string" ? page.debuggerUrl : undefined,
      debuggerFullscreenUrl:
        typeof page.debuggerFullscreenUrl === "string" ? page.debuggerFullscreenUrl : undefined,
    };
  });
  const firstPage = pages[0];
  const preferredPage =
    pages.find((page) => typeof page.url === "string" && page.url && page.url !== "about:blank") || firstPage;

  return {
    provider: "browserbase",
    sessionId: String(created.id || ""),
    status: typeof created.status === "string" ? created.status : undefined,
    debuggerUrl:
      preferredPage?.debuggerUrl ||
      (typeof live.debuggerUrl === "string" && live.debuggerUrl) ||
      (typeof created.debuggerUrl === "string" ? created.debuggerUrl : undefined) ||
      firstPage?.debuggerUrl,
    debuggerFullscreenUrl:
      preferredPage?.debuggerFullscreenUrl ||
      preferredPage?.debuggerUrl ||
      (typeof live.debuggerFullscreenUrl === "string" && live.debuggerFullscreenUrl) ||
      (typeof created.debuggerFullscreenUrl === "string" ? created.debuggerFullscreenUrl : undefined) ||
      firstPage?.debuggerFullscreenUrl ||
      firstPage?.debuggerUrl,
    wsUrl:
      (typeof live.wsUrl === "string" && live.wsUrl) ||
      (typeof created.connectUrl === "string" && created.connectUrl) ||
      (typeof created.wsUrl === "string" ? created.wsUrl : undefined),
    pages,
    createdAt,
  };
}

async function getDebugData(sessionId: string): Promise<Record<string, unknown>> {
  try {
    return await browserbaseFetch(`/v1/sessions/${sessionId}/debug`, { method: "GET" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Fallback for older API variants.
    if (!message.includes("404")) throw error;
    return await browserbaseFetch(`/v1/sessions/${sessionId}/live-urls`, { method: "GET" });
  }
}

async function getSession(sessionId: string): Promise<Record<string, unknown>> {
  return await browserbaseFetch(`/v1/sessions/${sessionId}`, { method: "GET" });
}

function ensureUserOwnsSession(session: Record<string, unknown>, userId: string) {
  const metadata = asObject(session.userMetadata);
  const owner = typeof metadata.userId === "string" ? metadata.userId : "";
  if (!owner || owner !== userId) {
    throw new Error("Session does not belong to current user.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = env("SUPABASE_URL");
    const supabaseAnon = env("SUPABASE_ANON_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "create") as Action;
    const projectId = env("BROWSERBASE_PROJECT_ID");

    if (action === "create") {
      const region = Deno.env.get("BROWSERBASE_REGION") || "us-west-2";
      const initialUrl = typeof body.initialUrl === "string" ? body.initialUrl.trim() : "";
      const metadata = asObject(body.metadata);

      // Browserbase metadata only accepts short alphanumeric-ish values.
      // Drop URLs, long strings, special characters, null, etc.
      const safeMetadata: Record<string, string> = {
        userId: user.id,
        source: String(metadata.source || "applypass_workspace").slice(0, 50),
      };
      if (user.email) safeMetadata.userEmail = user.email;

      const created = await browserbaseFetch("/v1/sessions", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          region,
          keepAlive: true,
          userMetadata: safeMetadata,
        }),
      });

      const sessionId = String(created.id || "");
      if (!sessionId) throw new Error("Browserbase session creation returned no id.");

      let live = await getDebugData(sessionId);
      if (initialUrl && isHttpUrl(initialUrl) && typeof live.wsUrl === "string" && live.wsUrl) {
        try {
          await navigateSessionToUrl(live.wsUrl, initialUrl);
          // Allow Browserbase to register the new target before reading live URLs again.
          await new Promise((resolve) => setTimeout(resolve, 700));
          live = await getDebugData(sessionId);
        } catch {
          // Non-fatal: session is still usable manually.
        }
      }
      const session = normalizeSession(created, live);
      return jsonResponse({ ok: true, session });
    }

    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
      return jsonResponse({ error: "sessionId is required" }, 400);
    }

    const existing = await getSession(sessionId);
    ensureUserOwnsSession(existing, user.id);

    if (action === "inspect") {
      const live = await getDebugData(sessionId);
      const session = normalizeSession(existing, live);
      return jsonResponse({ ok: true, session });
    }

    if (action === "open-url") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!isHttpUrl(url)) {
        return jsonResponse({ error: "A valid http/https URL is required." }, 400);
      }

      const debug = await getDebugData(sessionId);
      const wsUrl = typeof debug.wsUrl === "string" ? debug.wsUrl : "";
      if (!wsUrl) {
        return jsonResponse({ error: "Cloud browser debug websocket URL unavailable for this session." }, 500);
      }

      await navigateSessionToUrl(wsUrl, url);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const live = await getDebugData(sessionId);
      const session = normalizeSession(existing, live);
      return jsonResponse({ ok: true, session });
    }

    if (action === "close") {
      const updated = await browserbaseFetch(`/v1/sessions/${sessionId}`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          status: "REQUEST_RELEASE",
        }),
      });

      return jsonResponse({
        ok: true,
        session: normalizeSession({ ...existing, ...updated }),
      });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

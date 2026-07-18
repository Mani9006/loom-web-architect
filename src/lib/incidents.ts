import { supabase } from "@/integrations/supabase/client";
import { getEnv } from "@/lib/env";

type IncidentSeverity = "warning" | "error" | "fatal";

type IncidentContext = {
  componentStack?: string;
  source?: "react" | "window" | "promise" | "manual";
  operation?: string;
};

type UntypedRpcClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ error: { code?: string; message: string } | null }>;
};

const sb = supabase as unknown as UntypedRpcClient;
const recentFingerprints = new Map<string, number>();
const CLIENT_DEDUPE_MS = 10_000;

function sanitize(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/(bearer\s+)[a-z0-9._~+/-]+=*/gi, "$1<redacted>")
    .replace(/\b(sk|eyJ)[A-Za-z0-9._-]{12,}\b/g, "<secret>")
    .replace(/([?&](?:token|key|code|password|secret)=)[^&\s]+/gi, "$1<redacted>")
    .slice(0, maxLength);
}
function hash(input: string): string {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return `web-${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return {
      message: sanitize(error.message || error.name || "Unknown error", 1000),
      stack: sanitize(error.stack || "", 6000),
    };
  }
  if (typeof error === "string") return { message: sanitize(error, 1000), stack: "" };
  return { message: "Unknown client error", stack: "" };
}

export async function captureIncident(
  error: unknown,
  context: IncidentContext = {},
  severity: IncidentSeverity = "error",
): Promise<void> {
  try {
    const normalized = normalizeError(error);
    const componentStack = sanitize(context.componentStack || "", 3000);
    const route = typeof window === "undefined" ? "/" : window.location.pathname;
    const fingerprint = hash(`${normalized.message}|${normalized.stack.split("\n").slice(0, 3).join("|")}|${context.operation || ""}`);
    const now = Date.now();
    if (now - (recentFingerprints.get(fingerprint) || 0) < CLIENT_DEDUPE_MS) return;
    recentFingerprints.set(fingerprint, now);

    const { error: writeError } = await sb.rpc("record_app_incident", {
      p_fingerprint: fingerprint,
      p_environment: getEnv(),
      p_release_sha: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || "unknown",
      p_severity: severity,
      p_route: route,
      p_message: normalized.message,
      p_stack_trace: normalized.stack || null,
      p_context: {
        source: context.source || "manual",
        operation: sanitize(context.operation || "", 120),
        component_stack: componentStack || undefined,
        online: typeof navigator === "undefined" ? undefined : navigator.onLine,
      },
    });

    if (writeError && writeError.code !== "PGRST202" && writeError.code !== "42501") {
      console.warn("Incident recorder unavailable:", writeError.message);
    }
  } catch {
    // Monitoring must never become another user-facing failure.
  }
}

export function installGlobalIncidentHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    void captureIncident(event.error || event.message, { source: "window" }, "fatal");
  });

  window.addEventListener("unhandledrejection", (event) => {
    void captureIncident(event.reason, { source: "promise" }, "error");
  });
}

/**
 * Shared request guards for career-ops edge functions.
 *   - getAuthedUser(req)      auth.uid() from JWT, or throws 401
 *   - enforceDailyCap(...)    reads ai_usage_daily, throws 429 if over
 *   - enforceAccountActive(..)reads user_access_controls, throws 402 if not
 *   - logAiUsage(...)         atomic increment after successful call
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CAPS = {
  free:  { evaluation: 20, tailor: 10, linkedin: 10, ats: 25, story: 15 },
  pro:   { evaluation: 200, tailor: 100, linkedin: 100, ats: 500, story: 150 },
};

export type UsageKind = "evaluation" | "tailor" | "linkedin" | "ats" | "story" | "draft_answers";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    },
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function getAuthedUser(req: Request): Promise<{ id: string; email: string | null }> {
  const auth = userClient(req);
  const { data, error } = await auth.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "unauthorized");
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Resolve a normal signed-in user, or an explicitly named user for a trusted
 * service-role worker. The service path is intentionally opt-in per request so
 * user-facing calls cannot impersonate another account by adding user_id.
 */
export async function getAuthedUserOrService(
  req: Request,
  serviceUserId?: string,
): Promise<{ id: string; email: string | null }> {
  if (serviceUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serviceUserId)) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (serviceRoleKey && token === serviceRoleKey) return { id: serviceUserId, email: null };
  }
  return getAuthedUser(req);
}

export async function enforceAccountActive(svc: SupabaseClient, userId: string): Promise<{ isPro: boolean }> {
  const { data } = await svc
    .from("user_access_controls")
    .select("account_status, subscription_plan, ai_features_enabled, purchase_state")
    .eq("user_id", userId)
    .maybeSingle();
  // Default to free + active if no row yet
  if (!data) return { isPro: false };
  if (data.account_status !== "active") throw new HttpError(402, "account not active");
  if (data.ai_features_enabled === false) throw new HttpError(402, "AI features disabled for this account");
  const isPro = Boolean(
    data.subscription_plan &&
    data.subscription_plan !== "free" &&
    ["trial", "active", "manual"].includes((data.purchase_state as string) ?? "")
  );
  return { isPro };
}

export async function enforceAutoApplyEntitlement(
  svc: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await svc
    .from("user_access_controls")
    .select("account_status, subscription_plan, purchase_state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HttpError(500, "unable to verify auto-apply entitlement");

  const plan = String(data?.subscription_plan || "free").toLowerCase();
  const purchaseState = String(data?.purchase_state || "").toLowerCase();
  const entitled = data?.account_status === "active"
    && ["autopilot", "premium"].includes(plan)
    && ["trial", "active", "manual"].includes(purchaseState);

  if (!entitled) throw new HttpError(402, "Autopilot subscription required");
}

/**
 * Infrastructure safety ceiling. It includes failed executions because they
 * still consume browser/proxy resources. Customer-facing credits may be
 * refunded separately, but no account can create unbounded monthly work.
 */
export async function enforceMonthlyAutoApplyExecutionCap(
  svc: SupabaseClient,
  userId: string,
  requestedJobs: number,
): Promise<void> {
  const limit = Math.max(1, Number(Deno.env.get("AUTOPILOT_MONTHLY_EXECUTION_CAP") || 120));
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await svc
    .from("applypass_tasks")
    .select("task_type,payload,status")
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString())
    .neq("status", "canceled")
    .limit(500);
  if (error) throw new HttpError(500, "unable to verify monthly auto-apply usage");

  const used = (data || []).reduce((total, task) => {
    if (task.task_type === "career_ops_submit") return total + 1;
    const payload = task.payload && typeof task.payload === "object" && !Array.isArray(task.payload)
      ? task.payload as Record<string, unknown>
      : {};
    return total + (Array.isArray(payload.jobs) ? payload.jobs.length : 1);
  }, 0);

  if (used + requestedJobs > limit) {
    throw new HttpError(429, `monthly auto-apply execution cap reached (${limit})`);
  }
}

export async function enforceDailyCap(
  svc: SupabaseClient,
  userId: string,
  kind: UsageKind,
  isPro: boolean,
): Promise<void> {
  const caps = isPro ? CAPS.pro : CAPS.free;
  const cap = (caps as Record<string, number>)[kind] ?? 50;
  const { data } = await svc
    .from("ai_usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", new Date().toISOString().slice(0, 10))
    .eq("kind", kind)
    .maybeSingle();
  if ((data?.count ?? 0) >= cap) {
    throw new HttpError(429, `daily ${kind} cap reached (${cap}). Upgrade for more.`);
  }
}

export async function logAiUsage(
  svc: SupabaseClient,
  userId: string,
  kind: UsageKind,
  tokens_in: number,
  tokens_out: number,
): Promise<void> {
  await svc.rpc("increment_ai_usage", {
    p_user_id: userId,
    p_kind: kind,
    p_tokens_in: tokens_in,
    p_tokens_out: tokens_out,
  });
}

export async function withErrorHandler(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status);
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
}

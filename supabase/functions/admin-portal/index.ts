import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_OWNER_EMAILS = ["myfamily9006@gmail.com"];
const ROLE_PRIORITY: Record<string, number> = { admin: 3, moderator: 2, user: 1 };

type AdminRole = "admin" | "moderator" | "user";
type AccountStatus = "active" | "suspended" | "blocked";
type PurchaseState = "trial" | "active" | "past_due" | "canceled" | "manual";

type ActivityUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  location: string | null;
  targetRole: string | null;
  onboardingCompleted: boolean;
  role: AdminRole;
  createdAt: string;
  lastActiveAt: string;
  authProvider: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  isAuthBanned: boolean;
  bannedUntil: string | null;
  accountStatus: AccountStatus;
  purchaseState: PurchaseState;
  subscriptionPlan: string;
  aiFeaturesEnabled: boolean;
  blockedReason: string | null;
  blockedUntil: string | null;
  conversations: number;
  resumes: number;
  trackedJobs: number;
  appliedJobs: number;
  coverLetters: number;
  documents: number;
  messages30d: number;
  inputTokens30d: number;
  outputTokens30d: number;
  estimatedAiCost30dUsd: number;
};

type TrendPoint = { date: string; signups: number; activeUsers: number };
type WebsiteTrendPoint = { date: string; visitors: number; pageViews: number };

type WebsiteAnalytics = {
  rangeDays: number;
  events: number;
  pageViews: number;
  uniqueVisitors: number;
  signedInVisitors: number;
  currentVisitors5m: number;
  viewsPerVisit: number;
  avgVisitDurationSec: number;
  bounceRatePct: number;
  topSources: Array<{ source: string; visitors: number }>;
  topPages: Array<{ path: string; views: number }>;
  countries: Array<{ country: string; visitors: number }>;
  devices: Array<{ device: string; visitors: number }>;
  visitsTrend: WebsiteTrendPoint[];
  warning: string | null;
};

type AccessControlRow = {
  user_id: string;
  account_status: AccountStatus;
  purchase_state: PurchaseState;
  subscription_plan: string;
  ai_features_enabled: boolean;
  blocked_reason: string | null;
  blocked_until: string | null;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
};

type ProductEventRow = {
  session_id: string;
  user_id: string | null;
  event_name: string;
  path: string | null;
  referrer: string | null;
  properties: Record<string, unknown> | null;
  occurred_at: string;
};

const ACCOUNT_STATUS_VALUES: AccountStatus[] = ["active", "suspended", "blocked"];
const PURCHASE_STATE_VALUES: PurchaseState[] = ["trial", "active", "past_due", "canceled", "manual"];

function toLower(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function parseOwnerEmails(): string[] {
  const env = Deno.env.get("ADMIN_OWNER_EMAILS");
  const values = (env ? env.split(",") : DEFAULT_OWNER_EMAILS)
    .map((item) => toLower(item))
    .filter(Boolean);
  return values.length > 0 ? values : DEFAULT_OWNER_EMAILS;
}

function approxTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function toIsoDay(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function usd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function parseNum(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeDate(value: string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
  return d.toISOString();
}

function safeNullableDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDomain(referrer: string | null | undefined): string {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "Direct";
  }
}

function toCountry(value: unknown): string {
  const v = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(v)) return v;
  return "Unknown";
}

function toDevice(value: unknown): string {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "Unknown";
  if (v.includes("mobile")) return "Mobile";
  if (v.includes("tablet")) return "Tablet";
  if (v.includes("desktop")) return "Desktop";
  return "Other";
}

function boolEnv(name: string): boolean {
  return Boolean(String(Deno.env.get(name) || "").trim());
}

function defaultOpsLinks() {
  const ref = "woxtbyotydxorcdhhivr";
  return {
    vercel:
      Deno.env.get("ADMIN_PORTAL_VERCEL_DASHBOARD_URL") ||
      "https://vercel.com/maanys-projects-8bbfa798/loom-web-architect",
    supabase:
      Deno.env.get("ADMIN_PORTAL_SUPABASE_DASHBOARD_URL") || `https://supabase.com/dashboard/project/${ref}`,
    github: Deno.env.get("ADMIN_PORTAL_GITHUB_REPO_URL") || "https://github.com/Mani9006/loom-web-architect",
    jira: Deno.env.get("ADMIN_PORTAL_JIRA_URL") || Deno.env.get("JIRA_BASE_URL") || "",
    slack: Deno.env.get("ADMIN_PORTAL_SLACK_URL") || "",
  };
}

function integrationStatus() {
  return {
    openai: boolEnv("OPENAI_API_KEY"),
    anthropic: boolEnv("ANTHROPIC_API_KEY"),
    perplexity: boolEnv("PERPLEXITY_API_KEY"),
    mem0: boolEnv("MEM0_API_KEY"),
    exa: boolEnv("EXA_API_KEY"),
    serviceRole: boolEnv("SERVICE_ROLE_KEY") || boolEnv("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: boolEnv("SUPABASE_URL"),
  };
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function parseAuthProvider(authUser: AuthUserRow | null | undefined): string {
  if (!authUser) return "unknown";
  const providers = authUser.app_metadata?.providers || [];
  if (providers.length > 0) return String(providers[0]);
  return String(authUser.app_metadata?.provider || "unknown");
}

function isAuthBanned(authUser: AuthUserRow | null | undefined): boolean {
  const until = safeNullableDate(authUser?.banned_until);
  return Boolean(until && until > new Date().toISOString());
}

async function authAdminFetch(
  supabaseUrl: string,
  serviceRole: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      ...(init?.headers || {}),
    },
  });
}

async function listAllAuthUsers(serviceClient: ReturnType<typeof createClient>): Promise<AuthUserRow[]> {
  const users: AuthUserRow[] = [];
  const perPage = 1000;

  let page = 1;
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const pageUsers = (data?.users || []) as unknown as AuthUserRow[];
    users.push(...pageUsers);

    if (!data?.nextPage || pageUsers.length < perPage) break;
    page = data.nextPage;
  }

  return users;
}

function getBanDurationForStatus(status: AccountStatus, blockedUntil: string | null): string {
  if (status === "active") return "none";

  if (blockedUntil) {
    const until = new Date(blockedUntil);
    if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
      const hours = Math.max(1, Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60)));
      return `${hours}h`;
    }
  }

  return "876000h";
}

function normalizeAccountStatus(value: unknown): AccountStatus {
  const normalized = String(value || "active").trim().toLowerCase();
  return ACCOUNT_STATUS_VALUES.includes(normalized as AccountStatus)
    ? (normalized as AccountStatus)
    : "active";
}

function normalizePurchaseState(value: unknown): PurchaseState {
  const normalized = String(value || "trial").trim().toLowerCase();
  return PURCHASE_STATE_VALUES.includes(normalized as PurchaseState)
    ? (normalized as PurchaseState)
    : "trial";
}

function normalizePlan(value: unknown): string {
  const plan = String(value || "free").trim().toLowerCase();
  return plan || "free";
}

async function writeAuditLog(
  serviceClient: ReturnType<typeof createClient>,
  actorId: string,
  action: string,
  resource: string,
  resourceId: string,
  metadata: Record<string, unknown>,
  req: Request,
) {
  await serviceClient.rpc("write_audit_log", {
    p_actor_id: actorId,
    p_action: action,
    p_resource: resource,
    p_resource_id: resourceId,
    p_metadata: metadata,
    p_ip_address: getClientIp(req),
    p_user_agent: req.headers.get("user-agent"),
  }).catch(() => null);
}

async function authenticateOwner(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Response(JSON.stringify({ error: "Supabase env not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ownerEmails = parseOwnerEmails();
  const email = toLower(user.email);
  if (!ownerEmails.includes(email)) {
    throw new Response(
      JSON.stringify({
        error: "Forbidden",
        reason: "This portal is restricted to owner accounts",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole) {
    throw new Response(JSON.stringify({ error: "Service role key missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRole);
  return { user, ownerEmails, serviceClient, supabaseUrl, serviceRole };
}

async function ensureOwnerRoles(serviceClient: ReturnType<typeof createClient>, ownerEmails: string[]) {
  const { data: ownerProfiles } = await serviceClient
    .from("profiles")
    .select("user_id,email")
    .in("email", ownerEmails);

  const ownerUserIds = (ownerProfiles || [])
    .map((row: { user_id: string }) => row.user_id)
    .filter(Boolean);

  if (ownerUserIds.length === 0) return;

  await Promise.all(
    ownerUserIds.map((userId) =>
      serviceClient.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" }),
    ),
  );
}

async function setUserRole(
  serviceClient: ReturnType<typeof createClient>,
  ownerEmails: string[],
  targetUserId: string,
  role: AdminRole,
) {
  if (!isValidUuid(targetUserId)) {
    throw new Error("Invalid user ID");
  }

  const { data: targetProfile } = await serviceClient
    .from("profiles")
    .select("user_id,email")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!targetProfile) {
    throw new Error("Target user not found");
  }

  const targetEmail = toLower((targetProfile as { email: string | null }).email);
  if (ownerEmails.includes(targetEmail) && role !== "admin") {
    throw new Error("Owner account cannot be demoted from admin");
  }

  if (role === "user") {
    await serviceClient
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId)
      .neq("role", "user");
  } else {
    await serviceClient.from("user_roles").upsert({ user_id: targetUserId, role }, { onConflict: "user_id,role" });
  }

  await serviceClient.from("user_roles").upsert({ user_id: targetUserId, role: "user" }, { onConflict: "user_id,role" });

  return { ok: true, userId: targetUserId, role };
}

async function setUserAccessControl(
  serviceClient: ReturnType<typeof createClient>,
  ownerEmails: string[],
  supabaseUrl: string,
  serviceRole: string,
  targetUserId: string,
  payload: {
    accountStatus?: unknown;
    purchaseState?: unknown;
    subscriptionPlan?: unknown;
    aiFeaturesEnabled?: unknown;
    blockedReason?: unknown;
    blockedUntil?: unknown;
  },
) {
  if (!isValidUuid(targetUserId)) throw new Error("Invalid user ID");

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("user_id", targetUserId)
    .maybeSingle();

  const targetEmail = toLower((profile as { email?: string | null } | null)?.email);

  const accountStatus = normalizeAccountStatus(payload.accountStatus);
  const purchaseState = normalizePurchaseState(payload.purchaseState);
  const subscriptionPlan = normalizePlan(payload.subscriptionPlan);
  const aiFeaturesEnabled = Boolean(payload.aiFeaturesEnabled ?? true);
  const blockedReason = String(payload.blockedReason || "").trim() || null;
  const blockedUntil = safeNullableDate(String(payload.blockedUntil || ""));

  if (ownerEmails.includes(targetEmail)) {
    if (accountStatus !== "active") {
      throw new Error("Owner account cannot be suspended or blocked");
    }
    if (!aiFeaturesEnabled) {
      throw new Error("Owner account must keep AI access enabled");
    }
  }

  const { error: upsertError } = await serviceClient
    .from("user_access_controls")
    .upsert(
      {
        user_id: targetUserId,
        account_status: accountStatus,
        purchase_state: purchaseState,
        subscription_plan: subscriptionPlan,
        ai_features_enabled: aiFeaturesEnabled,
        blocked_reason: accountStatus === "active" ? null : blockedReason,
        blocked_until: accountStatus === "active" ? null : blockedUntil,
        last_admin_action_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    if (upsertError.code === "42P01") {
      throw new Error("Database migration missing: user_access_controls table is not deployed yet.");
    }
    throw new Error(upsertError.message);
  }

  const banDuration = getBanDurationForStatus(accountStatus, blockedUntil);
  const authResponse = await authAdminFetch(supabaseUrl, serviceRole, `/auth/v1/admin/users/${targetUserId}`, {
    method: "PUT",
    body: JSON.stringify({ ban_duration: banDuration }),
  });

  if (!authResponse.ok) {
    const body = await authResponse.text();
    throw new Error(`Failed to update auth access (${authResponse.status}): ${body}`);
  }

  return {
    ok: true,
    userId: targetUserId,
    accountStatus,
    purchaseState,
    subscriptionPlan,
    aiFeaturesEnabled,
    blockedUntil,
  };
}

async function forceSignOutUser(supabaseUrl: string, serviceRole: string, targetUserId: string) {
  if (!isValidUuid(targetUserId)) throw new Error("Invalid user ID");
  const response = await authAdminFetch(
    supabaseUrl,
    serviceRole,
    `/auth/v1/admin/users/${targetUserId}/logout`,
    { method: "POST", body: JSON.stringify({ scope: "global" }) },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to force logout (${response.status}): ${body}`);
  }

  return { ok: true, userId: targetUserId };
}

async function generatePasswordResetLink(
  serviceClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRole: string,
  targetUserId: string,
  fallbackEmail: string | null,
) {
  if (!isValidUuid(targetUserId)) throw new Error("Invalid user ID");

  let email = toLower(fallbackEmail);
  if (!email) {
    const response = await authAdminFetch(supabaseUrl, serviceRole, `/auth/v1/admin/users/${targetUserId}`, {
      method: "GET",
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch user for password reset (${response.status}): ${body}`);
    }
    const payload = await response.json();
    email = toLower(payload?.email);
  }

  if (!email) throw new Error("Target user email not found");

  const redirectTo = Deno.env.get("ADMIN_PASSWORD_RESET_REDIRECT") || `${Deno.env.get("SITE_URL") || "https://www.resumepreps.com"}/reset-password`;

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) throw new Error(error.message);

  const resetLink =
    data?.properties?.action_link ||
    data?.properties?.email_otp ||
    null;

  if (!resetLink) {
    throw new Error("Password reset link was not returned by Supabase");
  }

  return { ok: true, userId: targetUserId, email, resetLink };
}

function buildRoleMap(rows: Array<{ user_id: string; role: AdminRole }>) {
  const roleCounts = { admin: 0, moderator: 0, user: 0 };
  const roleByUser = new Map<string, AdminRole>();

  for (const row of rows) {
    roleCounts[row.role] += 1;
    const current = roleByUser.get(row.user_id);
    if (!current || ROLE_PRIORITY[row.role] > ROLE_PRIORITY[current]) {
      roleByUser.set(row.user_id, row.role);
    }
  }

  return { roleCounts, roleByUser };
}

function buildCostModel(inputTokens: number, outputTokens: number, rangeDays: number) {
  const safeDays = Math.max(1, rangeDays);
  const periodFactor = 30 / safeDays;

  const openAiShare = Math.min(1, Math.max(0, parseNum(Deno.env.get("ADMIN_OPENAI_SHARE"), 0.7)));
  const anthropicShare = 1 - openAiShare;

  const openAiIn = parseNum(Deno.env.get("ADMIN_OPENAI_INPUT_USD_PER_1K"), 0.00015);
  const openAiOut = parseNum(Deno.env.get("ADMIN_OPENAI_OUTPUT_USD_PER_1K"), 0.0006);
  const anthropicIn = parseNum(Deno.env.get("ADMIN_ANTHROPIC_INPUT_USD_PER_1K"), 0.0008);
  const anthropicOut = parseNum(Deno.env.get("ADMIN_ANTHROPIC_OUTPUT_USD_PER_1K"), 0.004);

  const periodOpenAi = (inputTokens / 1000) * openAiIn * openAiShare + (outputTokens / 1000) * openAiOut * openAiShare;
  const periodAnthropic =
    (inputTokens / 1000) * anthropicIn * anthropicShare + (outputTokens / 1000) * anthropicOut * anthropicShare;
  const periodAiTotal = periodOpenAi + periodAnthropic;

  const monthlyAiEstimate = periodAiTotal * periodFactor;

  const fixedInfra =
    parseNum(Deno.env.get("ADMIN_VERCEL_MONTHLY_USD"), 0) +
    parseNum(Deno.env.get("ADMIN_SUPABASE_MONTHLY_USD"), 0) +
    parseNum(Deno.env.get("ADMIN_MEM0_MONTHLY_USD"), 0) +
    parseNum(Deno.env.get("ADMIN_PERPLEXITY_MONTHLY_USD"), 0) +
    parseNum(Deno.env.get("ADMIN_OTHER_INFRA_MONTHLY_USD"), 0);

  return {
    rangeDays: safeDays,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedAiCostRangeUsd: usd(periodAiTotal),
    estimatedAiCostMonthlyUsd: usd(monthlyAiEstimate),
    fixedInfraMonthlyUsd: usd(fixedInfra),
    estimatedMonthlyTotalUsd: usd(monthlyAiEstimate + fixedInfra),
    assumptions: {
      openAiShare,
      anthropicShare,
      openAiRates: { inputPer1k: openAiIn, outputPer1k: openAiOut },
      anthropicRates: { inputPer1k: anthropicIn, outputPer1k: anthropicOut },
    },
  };
}

function buildWebsiteAnalytics(
  rows: ProductEventRow[],
  rangeDays: number,
  warning: string | null,
): WebsiteAnalytics {
  const dayKeys: string[] = [];
  for (let i = Math.max(1, rangeDays) - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const byDayVisitors = new Map<string, Set<string>>();
  const byDayPageViews = new Map<string, number>();
  for (const day of dayKeys) {
    byDayVisitors.set(day, new Set());
    byDayPageViews.set(day, 0);
  }

  const sessions = new Map<
    string,
    {
      firstAt: string;
      lastAt: string;
      pageViews: number;
      userId: string | null;
      source: string;
      country: string;
      device: string;
    }
  >();
  const topPages = new Map<string, number>();

  for (const row of rows) {
    const ts = safeDate(row.occurred_at);
    const day = ts.slice(0, 10);
    const sessionId = row.session_id || `unknown-${row.user_id || "anon"}`;
    const source = toDomain(row.referrer);
    const country = toCountry(row.properties?.country);
    const device = toDevice(row.properties?.device_type);

    let s = sessions.get(sessionId);
    if (!s) {
      s = {
        firstAt: ts,
        lastAt: ts,
        pageViews: 0,
        userId: row.user_id || null,
        source,
        country,
        device,
      };
      sessions.set(sessionId, s);
    }
    if (ts < s.firstAt) s.firstAt = ts;
    if (ts > s.lastAt) s.lastAt = ts;
    if (row.user_id && !s.userId) s.userId = row.user_id;

    if (row.event_name === "page_view") {
      s.pageViews += 1;
      const path = row.path || "/";
      topPages.set(path, (topPages.get(path) || 0) + 1);
      if (byDayPageViews.has(day)) {
        byDayPageViews.set(day, (byDayPageViews.get(day) || 0) + 1);
      }
      byDayVisitors.get(day)?.add(sessionId);
    } else {
      byDayVisitors.get(day)?.add(sessionId);
    }
  }

  const sessionValues = [...sessions.values()];
  const sourceMap = new Map<string, number>();
  const countryMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  let totalVisitDurationSec = 0;
  let sessionsWithPageViews = 0;
  let bouncedSessions = 0;

  for (const s of sessionValues) {
    sourceMap.set(s.source, (sourceMap.get(s.source) || 0) + 1);
    countryMap.set(s.country, (countryMap.get(s.country) || 0) + 1);
    deviceMap.set(s.device, (deviceMap.get(s.device) || 0) + 1);

    if (s.pageViews > 0) {
      sessionsWithPageViews += 1;
      if (s.pageViews <= 1) bouncedSessions += 1;
      const sec = Math.max(0, Math.floor((new Date(s.lastAt).getTime() - new Date(s.firstAt).getTime()) / 1000));
      totalVisitDurationSec += sec;
    }
  }

  const pageViews = [...topPages.values()].reduce((acc, n) => acc + n, 0);
  const uniqueVisitors = sessions.size;
  const signedInVisitors = new Set(sessionValues.map((s) => s.userId).filter(Boolean)).size;
  const viewsPerVisit = sessionsWithPageViews > 0 ? pageViews / sessionsWithPageViews : 0;
  const avgVisitDurationSec = sessionsWithPageViews > 0 ? totalVisitDurationSec / sessionsWithPageViews : 0;
  const bounceRatePct = sessionsWithPageViews > 0 ? (bouncedSessions / sessionsWithPageViews) * 100 : 0;
  const now = Date.now();
  const currentVisitors5m = sessionValues.filter(
    (s) => now - new Date(s.lastAt).getTime() <= 5 * 60 * 1000,
  ).length;

  const sortTop = (map: Map<string, number>, label: string) =>
    [...map.entries()]
      .map(([key, count]) => ({ [label]: key, count }) as Record<string, string | number>)
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 12);

  return {
    rangeDays,
    events: rows.length,
    pageViews,
    uniqueVisitors,
    signedInVisitors,
    currentVisitors5m,
    viewsPerVisit: Math.round(viewsPerVisit * 100) / 100,
    avgVisitDurationSec: Math.round(avgVisitDurationSec),
    bounceRatePct: Math.round(bounceRatePct * 10) / 10,
    topSources: sortTop(sourceMap, "source").map((v) => ({ source: String(v.source), visitors: Number(v.count) })),
    topPages: sortTop(topPages, "path").map((v) => ({ path: String(v.path), views: Number(v.count) })),
    countries: sortTop(countryMap, "country").map((v) => ({ country: String(v.country), visitors: Number(v.count) })),
    devices: sortTop(deviceMap, "device").map((v) => ({ device: String(v.device), visitors: Number(v.count) })),
    visitsTrend: dayKeys.map((day) => ({
      date: day,
      visitors: byDayVisitors.get(day)?.size || 0,
      pageViews: byDayPageViews.get(day) || 0,
    })),
    warning,
  };
}

async function buildSummary(
  serviceClient: ReturnType<typeof createClient>,
  ownerEmails: string[],
  rangeDays: number,
  supabaseUrl: string,
  serviceRole: string,
) {
  const sinceDate = new Date(Date.now() - Math.max(1, rangeDays) * 24 * 60 * 60 * 1000);
  const sinceIso = sinceDate.toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesCount,
    resumesCount,
    jobsCount,
    conversationsCount,
    coverLettersCount,
    documentsCount,
    messagesCount,
    profiles,
    roles,
    conversations,
    resumes,
    jobs,
    coverLetters,
    documents,
    recentMessages,
    recentSignups,
    websiteEvents,
  ] = await Promise.all([
    serviceClient.from("profiles").select("id", { count: "exact", head: true }),
    serviceClient.from("resumes").select("id", { count: "exact", head: true }),
    serviceClient.from("tracked_jobs").select("id", { count: "exact", head: true }),
    serviceClient.from("conversations").select("id", { count: "exact", head: true }),
    serviceClient.from("cover_letters").select("id", { count: "exact", head: true }),
    serviceClient.from("user_documents").select("id", { count: "exact", head: true }),
    serviceClient.from("messages").select("id", { count: "exact", head: true }),
    serviceClient
      .from("profiles")
      .select("user_id,email,full_name,location,target_role,onboarding_completed,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1000),
    serviceClient.from("user_roles").select("user_id,role"),
    serviceClient.from("conversations").select("id,user_id,updated_at,created_at"),
    serviceClient.from("resumes").select("user_id,updated_at,created_at"),
    serviceClient.from("tracked_jobs").select("user_id,status,updated_at,created_at"),
    serviceClient.from("cover_letters").select("user_id,updated_at,created_at"),
    serviceClient.from("user_documents").select("user_id,updated_at,created_at"),
    serviceClient
      .from("messages")
      .select("conversation_id,role,content,created_at")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(parseNum(Deno.env.get("ADMIN_COST_SAMPLE_LIMIT"), 10000)),
    serviceClient.from("profiles").select("user_id,created_at").gte("created_at", sinceIso),
    serviceClient
      .from("product_analytics_events")
      .select("session_id,user_id,event_name,path,referrer,properties,occurred_at")
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .limit(parseNum(Deno.env.get("ADMIN_ANALYTICS_EVENT_LIMIT"), 50000)),
  ]);

  let accessControlRows: AccessControlRow[] = [];
  const accessRes = await serviceClient
    .from("user_access_controls")
    .select("user_id,account_status,purchase_state,subscription_plan,ai_features_enabled,blocked_reason,blocked_until");
  if (!accessRes.error) {
    accessControlRows = (accessRes.data || []) as AccessControlRow[];
  }

  let authUsers: AuthUserRow[] = [];
  let authDataWarning: string | null = null;
  try {
    authUsers = await listAllAuthUsers(serviceClient);
  } catch (error) {
    authDataWarning = error instanceof Error ? error.message : "Failed to load auth users.";
    console.error("Failed to list auth users for admin summary:", error);
  }

  const authById = new Map<string, AuthUserRow>();
  for (const row of authUsers) authById.set(row.id, row);

  const roleRows = (roles.data || []) as Array<{ user_id: string; role: AdminRole }>;
  const { roleCounts, roleByUser } = buildRoleMap(roleRows);

  const convRows = (conversations.data || []) as Array<{ id: string; user_id: string; updated_at: string; created_at: string }>;
  const resumeRows = (resumes.data || []) as Array<{ user_id: string; updated_at: string; created_at: string }>;
  const jobRows = (jobs.data || []) as Array<{ user_id: string; status: string; updated_at: string; created_at: string }>;
  const coverRows = (coverLetters.data || []) as Array<{ user_id: string; updated_at: string; created_at: string }>;
  const docRows = (documents.data || []) as Array<{ user_id: string; updated_at: string; created_at: string }>;
  const profileRows = (profiles.data || []) as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    location: string | null;
    target_role: string | null;
    onboarding_completed: boolean;
    created_at: string;
    updated_at: string;
  }>;

  const profileByUser = new Map(profileRows.map((row) => [row.user_id, row]));
  const accessByUser = new Map(accessControlRows.map((row) => [row.user_id, row]));

  const convToUser = new Map<string, string>();
  for (const row of convRows) convToUser.set(row.id, row.user_id);

  const users = new Map<string, ActivityUser>();

  const ensureUser = (userId: string): ActivityUser => {
    let item = users.get(userId);
    if (!item) {
      const profileRow = profileByUser.get(userId);
      const authRow = authById.get(userId);
      const accessRow = accessByUser.get(userId);

      item = {
        userId,
        email: profileRow?.email || authRow?.email || null,
        fullName: profileRow?.full_name || null,
        location: profileRow?.location || null,
        targetRole: profileRow?.target_role || null,
        onboardingCompleted: Boolean(profileRow?.onboarding_completed),
        role: roleByUser.get(userId) || "user",
        createdAt: safeDate(profileRow?.created_at || authRow?.created_at),
        lastActiveAt: safeDate(profileRow?.updated_at || authRow?.last_sign_in_at || authRow?.created_at),
        authProvider: parseAuthProvider(authRow),
        lastSignInAt: safeNullableDate(authRow?.last_sign_in_at),
        emailConfirmedAt: safeNullableDate(authRow?.email_confirmed_at),
        isAuthBanned: isAuthBanned(authRow),
        bannedUntil: safeNullableDate(authRow?.banned_until),
        accountStatus: accessRow?.account_status || "active",
        purchaseState: accessRow?.purchase_state || "trial",
        subscriptionPlan: accessRow?.subscription_plan || "free",
        aiFeaturesEnabled: accessRow?.ai_features_enabled ?? true,
        blockedReason: accessRow?.blocked_reason || null,
        blockedUntil: safeNullableDate(accessRow?.blocked_until),
        conversations: 0,
        resumes: 0,
        trackedJobs: 0,
        appliedJobs: 0,
        coverLetters: 0,
        documents: 0,
        messages30d: 0,
        inputTokens30d: 0,
        outputTokens30d: 0,
        estimatedAiCost30dUsd: 0,
      };
      users.set(userId, item);
    }
    return item;
  };

  for (const row of profileRows) ensureUser(row.user_id);
  for (const row of authUsers) ensureUser(row.id);

  for (const row of convRows) {
    const u = ensureUser(row.user_id);
    u.conversations += 1;
    if (safeDate(row.updated_at) > u.lastActiveAt) u.lastActiveAt = safeDate(row.updated_at);
  }
  for (const row of resumeRows) {
    const u = ensureUser(row.user_id);
    u.resumes += 1;
    if (safeDate(row.updated_at) > u.lastActiveAt) u.lastActiveAt = safeDate(row.updated_at);
  }
  for (const row of jobRows) {
    const u = ensureUser(row.user_id);
    u.trackedJobs += 1;
    if (String(row.status || "").toLowerCase() !== "saved") u.appliedJobs += 1;
    if (safeDate(row.updated_at) > u.lastActiveAt) u.lastActiveAt = safeDate(row.updated_at);
  }
  for (const row of coverRows) {
    const u = ensureUser(row.user_id);
    u.coverLetters += 1;
    if (safeDate(row.updated_at) > u.lastActiveAt) u.lastActiveAt = safeDate(row.updated_at);
  }
  for (const row of docRows) {
    const u = ensureUser(row.user_id);
    u.documents += 1;
    if (safeDate(row.updated_at) > u.lastActiveAt) u.lastActiveAt = safeDate(row.updated_at);
  }

  const messageRows = (recentMessages.data || []) as Array<{
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
  }>;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const row of messageRows) {
    const userId = convToUser.get(row.conversation_id);
    if (!userId) continue;
    const u = ensureUser(userId);
    const tokens = approxTokens(row.content);
    u.messages30d += 1;
    if (row.role === "assistant") {
      u.outputTokens30d += tokens;
      totalOutputTokens += tokens;
    } else {
      u.inputTokens30d += tokens;
      totalInputTokens += tokens;
    }
  }

  const monthlyCost = buildCostModel(totalInputTokens, totalOutputTokens, 30);

  const perInputUsd = monthlyCost.assumptions.openAiRates.inputPer1k * monthlyCost.assumptions.openAiShare;
  const perOutputUsd = monthlyCost.assumptions.openAiRates.outputPer1k * monthlyCost.assumptions.openAiShare;
  const perAnthIn = monthlyCost.assumptions.anthropicRates.inputPer1k * monthlyCost.assumptions.anthropicShare;
  const perAnthOut = monthlyCost.assumptions.anthropicRates.outputPer1k * monthlyCost.assumptions.anthropicShare;

  for (const u of users.values()) {
    const cost =
      (u.inputTokens30d / 1000) * (perInputUsd + perAnthIn) +
      (u.outputTokens30d / 1000) * (perOutputUsd + perAnthOut);
    u.estimatedAiCost30dUsd = usd(cost);
  }

  const dayKeys: string[] = [];
  for (let i = Math.max(1, rangeDays) - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const signupCountByDay = new Map<string, number>();
  for (const row of (recentSignups.data || []) as Array<{ created_at: string }>) {
    const day = toIsoDay(row.created_at);
    signupCountByDay.set(day, (signupCountByDay.get(day) || 0) + 1);
  }

  const activeSetByDay = new Map<string, Set<string>>();
  const markActive = (userId: string, ts: string) => {
    const day = toIsoDay(ts);
    if (!activeSetByDay.has(day)) activeSetByDay.set(day, new Set());
    activeSetByDay.get(day)!.add(userId);
  };

  for (const row of convRows) markActive(row.user_id, row.updated_at);
  for (const row of resumeRows) markActive(row.user_id, row.updated_at);
  for (const row of jobRows) markActive(row.user_id, row.updated_at);
  for (const row of coverRows) markActive(row.user_id, row.updated_at);
  for (const row of docRows) markActive(row.user_id, row.updated_at);
  for (const row of profileRows) markActive(row.user_id, row.updated_at);

  const trends: TrendPoint[] = dayKeys.map((day) => ({
    date: day,
    signups: signupCountByDay.get(day) || 0,
    activeUsers: activeSetByDay.get(day)?.size || 0,
  }));

  const active7dUsers = new Set<string>();
  for (const item of users.values()) {
    if (item.lastActiveAt >= since7d) active7dUsers.add(item.userId);
  }

  const usersList = [...users.values()]
    .sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1))
    .slice(0, 400);

  const ownerUserEmails = new Set(ownerEmails);
  const ownerUsers = usersList.filter((u) => ownerUserEmails.has(toLower(u.email)));

  const authSummary = {
    totalAuthUsers: authUsers.length || profilesCount.count || 0,
    signedIn7d: usersList.filter((u) => (u.lastSignInAt || "") >= since7d).length,
    signedIn30d: usersList.filter((u) => (u.lastSignInAt || "") >= since30d).length,
    blockedAccounts: usersList.filter((u) => u.accountStatus !== "active" || u.isAuthBanned).length,
    emailVerifiedUsers: usersList.filter((u) => Boolean(u.emailConfirmedAt)).length,
    googleAccounts: usersList.filter((u) => u.authProvider === "google").length,
    passwordAccounts: usersList.filter((u) => u.authProvider === "email").length,
    dataSource: authDataWarning ? "profile_fallback" : "auth_admin",
    warning: authDataWarning,
  };

  const purchaseStateCounts: Record<PurchaseState, number> = {
    trial: 0,
    active: 0,
    past_due: 0,
    canceled: 0,
    manual: 0,
  };

  const planCounts: Record<string, number> = {};
  let aiEnabledUsers = 0;
  let restrictedUsers = 0;

  for (const user of usersList) {
    purchaseStateCounts[user.purchaseState] += 1;
    planCounts[user.subscriptionPlan] = (planCounts[user.subscriptionPlan] || 0) + 1;
    if (user.aiFeaturesEnabled) aiEnabledUsers += 1;
    if (user.accountStatus !== "active" || !user.aiFeaturesEnabled || user.purchaseState === "past_due" || user.purchaseState === "canceled") {
      restrictedUsers += 1;
    }
  }

  let websiteWarning: string | null = null;
  let websiteRows: ProductEventRow[] = [];
  if (websiteEvents.error) {
    if (websiteEvents.error.code !== "42P01") {
      websiteWarning = websiteEvents.error.message;
    } else {
      websiteWarning = "Analytics event table not deployed yet.";
    }
  } else {
    websiteRows = (websiteEvents.data || []) as ProductEventRow[];
  }

  const website = buildWebsiteAnalytics(websiteRows, rangeDays, websiteWarning);

  return {
    generatedAt: new Date().toISOString(),
    ownerEmails,
    company: {
      totalUsers: profilesCount.count || authSummary.totalAuthUsers,
      activeUsers7d: active7dUsers.size,
      totalResumes: resumesCount.count || 0,
      totalTrackedJobs: jobsCount.count || 0,
      totalConversations: conversationsCount.count || 0,
      totalCoverLetters: coverLettersCount.count || 0,
      totalDocuments: documentsCount.count || 0,
      totalMessages: messagesCount.count || 0,
      onboardingCompletedUsers: profileRows.filter((item) => item.onboarding_completed).length,
    },
    auth: authSummary,
    access: {
      roleCounts,
      ownersPresent: ownerUsers.map((u) => ({ email: u.email, role: u.role, userId: u.userId })),
      model: "Role + account status + purchase state access control",
      subscriptionNote:
        "Purchase and access are owner-managed in user_access_controls. Use account status, purchase state, and AI toggle to grant or revoke access instantly.",
    },
    billing: {
      purchaseStateCounts,
      planCounts,
      aiEnabledUsers,
      restrictedUsers,
    },
    website,
    apiCosts: monthlyCost,
    trends,
    users: usersList,
    integrations: integrationStatus(),
    opsLinks: defaultOpsLinks(),
    meta: {
      rangeDays,
      costSampleRows: messageRows.length,
      costSampleLimit: parseNum(Deno.env.get("ADMIN_COST_SAMPLE_LIMIT"), 10000),
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user, serviceClient, ownerEmails, supabaseUrl, serviceRole } = await authenticateOwner(req);
    await ensureOwnerRoles(serviceClient, ownerEmails);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "summary");

    if (action === "set-role") {
      const targetUserId = String(body?.targetUserId || "");
      const role = String(body?.role || "") as AdminRole;
      if (!["admin", "moderator", "user"].includes(role)) {
        return new Response(JSON.stringify({ error: "Invalid role value" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await setUserRole(serviceClient, ownerEmails, targetUserId, role);
      await writeAuditLog(
        serviceClient,
        user.id,
        "user.role_changed",
        "user_role",
        targetUserId,
        { role },
        req,
      );

      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set-account-access") {
      const targetUserId = String(body?.targetUserId || "");
      const result = await setUserAccessControl(serviceClient, ownerEmails, supabaseUrl, serviceRole, targetUserId, {
        accountStatus: body?.accountStatus,
        purchaseState: body?.purchaseState,
        subscriptionPlan: body?.subscriptionPlan,
        aiFeaturesEnabled: body?.aiFeaturesEnabled,
        blockedReason: body?.blockedReason,
        blockedUntil: body?.blockedUntil,
      });

      await writeAuditLog(
        serviceClient,
        user.id,
        "user.access_updated",
        "user_access_controls",
        targetUserId,
        {
          accountStatus: result.accountStatus,
          purchaseState: result.purchaseState,
          subscriptionPlan: result.subscriptionPlan,
          aiFeaturesEnabled: result.aiFeaturesEnabled,
          blockedUntil: result.blockedUntil,
        },
        req,
      );

      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "force-signout") {
      const targetUserId = String(body?.targetUserId || "");
      const result = await forceSignOutUser(supabaseUrl, serviceRole, targetUserId);

      await writeAuditLog(
        serviceClient,
        user.id,
        "user.forced_signout",
        "auth_user",
        targetUserId,
        {},
        req,
      );

      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "password-reset-link") {
      const targetUserId = String(body?.targetUserId || "");
      const targetEmail = body?.email ? String(body.email) : null;
      const result = await generatePasswordResetLink(serviceClient, supabaseUrl, serviceRole, targetUserId, targetEmail);

      await writeAuditLog(
        serviceClient,
        user.id,
        "user.password_reset_link_generated",
        "auth_user",
        targetUserId,
        { email: result.email },
        req,
      );

      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rangeDays = Math.max(7, Math.min(90, Number(body?.rangeDays || 30)));
    const summary = await buildSummary(serviceClient, ownerEmails, rangeDays, supabaseUrl, serviceRole);
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(
      JSON.stringify({
        error: "Admin portal failure",
        detail: error instanceof Error ? error.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

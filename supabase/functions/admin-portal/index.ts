import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_OWNER_EMAILS = ["myfamily9006@gmail.com"];
const ROLE_PRIORITY: Record<string, number> = { admin: 3, moderator: 2, user: 1 };

type AdminRole = "admin" | "moderator" | "user";

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

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole) {
    throw new Response(JSON.stringify({ error: "Service role key missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRole);
  return { user, ownerEmails, serviceClient };
}

async function ensureOwnerRoles(serviceClient: ReturnType<typeof createClient>, ownerEmails: string[]) {
  const { data: ownerProfiles } = await serviceClient
    .from("profiles")
    .select("user_id,email")
    .in("email", ownerEmails);

  const ownerUserIds = (ownerProfiles || [])
    .map((row: any) => row.user_id as string)
    .filter(Boolean);

  if (ownerUserIds.length === 0) return;

  await Promise.all(
    ownerUserIds.map((userId) =>
      serviceClient.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" }),
    ),
  );
}

async function setUserRole(serviceClient: ReturnType<typeof createClient>, ownerEmails: string[], targetUserId: string, role: AdminRole) {
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
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

  const targetEmail = toLower((targetProfile as any).email);
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

async function buildSummary(serviceClient: ReturnType<typeof createClient>, ownerEmails: string[], rangeDays: number) {
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
      .limit(250),
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
  ]);

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

  const convToUser = new Map<string, string>();
  for (const row of convRows) convToUser.set(row.id, row.user_id);

  const users = new Map<string, ActivityUser>();

  const ensureUser = (userId: string): ActivityUser => {
    let item = users.get(userId);
    if (!item) {
      const p = profileRows.find((row) => row.user_id === userId);
      item = {
        userId,
        email: p?.email || null,
        fullName: p?.full_name || null,
        location: p?.location || null,
        targetRole: p?.target_role || null,
        onboardingCompleted: Boolean(p?.onboarding_completed),
        role: roleByUser.get(userId) || "user",
        createdAt: safeDate(p?.created_at),
        lastActiveAt: safeDate(p?.updated_at),
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
    .slice(0, 120);

  const ownerUserEmails = new Set(ownerEmails);
  const ownerUsers = usersList.filter((u) => ownerUserEmails.has(toLower(u.email)));

  return {
    generatedAt: new Date().toISOString(),
    ownerEmails,
    company: {
      totalUsers: profilesCount.count || 0,
      activeUsers7d: active7dUsers.size,
      totalResumes: resumesCount.count || 0,
      totalTrackedJobs: jobsCount.count || 0,
      totalConversations: conversationsCount.count || 0,
      totalCoverLetters: coverLettersCount.count || 0,
      totalDocuments: documentsCount.count || 0,
      totalMessages: messagesCount.count || 0,
      onboardingCompletedUsers: profileRows.filter((item) => item.onboarding_completed).length,
    },
    access: {
      roleCounts,
      ownersPresent: ownerUsers.map((u) => ({ email: u.email, role: u.role, userId: u.userId })),
      model: "Role-based access control",
      subscriptionNote:
        "Subscription plans are not configured in database tables yet. Access control is currently role-based.",
    },
    apiCosts: monthlyCost,
    trends,
    users: usersList,
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
    const { serviceClient, ownerEmails } = await authenticateOwner(req);
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
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rangeDays = Math.max(7, Math.min(90, Number(body?.rangeDays || 30)));
    const summary = await buildSummary(serviceClient, ownerEmails, rangeDays);
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

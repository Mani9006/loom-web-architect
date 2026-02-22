import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UsageLevel = "ok" | "warn" | "critical" | "blocked";

function parseNum(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function approxTokens(content: string | null): number {
  if (!content) return 0;
  return Math.max(1, Math.ceil(content.length / 4));
}

function usageLevelFromPercent(percent: number, warnAt: number, criticalAt: number): UsageLevel {
  if (percent >= 1) return "blocked";
  if (percent >= criticalAt) return "critical";
  if (percent >= warnAt) return "warn";
  return "ok";
}

function nextUtcMidnightIso(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthlyBudgetTokens = Math.max(
      1,
      parseNum(Deno.env.get("USAGE_GUARD_MONTHLY_TOKEN_BUDGET"), 1_500_000),
    );
    const dailyBudgetTokens = Math.max(
      1,
      parseNum(Deno.env.get("USAGE_GUARD_DAILY_TOKEN_BUDGET"), Math.floor(monthlyBudgetTokens / 30)),
    );
    const warnAt = clampPercent(parseNum(Deno.env.get("USAGE_GUARD_WARN_AT"), 0.8));
    const criticalAt = clampPercent(parseNum(Deno.env.get("USAGE_GUARD_CRITICAL_AT"), 0.95));

    const now = new Date();
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .limit(5000);

    if (convError) throw convError;

    const conversationIds = (conversations ?? []).map((row) => row.id);
    if (conversationIds.length === 0) {
      return new Response(
        JSON.stringify({
          level: "ok" as UsageLevel,
          monthlyUsedTokens: 0,
          monthlyBudgetTokens,
          monthlyUsagePct: 0,
          dailyUsedTokens: 0,
          dailyBudgetTokens,
          dailyUsagePct: 0,
          nextResetAt: nextUtcMidnightIso(now),
          windowDays: 30,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let monthlyUsedTokens = 0;
    let dailyUsedTokens = 0;
    const chunkSize = 200;

    for (let i = 0; i < conversationIds.length; i += chunkSize) {
      const chunk = conversationIds.slice(i, i + chunkSize);
      const { data: messageRows, error: messagesError } = await supabase
        .from("messages")
        .select("content, created_at")
        .in("conversation_id", chunk)
        .gte("created_at", monthStart.toISOString())
        .limit(10000);

      if (messagesError) throw messagesError;
      for (const row of messageRows ?? []) {
        const tokens = approxTokens(row.content);
        monthlyUsedTokens += tokens;
        if (new Date(row.created_at) >= dayStart) {
          dailyUsedTokens += tokens;
        }
      }
    }

    const monthlyUsagePct = clampPercent(monthlyUsedTokens / monthlyBudgetTokens);
    const dailyUsagePct = clampPercent(dailyUsedTokens / dailyBudgetTokens);
    const level = usageLevelFromPercent(Math.max(monthlyUsagePct, dailyUsagePct), warnAt, criticalAt);

    return new Response(
      JSON.stringify({
        level,
        monthlyUsedTokens,
        monthlyBudgetTokens,
        monthlyUsagePct,
        dailyUsedTokens,
        dailyBudgetTokens,
        dailyUsagePct,
        nextResetAt: nextUtcMidnightIso(now),
        windowDays: 30,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

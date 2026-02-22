import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AccessGateCode =
  | "account_blocked"
  | "account_suspended"
  | "ai_disabled"
  | "purchase_required";

export type AccessGateResult = {
  allowed: boolean;
  code?: AccessGateCode;
  message?: string;
};

type AccessRow = {
  account_status: "active" | "suspended" | "blocked";
  purchase_state: "trial" | "active" | "past_due" | "canceled" | "manual";
  ai_features_enabled: boolean;
  blocked_reason: string | null;
};

const PURCHASE_ALLOWED = new Set(["trial", "active", "manual"]);

function resolveBlockMessage(row: AccessRow): string {
  if (row.blocked_reason && row.blocked_reason.trim()) return row.blocked_reason.trim();
  if (row.account_status === "blocked") return "This account is blocked. Contact support.";
  if (row.account_status === "suspended") return "This account is suspended. Contact support.";
  if (!row.ai_features_enabled) return "AI features are disabled for this account.";
  return "AI access requires an active purchase state.";
}

export async function evaluateUserAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessGateResult> {
  const { data, error } = await supabase
    .from("user_access_controls")
    .select("account_status,purchase_state,ai_features_enabled,blocked_reason")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // If migration hasn't been applied yet, do not break user flow.
    if (error.code === "42P01") return { allowed: true };
    return { allowed: false, code: "account_suspended", message: "Unable to verify account access." };
  }

  const row = data as AccessRow | null;
  if (!row) return { allowed: true };

  if (row.account_status === "blocked") {
    return { allowed: false, code: "account_blocked", message: resolveBlockMessage(row) };
  }
  if (row.account_status === "suspended") {
    return { allowed: false, code: "account_suspended", message: resolveBlockMessage(row) };
  }
  if (!row.ai_features_enabled) {
    return { allowed: false, code: "ai_disabled", message: resolveBlockMessage(row) };
  }
  if (!PURCHASE_ALLOWED.has(row.purchase_state)) {
    return { allowed: false, code: "purchase_required", message: resolveBlockMessage(row) };
  }

  return { allowed: true };
}

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** 1 successful submit = 1 credit. Idempotent on draft id. Never called without a receipt. */
export async function consumeSubmitCredit(
  service: SupabaseClient,
  userId: string,
  draftApplicationId: string,
): Promise<number | null> {
  const { data, error } = await service.rpc("consume_application_credit", {
    p_user_id: userId,
    p_draft_id: draftApplicationId,
  });
  if (error) {
    console.error("[credits] consume failed", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

export async function refundSubmitCredit(
  service: SupabaseClient,
  userId: string,
  draftApplicationId: string,
): Promise<number | null> {
  const { data, error } = await service.rpc("refund_application_credit", {
    p_user_id: userId,
    p_draft_id: draftApplicationId,
  });
  if (error) {
    console.error("[credits] refund failed", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

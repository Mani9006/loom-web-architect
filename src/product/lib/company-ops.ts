import { invokeFunction } from "@/product/lib/table";
import type { OperatorPermission, OperatorRole } from "@/lib/operator-roles";

export type OperatorSession = {
  org: { id: string; name: string; slug: string; seat_limit: number; global_auto_apply: boolean; used_seats: number };
  member: { id: string; user_id: string; email: string; role: OperatorRole };
  permissions: OperatorPermission[];
};

export async function companyOps<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
) {
  const result = await invokeFunction<T & { error?: string }>("company-ops", { action, ...body });
  if (result.error) return result;
  if (result.data && typeof result.data === "object" && "error" in result.data && result.data.error) {
    return { data: null, error: new Error(String(result.data.error)) };
  }
  return result;
}

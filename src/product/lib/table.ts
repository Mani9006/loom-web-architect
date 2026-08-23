import { supabase } from "@/integrations/supabase/client";

/** Untyped accessor — Career-Ops tables are missing from generated types. */
export function db() {
  return supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
    functions: typeof supabase.functions;
    channel: typeof supabase.channel;
    removeChannel: typeof supabase.removeChannel;
    auth: typeof supabase.auth;
    rpc: typeof supabase.rpc;
  };
}

export async function invokeFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) return { data: null, error };
  return { data: (data ?? null) as T | null, error: null };
}

export function tableMissing(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = (error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
}

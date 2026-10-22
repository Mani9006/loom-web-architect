/**
 * POST /functions/v1/ats-detect
 *
 * Body: { url: string }
 * Returns the ATS catalog match. Detection is not a submit capability.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { detectAtsFromUrl } from "../_shared/ats-detect.ts";
import { corsHeaders, jsonResponse } from "../_shared/guards.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as { url?: string };
  const detection = detectAtsFromUrl(body?.url);
  return jsonResponse({
    ok: true,
    ...detection,
    live_adapters: ["greenhouse", "lever", "ashby", "workable", "workday"],
  });
});

/**
 * ops-assistant — signed-in AI with tools + hard guardrails.
 * Never invents work history. Never marks submitted. Never enables hands-off
 * without pendingConfirm. Applies at most one job, and only after confirm.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude } from "../_shared/ai.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser, HttpError,
  serviceClient, enforceAccountActive,
} from "../_shared/guards.ts";

const SYSTEM = `You are the ResumePreps operations assistant for a US-only job product.

Hard rules:
- United States jobs only.
- Never invent employers, titles, dates, metrics, or credentials.
- Never claim an application is submitted. Submitted requires a worker receipt.
- Never enable hands-off apply. You may only preview settings and ask for confirm.
- You may apply at most ONE job, and only by returning pendingConfirm.kind=apply.
- Show tools you would use. Do not pretend a write happened.

Return JSON only:
{
  "reply": string,
  "tools": [{"name": "search_matches"|"apply_one_job"|"open_application"|"tune_hands_off"|"explain_match"|"find_inbox_thread", "args": object, "result": string}],
  "pendingConfirm": null | {"kind": "apply"|"hands_off", "payload": object}
}`;

interface Msg { role: "user" | "assistant"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const svc = serviceClient();
    await enforceAccountActive(svc, user.id);

    const body = await req.json().catch(() => ({})) as { messages?: Msg[] };
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length) throw new HttpError(400, "messages required");
    const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";

    const context = await loadContext(svc, user.id);

    let parsed: {
      reply?: string;
      tools?: Array<{ name: string; args?: Record<string, unknown>; result?: string }>;
      pendingConfirm?: { kind: string; payload?: Record<string, unknown> } | null;
    } = {};

    try {
      const result = await callClaude<string>({
        tier: "simple",
        system: SYSTEM,
        user: `Account context (do not invent beyond this):\n${context}\n\nUser: ${lastUser}\n\nJSON only.`,
        maxTokens: 700,
        temperature: 0.2,
      });
      parsed = JSON.parse(extractJson(result.text)) as typeof parsed;
    } catch {
      parsed = localPlan(lastUser, context);
    }

    const guarded = applyGuardrails(lastUser, parsed, context);
    return jsonResponse(guarded);
  });
});

async function loadContext(svc: ReturnType<typeof serviceClient>, userId: string): Promise<string> {
  const [matches, drafts, mail] = await Promise.all([
    svc.from("job_evaluations").select("id,fit_score,summary,scanned_job:scanned_jobs(title,location,company:scan_companies(name))").eq("user_id", userId).is("dismissed_at", null).order("fit_score", { ascending: false }).limit(5),
    svc.from("draft_applications").select("id,status,evaluation:job_evaluations(scanned_job:scanned_jobs(title))").eq("user_id", userId).order("updated_at", { ascending: false }).limit(5),
    svc.from("mc_inbound_emails").select("id,subject,classification").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  return JSON.stringify({
    country: "US",
    matches: matches.data || [],
    applications: drafts.data || [],
    inbox: mail.data || [],
  });
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  throw new Error("no json");
}

function localPlan(text: string, context: string) {
  const lower = text.toLowerCase();
  if (/hands-?off|enable auto/.test(lower)) {
    return {
      reply: "Hands-off apply stays off until you confirm on that page. Here is a preview only.",
      tools: [{ name: "tune_hands_off", args: { preview: true }, result: "Preview generated. Not saved." }],
      pendingConfirm: { kind: "hands_off", payload: {} },
    };
  }
  if (/apply|submit/.test(lower)) {
    const match = context.match(/"id":"([^"]+)"/);
    return {
      reply: "I can apply exactly one US job after you confirm. I will not mark it submitted until a receipt exists.",
      tools: [{ name: "apply_one_job", args: { evaluation_id: match?.[1] }, result: "Waiting for confirm." }],
      pendingConfirm: match ? { kind: "apply", payload: { evaluation_id: match[1] } } : null,
    };
  }
  if (/inbox|thread|verification/.test(lower)) {
    return {
      reply: "Opening Recruiter inbox. I will not invent a verification code.",
      tools: [{ name: "find_inbox_thread", args: { query: text }, result: "Inbox search ready." }],
      pendingConfirm: null,
    };
  }
  if (/explain/.test(lower)) {
    return {
      reply: "Fit is scored from your source resume. I will not invent work history.",
      tools: [{ name: "explain_match", args: {}, result: context.slice(0, 400) }],
      pendingConfirm: null,
    };
  }
  return {
    reply: "Searching US matches only.",
    tools: [{ name: "search_matches", args: { country: "US" }, result: "US-only feed." }],
    pendingConfirm: null,
  };
}

function applyGuardrails(
  text: string,
  parsed: {
    reply?: string;
    tools?: Array<{ name: string; args?: Record<string, unknown>; result?: string }>;
    pendingConfirm?: { kind: string; payload?: Record<string, unknown> } | null;
  },
  context: string,
) {
  const tools = (parsed.tools || []).filter((tool) =>
    ["search_matches", "apply_one_job", "open_application", "tune_hands_off", "explain_match", "find_inbox_thread"].includes(tool.name)
  ).slice(0, 4);

  let pending = parsed.pendingConfirm ?? null;
  const applyTools = tools.filter((t) => t.name === "apply_one_job");
  if (applyTools.length > 1) {
    tools.splice(0, tools.length, applyTools[0]);
  }
  if (applyTools.length && pending?.kind !== "apply") {
    pending = { kind: "apply", payload: applyTools[0].args || {} };
  }
  if (/enable/.test(text.toLowerCase()) && /hands-?off/.test(text.toLowerCase())) {
    pending = { kind: "hands_off", payload: {} };
    if (!tools.some((t) => t.name === "tune_hands_off")) {
      tools.push({ name: "tune_hands_off", args: { preview: true }, result: "Preview only. Not saved." });
    }
  }

  const reply = (parsed.reply || "Ready.").replace(/submitted(?! only)/i, "queued");

  return {
    reply,
    tools: tools.map((t) => ({
      name: t.name,
      args: t.args || {},
      result: t.result || `${t.name} ready`,
    })),
    pendingConfirm: pending && (pending.kind === "apply" || pending.kind === "hands_off")
      ? { kind: pending.kind, payload: pending.payload || {} }
      : null,
    contextHint: context ? undefined : undefined,
  };
}

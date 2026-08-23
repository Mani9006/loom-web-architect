import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ShieldAlert, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { invokeFunction } from "@/product/lib/table";
import { useApply } from "@/product/hooks/useApply";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: string;
  undoable?: boolean;
  undo?: () => Promise<void>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: ToolCall[];
  pendingConfirm?: { kind: "apply" | "hands_off"; payload: Record<string, unknown> };
}

const STARTERS = [
  "Show my strongest US matches",
  "Explain the top match",
  "Find a verification email",
  "Preview hands-off settings",
];

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { applyEvaluation } = useApply();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I can search US matches, explain fit, open an application, find an inbox thread, or preview hands-off settings. I will never invent work history, mark submitted without a receipt, apply more than one job at a time, or enable hands-off without your explicit confirm.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function runTools(raw: ChatMessage): Promise<ChatMessage> {
    if (!raw.tools?.length) return raw;
    const tools: ToolCall[] = [];
    for (const tool of raw.tools) {
      const executed = await executeTool(tool, { navigate, applyEvaluation, userId: user?.id });
      tools.push(executed);
    }
    return { ...raw, tools };
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setBusy(true);
    try {
      const result = await invokeFunction<{
        reply?: string;
        tools?: ToolCall[];
        pendingConfirm?: ChatMessage["pendingConfirm"];
      }>("ops-assistant", {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      });

      if (result.error || !result.data?.reply) {
        const fallback = localFallback(trimmed);
        setMessages([...next, await runTools(fallback)]);
        return;
      }

      const assistant: ChatMessage = {
        role: "assistant",
        content: result.data.reply,
        tools: result.data.tools,
        pendingConfirm: result.data.pendingConfirm,
      };
      setMessages([...next, await runTools(assistant)]);
    } catch {
      setMessages([...next, await runTools(localFallback(trimmed))]);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(messageIndex: number) {
    const message = messages[messageIndex];
    const pending = message.pendingConfirm;
    if (!pending) return;
    if (pending.kind === "apply") {
      const evaluationId = String(pending.payload.evaluation_id || "");
      const applyUrl = pending.payload.apply_url ? String(pending.payload.apply_url) : undefined;
      if (!evaluationId) return;
      const draftId = await applyEvaluation(evaluationId, applyUrl);
      setMessages((prev) => prev.map((m, i) => i === messageIndex
        ? { ...m, pendingConfirm: undefined, content: draftId ? `Queued one application. Opening the packet now.` : m.content }
        : m));
    }
    if (pending.kind === "hands_off") {
      navigate("/hands-off?confirm=1");
      setMessages((prev) => prev.map((m, i) => i === messageIndex
        ? { ...m, pendingConfirm: undefined, content: "Opened Hands-off apply. Enable only after you review the preview and confirm there." }
        : m));
    }
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-[60] flex w-full max-w-[420px] flex-col border-l border-border bg-[hsl(222_28%_7%)] text-[hsl(210_20%_94%)] shadow-elevated transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-full",
      )}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-300" />
          <div>
            <p className="text-[13px] font-semibold">AI assistant</p>
            <p className="text-[11px] text-white/50">Tools + guardrails · US only</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close assistant">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message, i) => (
          <div key={i} className={cn("max-w-[92%]", message.role === "user" ? "ml-auto" : "")}>
            <div className={cn(
              "rounded-xl px-3 py-2 text-[13px] leading-relaxed",
              message.role === "user" ? "bg-teal-700 text-white" : "bg-white/5 border border-white/10",
            )}>
              {message.content}
            </div>
            {message.tools?.map((tool, ti) => (
              <div key={ti} className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-teal-300">tool · {tool.name}</p>
                <p className="mt-1 text-[12px] text-white/70">{tool.result}</p>
                {tool.undoable && tool.undo && (
                  <button type="button" onClick={() => void tool.undo?.()} className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/60 hover:text-white">
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                )}
              </div>
            ))}
            {message.pendingConfirm && (
              <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2">
                <p className="flex items-center gap-1.5 text-[12px] text-amber-200">
                  <ShieldAlert className="h-3.5 w-3.5" /> Confirm required
                </p>
                <button
                  type="button"
                  onClick={() => void confirm(i)}
                  className="mt-2 h-8 rounded-md bg-teal-600 px-3 text-[12px] font-medium text-white"
                >
                  {message.pendingConfirm.kind === "apply" ? "Apply this one job" : "Review hands-off preview"}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex gap-1 px-1">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STARTERS.map((starter) => (
            <button key={starter} type="button" onClick={() => void send(starter)} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/5">
              {starter}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask, then confirm any write…"
            className="h-8 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/35 outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-teal-600 text-white disabled:opacity-40">
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}

async function executeTool(
  tool: ToolCall,
  ctx: { navigate: (path: string) => void; applyEvaluation: (id: string, url?: string) => Promise<string | null>; userId?: string },
): Promise<ToolCall> {
  if (tool.name === "open_application" && tool.args.id) {
    ctx.navigate(`/applications/${tool.args.id}`);
    return { ...tool, result: tool.result || `Opened application ${tool.args.id}` };
  }
  if (tool.name === "search_matches") {
    ctx.navigate("/matches");
    return { ...tool, result: tool.result || "Opened Job matches (US only)." };
  }
  if (tool.name === "find_inbox_thread") {
    ctx.navigate("/inbox");
    return { ...tool, result: tool.result || "Opened Recruiter inbox." };
  }
  return tool;
}

function localFallback(text: string): ChatMessage {
  const lower = text.toLowerCase();
  if (/apply|submit/.test(lower) && !/confirm|yes, apply|apply this/.test(lower)) {
    return {
      role: "assistant",
      content: "I can apply exactly one job, and only after you confirm in this chat. Tell me which role, then confirm.",
      pendingConfirm: /eval-|evaluation/.test(lower) ? { kind: "apply", payload: { evaluation_id: text } } : undefined,
    };
  }
  if (/hands-?off|auto apply|enable/.test(lower)) {
    return {
      role: "assistant",
      content: "Hands-off apply stays off until you confirm. I can preview settings on the Hands-off page — I will not enable it from chat alone.",
      tools: [{ name: "tune_hands_off", args: { preview: true }, result: "Preview only. Nothing saved." }],
      pendingConfirm: { kind: "hands_off", payload: {} },
    };
  }
  if (/inbox|thread|verification|otp/.test(lower)) {
    return {
      role: "assistant",
      content: "Opening Recruiter inbox so you can find the thread. I will not invent a verification code.",
      tools: [{ name: "find_inbox_thread", args: { query: text }, result: "Navigated to Recruiter inbox." }],
    };
  }
  if (/explain|why|match/.test(lower)) {
    return {
      role: "assistant",
      content: "Opening Job matches. Fit scores come from your resume evidence — I will not invent employers, dates, or metrics.",
      tools: [{ name: "explain_match", args: {}, result: "Opened matches for an evidence-based explanation." }],
    };
  }
  if (/search|jobs|matches/.test(lower)) {
    return {
      role: "assistant",
      content: "Searching US matches only.",
      tools: [{ name: "search_matches", args: { country: "US" }, result: "US-only match feed." }],
    };
  }
  return {
    role: "assistant",
    content: "I can search US matches, apply one job after you confirm, open an application, preview hands-off settings, explain a match, or find an inbox thread.",
  };
}

export function notifyAssistantGuard() {
  toast.message("Assistant guardrail", { description: "That action needs an explicit confirm." });
}

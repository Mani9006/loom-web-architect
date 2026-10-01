import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { X, Send, Loader2, Sparkles } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const INTRO: Msg = {
  role: "assistant",
  content: "Hi, I'm ANU. Ask me anything about ResumePreps, what a screen does, how to get started, tips for writing a better résumé. I can't take actions for you, but I'll point you to the right button.",
};

export default function AnuChat({ open, onClose }: Props) {
  const [messages, setMessages] = useState<Msg[]>([INTRO]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("anu-chat", {
        body: { messages: next.filter((m) => m.role !== "assistant" || m !== INTRO) },
      });
      if (error) throw error;
      const reply = (data as { reply: string }).reply ?? "I couldn't reach my brain right now, try again in a moment.";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMessages([...next, {
        role: "assistant",
        content: msg.includes("402")
          ? "Your account looks inactive, check with the owner."
          : "I couldn't get through. Try again in a second, or click Feedback if this keeps happening.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const node = (
    <div
      className="fixed bottom-5 right-5 z-[100] w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-background border border-border shadow-[0_20px_48px_-12px_hsl(0_0%_0%/0.18)]"
      role="dialog"
      aria-label="Ask ANU"
    >
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-meta font-semibold text-foreground leading-tight">ANU</div>
            <div className="text-xs text-muted-foreground leading-tight">ResumePreps helper</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] px-3 py-2 rounded-lg text-meta leading-relaxed whitespace-pre-wrap break-words",
              m.role === "user"
                ? "ml-auto bg-foreground text-background"
                : "bg-muted text-foreground",
            )}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="bg-muted max-w-[85%] px-3 py-2 rounded-lg text-meta text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ANU is thinking
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about any screen or feature…"
            rows={1}
            maxLength={1000}
            className="flex-1 resize-none px-3 py-2 rounded-md bg-background border border-border text-meta leading-snug focus:outline-none focus:border-foreground/40 max-h-[120px]"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="h-9 w-9 rounded-md bg-foreground text-background flex items-center justify-center disabled:opacity-40 hover:bg-foreground/90 transition-colors shrink-0"
            aria-label="Send"
          >
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Enter to send · Shift+Enter for newline · Esc to close
        </p>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { X, Send, Loader2, HelpCircle } from "lucide-react";

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
  content: "Ask how a screen works, how to get started, or how to improve your résumé. I can't take actions for you, but I can point you to the right place.",
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
      className="fixed bottom-5 right-5 z-[100] w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] flex flex-col rounded-lg bg-card border border-border shadow-overlay"
      role="dialog"
      aria-label="Ask for help"
    >
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <div>
            <div className="text-meta font-semibold text-foreground leading-tight">Ask</div>
            <div className="text-xs text-muted-foreground leading-tight">Questions about using ResumePreps</div>
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
            Thinking
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

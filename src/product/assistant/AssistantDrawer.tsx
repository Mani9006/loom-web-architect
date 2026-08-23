import { useMutation } from "@tanstack/react-query";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };

export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I can search your US matches, queue one application, check credits, or explain a failed apply. I will not invent work history or mark anything Submitted.",
    },
  ]);
  const [input, setInput] = useState("");

  const send = useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.functions.invoke("ops-assistant", {
        body: { message: text, history: messages },
      });
      if (error) throw error;
      return (data as { reply?: string })?.reply ?? "I could not complete that.";
    },
    onSuccess: (reply) => setMessages((prev) => [...prev, { role: "assistant", content: reply }]),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20">
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-xl">Assistant</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close assistant">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[90%] px-4 py-3 text-body ${
                message.role === "assistant"
                  ? "border border-border bg-card text-foreground"
                  : "ml-auto bg-primary text-primary-foreground"
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.trim();
            if (!text) return;
            setMessages((prev) => [...prev, { role: "user", content: text }]);
            setInput("");
            send.mutate(text);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about matches, credits, or a failed apply"
            className="flex-1 border border-border bg-background px-3 py-2 text-body outline-none"
          />
          <button type="submit" className="bg-primary px-3 text-primary-foreground" disabled={send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </aside>
    </div>
  );
}

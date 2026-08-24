import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer } from "@/product/ui/Overlay";

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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assistant"
      subtitle="Confirms before applying. Never invents work history."
      className="w-full max-w-md"
      footer={
        <form
          className="flex w-full gap-2"
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
            className="rp-input"
          />
          <button type="submit" className="rp-btn rp-btn-primary" disabled={send.isPending} aria-label="Send">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      }
    >
      <div className="flex min-h-[52vh] flex-col gap-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-md px-3.5 py-2.5 text-[13px] leading-relaxed ${
              message.role === "assistant"
                ? "border border-border bg-muted/40 text-foreground"
                : "ml-auto bg-primary text-primary-foreground"
            }`}
          >
            {message.content}
          </div>
        ))}
        {send.isPending && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
        )}
      </div>
    </Drawer>
  );
}

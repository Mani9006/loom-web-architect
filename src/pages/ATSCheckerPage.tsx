import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ATSCheckerPanel, ATSMessage } from "@/components/chat/ATSCheckerPanel";
import { useToast } from "@/hooks/use-toast";

export default function ATSCheckerPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ATSMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-flash");

  const handleAnalyze = async (resumeText: string, jobDescription?: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    setIsLoading(true);
    const userContent = jobDescription
      ? `Analyze my resume for ATS compatibility:\n\n**Resume:**\n${resumeText}\n\n**Job Description:**\n${jobDescription}`
      : `Analyze my resume for ATS compatibility:\n\n${resumeText}`;

    const userMsg: ATSMessage = { id: crypto.randomUUID(), role: "user", content: userContent, timestamp: new Date() };
    setMessages([userMsg]);

    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: "", timestamp: new Date() }]);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ messages: [{ role: "user", content: userContent }], mode: "ats" }),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const c = parsed.choices?.[0]?.delta?.content;
              if (c) {
                content += c;
                setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content } : m)));
              }
            } catch {}
          }
        }
      }
    } catch {
      toast({ title: "Error", description: "ATS analysis failed", variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = async (message: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    setIsLoading(true);
    const userMsg: ATSMessage = { id: crypto.randomUUID(), role: "user", content: message, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: "", timestamp: new Date() }]);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          mode: "ats",
        }),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const c = parsed.choices?.[0]?.delta?.content;
              if (c) {
                content += c;
                setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content } : m)));
              }
            } catch {}
          }
        }
      }
    } catch {
      toast({ title: "Error", description: "Failed", variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-68px)] flex flex-col">
      <ATSCheckerPanel
        messages={messages}
        isLoading={isLoading}
        onAnalyze={handleAnalyze}
        onSendMessage={handleFollowUp}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />
    </div>
  );
}

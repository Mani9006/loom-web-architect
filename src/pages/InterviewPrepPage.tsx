import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { InterviewPrepPanel, InterviewMessage } from "@/components/chat/InterviewPrepPanel";
import { useToast } from "@/hooks/use-toast";

export default function InterviewPrepPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-flash");
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });
  }, []);

  const handleGenerate = async (resumeText: string, jobDescription: string, companyName: string, jobTitle: string, interviewType: string) => {
    if (!session) return;
    setIsLoading(true);
    const userMsg: InterviewMessage = {
      id: crypto.randomUUID(), role: "user",
      content: `Generate ${interviewType} interview questions for ${jobTitle} at ${companyName}`, timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: "", timestamp: new Date() }]);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Generate ${interviewType} interview prep for ${jobTitle} at ${companyName}.\n\nResume:\n${resumeText}\n\nJob Description:\n${jobDescription}` }],
          mode: "interview",
          agentHint: "interview",
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
      toast({ title: "Error", description: "Failed to generate", variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = async (message: string) => {
    if (!session) return;
    setIsLoading(true);
    const userMsg: InterviewMessage = { id: crypto.randomUUID(), role: "user", content: message, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: "", timestamp: new Date() }]);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          mode: "interview",
          agentHint: "interview",
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
      <InterviewPrepPanel
        messages={messages}
        isLoading={isLoading}
        onGenerate={handleGenerate}
        onSendMessage={handleFollowUp}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onBack={() => navigate("/home")}
        session={session}
      />
    </div>
  );
}

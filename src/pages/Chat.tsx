import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatInput } from "@/components/chat/ChatInput";
import { ResumeForm, ResumeData } from "@/components/resume/ResumeForm";
import { ResumeChat } from "@/components/resume/ResumeChat";
import { SidebarProvider } from "@/components/ui/sidebar";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  isThinking?: boolean;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export default function Chat() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(null);
  const [showResumeForm, setShowResumeForm] = useState(true);
  const [generationPhase, setGenerationPhase] = useState<"thinking" | "generating" | null>(null);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    if (conversationId && user) {
      loadConversation(conversationId);
      setShowResumeForm(false);
    } else {
      setCurrentConversation(null);
      setMessages([]);
      setShowResumeForm(true);
      setResumeData(null);
    }
  }, [conversationId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();
    
    setProfile(data);
  };

  const fetchConversations = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setConversations(data);
    }
  };

  const loadConversation = async (id: string) => {
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (conv) {
      setCurrentConversation(conv);
      
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (msgs) {
        setMessages(msgs as Message[]);
      }
    }
  };

  const createNewConversation = async (title: string): Promise<string | null> => {
    if (!user) return null;

    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
      return null;
    }

    await fetchConversations();
    return data.id;
  };

  const handleNewChat = () => {
    navigate("/");
    setCurrentConversation(null);
    setMessages([]);
    setInput("");
    setShowResumeForm(true);
    setResumeData(null);
  };

  const handleGenerateResume = async (data: ResumeData) => {
    if (!user || !session) return;

    setResumeData(data);
    setShowResumeForm(false);
    setIsLoading(true);
    setGenerationPhase("thinking");

    try {
      // Create conversation for this resume
      const title = `Resume: ${data.personalInfo.fullName}`;
      const convId = await createNewConversation(title);
      
      if (!convId) {
        setIsLoading(false);
        setShowResumeForm(true);
        return;
      }
      
      navigate(`/c/${convId}`);

      // Add initial user message
      const userSummary = `Generate my resume:\n• Name: ${data.personalInfo.fullName}\n• Target Role: ${data.targetRole || "General"}\n• Experience: ${data.experience.length} position(s)\n• Skills: ${data.skills.join(", ") || "Not specified"}`;
      
      const { data: savedUserMsg, error: userMsgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          role: "user",
          content: userSummary,
        })
        .select()
        .single();

      if (userMsgError) throw userMsgError;

      setMessages([savedUserMsg as Message]);

      // Create placeholder for AI response with thinking state
      const tempId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "assistant", content: "", created_at: new Date().toISOString(), isThinking: true },
      ]);

      // Simulate thinking phase
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setGenerationPhase("generating");

      // Stream AI response
      let assistantContent = "";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [],
            resumeData: data,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment and try again.");
        }
        if (response.status === 402) {
          throw new Error("AI usage limit reached. Please add credits to continue.");
        }
        throw new Error("Failed to generate resume");
      }

      // Update to show content is coming
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, isThinking: false } : m))
      );

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tempId ? { ...m, content: assistantContent } : m
                  )
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Save assistant message
      const { data: savedAssistantMsg } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          role: "assistant",
          content: assistantContent,
        })
        .select()
        .single();

      if (savedAssistantMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? (savedAssistantMsg as Message) : m))
        );
      }

      await fetchConversations();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate resume",
        variant: "destructive",
      });
      setShowResumeForm(true);
    } finally {
      setIsLoading(false);
      setGenerationPhase(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user || !session || !currentConversation) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      // Save user message
      const { data: savedUserMsg, error: userMsgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversation.id,
          role: "user",
          content: userMessage,
        })
        .select()
        .single();

      if (userMsgError) throw userMsgError;

      setMessages((prev) => [...prev, savedUserMsg as Message]);

      // Stream AI response
      let assistantContent = "";
      const tempId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ]);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [...messages, { role: "user", content: userMessage }].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment and try again.");
        }
        if (response.status === 402) {
          throw new Error("AI usage limit reached. Please add credits to continue.");
        }
        throw new Error("Failed to get AI response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tempId ? { ...m, content: assistantContent } : m
                  )
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Save assistant message
      const { data: savedAssistantMsg } = await supabase
        .from("messages")
        .insert({
          conversation_id: currentConversation.id,
          role: "assistant",
          content: assistantContent,
        })
        .select()
        .single();

      if (savedAssistantMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? (savedAssistantMsg as Message) : m))
        );
      }

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentConversation.id);

      await fetchConversations();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    await fetchConversations();
    if (currentConversation?.id === id) {
      navigate("/");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!user) return null;

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "there";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <ChatSidebar
          conversations={conversations}
          currentConversationId={currentConversation?.id}
          onNewChat={handleNewChat}
          onSelectConversation={(id) => navigate(`/c/${id}`)}
          onDeleteConversation={handleDeleteConversation}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <ChatHeader
            user={user}
            displayName={displayName}
            onSignOut={handleSignOut}
          />

          <main className="flex-1 flex flex-col overflow-hidden">
            {showResumeForm ? (
              <div className="flex-1 overflow-y-auto">
                <ResumeForm onGenerate={handleGenerateResume} isGenerating={isLoading} />
              </div>
            ) : (
              <>
                <ResumeChat
                  messages={messages}
                  messagesEndRef={messagesEndRef}
                  isGenerating={isLoading}
                  generationPhase={generationPhase}
                />

                <ChatInput
                  input={input}
                  isLoading={isLoading}
                  onInputChange={setInput}
                  onSend={handleSend}
                />
              </>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

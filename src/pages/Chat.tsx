import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { ChatSidebar, ConversationFolder } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatWelcome } from "@/components/chat/ChatWelcome";
import { GeneralChatPanel, GeneralChatMessage } from "@/components/chat/GeneralChatPanel";
import { ATSCheckerPanel, ATSMessage } from "@/components/chat/ATSCheckerPanel";
import { JobSearchPanel } from "@/components/chat/JobSearchPanel";
import { CoverLetterPanel, CoverLetterMessage } from "@/components/chat/CoverLetterPanel";
import { InterviewPrepPanel, InterviewMessage } from "@/components/chat/InterviewPrepPanel";
import { EnhancedResumeForm } from "@/components/resume/EnhancedResumeForm";
import { ResumeChatPanel, ChatMessage, ProjectOptionsData, SummaryOptionsData } from "@/components/resume/ResumeChatPanel";
import { ResumePreview } from "@/components/resume/ResumePreview";
import { OptionsPanel } from "@/components/resume/OptionsPanel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ResumeJSON, createEmptyResumeJSON } from "@/types/resume";
import { useResumeParser } from "@/hooks/use-resume-parser";

type ChatMode = "welcome" | "general" | "resume-form" | "resume-chat" | "ats-check" | "job-search" | "cover-letter" | "interview-prep";

type Conversation = {
  id: string;
  title: string;
  chat_mode: string;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
};

export default function Chat() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ConversationFolder[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("welcome");
  const [generationPhase, setGenerationPhase] = useState<"thinking" | "generating" | null>(null);
  const [resumeData, setResumeData] = useState<ResumeJSON>(createEmptyResumeJSON());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [generalMessages, setGeneralMessages] = useState<GeneralChatMessage[]>([]);
  const [atsMessages, setAtsMessages] = useState<ATSMessage[]>([]);
  // Job search is now handled internally by JobSearchPanel
  const [coverLetterMessages, setCoverLetterMessages] = useState<CoverLetterMessage[]>([]);
  const [interviewMessages, setInterviewMessages] = useState<InterviewMessage[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOptionsData[]>([]);
  const [summaryOptions, setSummaryOptions] = useState<SummaryOptionsData | null>(null);
  const [selectedModel, setSelectedModel] = useState("gemini-flash");
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { toast } = useToast();

  // Resume parser for live preview updates
  const handleResumeUpdate = useCallback((updates: Partial<ResumeJSON>) => {
    setResumeData((prev) => ({ ...prev, ...updates }));
  }, []);

  const { parseIncremental, parseComplete, reset: resetParser } = useResumeParser(
    resumeData,
    handleResumeUpdate
  );

  useEffect(() => {
    // Track if initial session check is done to prevent premature redirects
    let initialCheckDone = false;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Update state for all events
      setSession(session);
      setUser(session?.user ?? null);
      
      // Only redirect on explicit sign out, not on token refresh or initial events
      // This prevents redirect loops when switching tabs during token refresh
      if (event === 'SIGNED_OUT') {
        navigate("/auth");
      }
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      initialCheckDone = true;
      
      // Only redirect if no session on initial load
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
      fetchFolders();
    }
  }, [user]);

  // Track if we've initialized for the current user to prevent re-initialization on token refresh
  const userInitializedRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only reset state when switching to a different user or on initial load
    // Don't reset on token refresh (same user.id)
    if (conversationId && user) {
      loadConversation(conversationId);
      setChatMode("resume-chat");
    } else if (!conversationId) {
      // Only reset to welcome if this is a NEW user or we haven't initialized yet
      if (user && userInitializedRef.current !== user.id) {
        userInitializedRef.current = user.id;
        // Don't reset if already in a mode (prevents tab-switch reset)
        if (chatMode === "welcome") {
          // Keep welcome state, don't reset
        }
      } else if (!user) {
        // No user, reset everything
        setCurrentConversation(null);
        setChatMessages([]);
        setGeneralMessages([]);
        setAtsMessages([]);
        setChatMode("welcome");
        setResumeData(createEmptyResumeJSON());
        userInitializedRef.current = null;
      }
    }
  }, [conversationId, user?.id]); // Only depend on user.id, not the whole user object

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
      setConversations(data as Conversation[]);
    }
  };

  const fetchFolders = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("conversation_folders")
      .select("id, name, color")
      .order("created_at", { ascending: true });
    if (!error && data) {
      setFolders(data);
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
      
      // Determine chat mode from conversation
      const mode = (conv as any).chat_mode || "general";
      
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (msgs && msgs.length > 0) {
        const loadedMessages = msgs.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.created_at),
        }));

        // Set messages based on chat mode
        switch (mode) {
          case "general":
            setGeneralMessages(loadedMessages);
            setChatMode("general");
            break;
          case "ats-check":
            setAtsMessages(loadedMessages);
            setChatMode("ats-check");
            break;
          case "job-search":
            // Job search is self-contained in JobSearchPanel
            setChatMode("job-search");
            break;
          case "cover-letter":
            setCoverLetterMessages(loadedMessages);
            setChatMode("cover-letter");
            break;
          case "interview-prep":
            setInterviewMessages(loadedMessages);
            setChatMode("interview-prep");
            break;
          case "resume-chat":
            setChatMessages(loadedMessages);
            setChatMode("resume-chat");
            break;
          default:
            setGeneralMessages(loadedMessages);
            setChatMode("general");
        }
      }
    }
  };

  const createNewConversation = async (title: string, chatMode: string = "general"): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title, chat_mode: chatMode })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create conversation", variant: "destructive" });
      return null;
    }
    await fetchConversations();
    return data.id;
  };

  const handleNewChat = () => {
    navigate("/chat");
    setCurrentConversation(null);
    setChatMessages([]);
    setGeneralMessages([]);
    setAtsMessages([]);
    setCoverLetterMessages([]);
    setInterviewMessages([]);
    setChatMode("welcome");
    setResumeData(createEmptyResumeJSON());
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    const { error } = await supabase
      .from("conversations")
      .update({ title: newTitle })
      .eq("id", id);
    
    if (error) {
      toast({ title: "Error", description: "Failed to rename conversation", variant: "destructive" });
      return;
    }
    
    // Update local state
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, title: newTitle } : conv))
    );
    
    if (currentConversation?.id === id) {
      setCurrentConversation((prev) => prev ? { ...prev, title: newTitle } : null);
    }
  };

  const handleCreateFolder = async (name: string, color: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("conversation_folders")
      .insert({ user_id: user.id, name, color });
    
    if (error) {
      toast({ title: "Error", description: "Failed to create folder", variant: "destructive" });
      return;
    }
    
    await fetchFolders();
  };

  const handleDeleteFolder = async (id: string) => {
    const { error } = await supabase
      .from("conversation_folders")
      .delete()
      .eq("id", id);
    
    if (error) {
      toast({ title: "Error", description: "Failed to delete folder", variant: "destructive" });
      return;
    }
    
    await fetchFolders();
    await fetchConversations(); // Refresh conversations as folder_id is set to null
  };

  const handleMoveToFolder = async (conversationId: string, folderId: string | null) => {
    const { error } = await supabase
      .from("conversations")
      .update({ folder_id: folderId })
      .eq("id", conversationId);
    
    if (error) {
      toast({ title: "Error", description: "Failed to move conversation", variant: "destructive" });
      return;
    }
    
    // Update local state
    setConversations((prev) =>
      prev.map((conv) => (conv.id === conversationId ? { ...conv, folder_id: folderId } : conv))
    );
  };

  const handleStartResume = () => {
    setChatMode("resume-form");
  };

  const handleStartATSCheck = () => {
    setChatMode("ats-check");
    setAtsMessages([]);
  };

  const handleStartJobSearch = () => {
    setChatMode("job-search");
  };

  const handleStartCoverLetter = () => {
    setChatMode("cover-letter");
    setCoverLetterMessages([]);
  };

  const handleStartInterviewPrep = () => {
    setChatMode("interview-prep");
    setInterviewMessages([]);
  };

  const handleGeneralChat = async (message: string) => {
    if (!session || !user) return;

    // Switch to general chat mode if in welcome
    if (chatMode === "welcome") {
      setChatMode("general");
    }

    // Create conversation if none exists
    let convId = currentConversation?.id;
    if (!convId) {
      const title = message.length > 50 ? message.substring(0, 47) + "..." : message;
      convId = await createNewConversation(title, "general");
      if (convId) {
        const newConv = { id: convId, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        setCurrentConversation(newConv as any);
      }
    }

    setIsLoading(true);
    const userMsg: GeneralChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setGeneralMessages((prev) => [...prev, userMsg]);

    // Save user message to database
    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "user",
        content: message,
      });
    }

    const tempId = crypto.randomUUID();
    setGeneralMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date(), isThinking: true },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [...generalMessages, userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            mode: "general",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      setGeneralMessages((prev) =>
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
                setGeneralMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Save assistant message to database
      if (convId && assistantContent) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: assistantContent,
        });
        // Update conversation timestamp
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        await fetchConversations();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response",
        variant: "destructive",
      });
      setGeneralMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  // ATS Score Check Handler
  const handleATSAnalyze = async (resumeText: string, jobDescription?: string) => {
    if (!session) return;

    setIsLoading(true);
    const userContent = jobDescription
      ? `Please analyze my resume for ATS compatibility against this job description:\n\n**Resume:**\n${resumeText}\n\n**Job Description:**\n${jobDescription}`
      : `Please analyze my resume for ATS compatibility:\n\n${resumeText}`;

    const userMsg: ATSMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };

    setAtsMessages([userMsg]);

    const tempId = crypto.randomUUID();
    setAtsMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date(), isThinking: true },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an expert ATS (Applicant Tracking System) resume analyzer. Analyze the resume and provide:

1. **ATS Score**: A number from 0-100 representing ATS compatibility. Format: "**ATS Score: XX/100**"
2. **Strengths**: What the resume does well for ATS
3. **Issues Found**: Specific problems that could hurt ATS parsing
4. **Missing Keywords**: Important keywords that should be added
5. **Formatting Issues**: Any formatting that ATS systems might struggle with
6. **Recommendations**: Specific actionable improvements

Be detailed and specific. If a job description is provided, also analyze keyword matching.`,
              },
              { role: "user", content: userContent },
            ],
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded.");
        if (response.status === 402) throw new Error("AI usage limit reached.");
        throw new Error("Failed to analyze resume");
      }

      setAtsMessages((prev) =>
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
                // Extract ATS score from content
                const scoreMatch = assistantContent.match(/ATS Score:\s*(\d+)/i);
                const atsScore = scoreMatch ? parseInt(scoreMatch[1]) : undefined;

                setAtsMessages((prev) =>
                  prev.map((m) =>
                    m.id === tempId ? { ...m, content: assistantContent, atsScore } : m
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze resume",
        variant: "destructive",
      });
      setAtsMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleATSFollowUp = async (message: string) => {
    if (!session) return;

    setIsLoading(true);
    const userMsg: ATSMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setAtsMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setAtsMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: atsMessages.concat(userMsg).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to get response");

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
                setAtsMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response",
        variant: "destructive",
      });
      setAtsMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  // Job Search is now self-contained in JobSearchPanel

  // Cover Letter Generator Handler
  const handleCoverLetterGenerate = async (resumeText: string, jobDescription: string, companyName: string, jobTitle: string, template: string = "modern") => {
    if (!session) return;

    // Import template prompt helper
    const { getTemplatePrompt } = await import("@/components/chat/CoverLetterTemplateSelector");
    const templatePrompt = getTemplatePrompt(template as "formal" | "creative" | "modern");

    setIsLoading(true);
    const userContent = `Generate a professional cover letter for the following:

**Company:** ${companyName || "the company"}
**Position:** ${jobTitle || "the position"}

**My Resume/Background:**
${resumeText}

**Job Description:**
${jobDescription}`;

    const userMsg: CoverLetterMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };

    setCoverLetterMessages([userMsg]);

    const tempId = crypto.randomUUID();
    setCoverLetterMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date(), isThinking: true },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an expert cover letter writer. Create compelling, personalized cover letters.

${templatePrompt}

Guidelines:
- Keep it concise (3-4 paragraphs, under 400 words)
- Use specific achievements and skills from their resume that match the job description
- Reference the company's mission, values, or recent news when possible
- Highlight 2-3 key achievements that directly relate to the role

Output ONLY the cover letter text, properly formatted with paragraphs. Do not include any meta-commentary.`,
              },
              { role: "user", content: userContent },
            ],
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded.");
        if (response.status === 402) throw new Error("AI usage limit reached.");
        throw new Error("Failed to generate cover letter");
      }

      setCoverLetterMessages((prev) =>
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
                setCoverLetterMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate cover letter",
        variant: "destructive",
      });
      setCoverLetterMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCoverLetterFollowUp = async (message: string) => {
    if (!session) return;

    setIsLoading(true);
    const userMsg: CoverLetterMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setCoverLetterMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setCoverLetterMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "You are a cover letter writing assistant. Help the user revise and improve their cover letter based on their feedback. Output only the revised cover letter or the specific changes they requested.",
              },
              ...coverLetterMessages.concat(userMsg).map((m) => ({
                role: m.role,
                content: m.content,
              })),
            ],
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to get response");

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
                setCoverLetterMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response",
        variant: "destructive",
      });
      setCoverLetterMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  // Interview Prep Handler
  const handleInterviewGenerate = async (resumeText: string, jobDescription: string, companyName: string, jobTitle: string, interviewType: string) => {
    if (!session) return;

    setIsLoading(true);
    const typeLabels: Record<string, string> = {
      behavioral: "behavioral (STAR method)",
      technical: "technical skills and knowledge",
      situational: "situational and problem-solving",
      mixed: "comprehensive (behavioral, technical, and situational)",
    };

    const userContent = `Generate ${typeLabels[interviewType] || "comprehensive"} interview questions for:

**Company:** ${companyName || "the company"}
**Position:** ${jobTitle || "the position"}

**My Resume/Background:**
${resumeText}

**Job Description:**
${jobDescription}`;

    const userMsg: InterviewMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };

    setInterviewMessages([userMsg]);

    const tempId = crypto.randomUUID();
    setInterviewMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date(), isThinking: true },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are an expert interview coach. Generate realistic interview questions based on the candidate's resume and target job.

For ${typeLabels[interviewType] || "comprehensive"} interviews, provide:

1. **Opening Questions** (2-3 questions)
   - Warm-up questions about background and motivation

2. **Core Questions** (5-7 questions based on interview type)
   - For behavioral: STAR-format questions about past experiences
   - For technical: Role-specific technical knowledge questions
   - For situational: Hypothetical scenarios and problem-solving
   - For mixed: A blend of all types

3. **Role-Specific Questions** (3-4 questions)
   - Questions directly related to the job requirements

4. **Closing Questions** (2 questions)
   - Questions the candidate should ask the interviewer

For each question:
- Explain why this question is asked
- Provide tips on how to answer effectively
- Reference specific skills or experiences from their resume when relevant

Format with clear headers and bullet points. Be specific to the role and company.`,
              },
              { role: "user", content: userContent },
            ],
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded.");
        if (response.status === 402) throw new Error("AI usage limit reached.");
        throw new Error("Failed to generate interview questions");
      }

      setInterviewMessages((prev) =>
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
                setInterviewMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate questions",
        variant: "destructive",
      });
      setInterviewMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInterviewFollowUp = async (message: string) => {
    if (!session) return;

    setIsLoading(true);
    const userMsg: InterviewMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setInterviewMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setInterviewMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    try {
      let assistantContent = "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: interviewMessages.concat(userMsg).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to get response");

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
                setInterviewMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response",
        variant: "destructive",
      });
      setInterviewMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  };

  const calculateTotalExperience = (experience: ResumeJSON["experience"]): number => {
    let totalMonths = 0;
    const now = new Date();

    experience.forEach((exp) => {
      if (!exp.start_date) return;
      const start = parseDate(exp.start_date);
      const end = exp.end_date?.toLowerCase() === "present" ? now : parseDate(exp.end_date);
      if (start && end) {
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        totalMonths += Math.max(0, months);
      }
    });

    return Math.round(totalMonths / 12);
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr || dateStr.toLowerCase() === "present") return null;
    // Handle formats like "Feb 2024", "Feb '24", "2024"
    const parts = dateStr.match(/(\w+)?\s*'?(\d{2,4})/);
    if (parts) {
      const monthStr = parts[1];
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      const monthMap: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const month = monthStr ? monthMap[monthStr.toLowerCase().slice(0, 3)] || 0 : 0;
      return new Date(year, month, 1);
    }
    return null;
  };

  const handleGenerateResume = async () => {
    if (!user || !session) return;

    setIsLoading(true);
    setGenerationPhase("thinking");
    setChatMode("resume-chat");
    resetParser(); // Reset parser state for new generation

    // Calculate total experience
    const totalYears = calculateTotalExperience(resumeData.experience);

    try {
      const title = `Resume: ${resumeData.header.name || "Untitled"}`;
      const convId = await createNewConversation(title);
      if (!convId) {
        setIsLoading(false);
        setChatMode("resume-form");
        return;
      }
      navigate(`/c/${convId}`);

      // Build context message from experience
      const experienceSummary = resumeData.experience
        .filter((exp) => exp.company_or_client)
        .map((exp) => `- ${exp.role} at ${exp.company_or_client} from ${exp.start_date} to ${exp.end_date || "Present"}`)
        .join("\n");

      const userContent = `Generate my resume using the Professional template.

**Total Experience**: ${totalYears}+ years

**Personal Info**: ${resumeData.header.name}, ${resumeData.header.email}

**Experience**:
${experienceSummary}

**Instructions**:
1. Improve bullet points for each role with strong action verbs
2. Generate a compelling professional summary
3. Make it ATS-friendly
4. Quantify achievements where possible`;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
        timestamp: new Date(),
      };

      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "user",
        content: userContent,
      });

      setChatMessages([userMsg]);

      // Add thinking placeholder
      const tempId = crypto.randomUUID();
      setChatMessages((prev) => [
        ...prev,
        { id: tempId, role: "assistant", content: "", timestamp: new Date(), isThinking: true },
      ]);

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
            resumeData: {
              ...resumeData,
              totalYearsExperience: totalYears,
            },
            selectedModel,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded. Please wait and try again.");
        if (response.status === 402) throw new Error("AI usage limit reached. Please add credits.");
        throw new Error("Failed to generate resume");
      }

      setChatMessages((prev) =>
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
                setChatMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
                // Live parse for real-time preview updates
                parseIncremental(assistantContent);
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Full parse after streaming complete for experience options
      parseComplete(assistantContent);
      parseAndUpdateResumeFromAI(assistantContent);

      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: assistantContent,
      });

      await fetchConversations();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate resume",
        variant: "destructive",
      });
      setChatMode("resume-form");
    } finally {
      setIsLoading(false);
      setGenerationPhase(null);
    }
  };

  const parseAndUpdateResumeFromAI = (content: string) => {
    // Extract summary options
    const summaryMatch = content.match(/## Professional Summary[\s\S]*?\*\*Option 1:\*\*\s*([\s\S]*?)\*\*Option 2:\*\*\s*([\s\S]*?)(?=\n##|$)/);
    
    if (summaryMatch) {
      const option1 = summaryMatch[1].trim();
      const option2 = summaryMatch[2].trim();
      
      const newSummaryOptions: SummaryOptionsData = {
        options: [
          { id: crypto.randomUUID(), content: option1, isSelected: true },
          { id: crypto.randomUUID(), content: option2, isSelected: false },
        ],
      };
      
      setSummaryOptions(newSummaryOptions);
      setResumeData((prev) => ({
        ...prev,
        summaryOptions: newSummaryOptions.options,
        summary: option1,
      }));
    }

    // Extract project options for each client
    const experienceSection = content.match(/## Experience([\s\S]*?)(?=\n## Education|$)/);
    if (experienceSection) {
      const clientSections = experienceSection[1].split(/### /).filter(Boolean);
      const newProjectOptions: ProjectOptionsData[] = [];
      
      clientSections.forEach((section) => {
        // Parse role and company from "Role | Company Name"
        const headerMatch = section.match(/^([^|]+)\s*\|\s*([^\n]+)/);
        if (!headerMatch) return;
        
        const role = headerMatch[1].trim();
        const companyName = headerMatch[2].trim();
        
        // Find matching experience in resumeData
        const matchingExp = resumeData.experience.find(
          (exp) => exp.company_or_client.toLowerCase() === companyName.toLowerCase() || 
                   exp.role.toLowerCase() === role.toLowerCase()
        );
        
        if (!matchingExp) return;
        
        // Extract bullet options
        const option1Match = section.match(/\*\*(?:Project )?Option 1[^*]*\*\*\s*([\s\S]*?)(?=\*\*(?:Project )?Option 2|$)/);
        const option2Match = section.match(/\*\*(?:Project )?Option 2[^*]*\*\*\s*([\s\S]*?)(?=\n###|\n##|$)/);
        
        if (option1Match && option2Match) {
          const extractBullets = (text: string): string[] => {
            return text
              .split('\n')
              .filter((line) => line.trim().startsWith('-'))
              .map((line) => line.replace(/^-\s*/, '').trim())
              .filter(Boolean);
          };
          
          const bullets1 = extractBullets(option1Match[1]);
          const bullets2 = extractBullets(option2Match[1]);
          
          const expProjectOptions: ProjectOptionsData = {
            clientId: matchingExp.id,
            clientName: companyName,
            role,
            options: [
              { id: crypto.randomUUID(), title: "Option 1", bullets: bullets1, isSelected: true },
              { id: crypto.randomUUID(), title: "Option 2", bullets: bullets2, isSelected: false },
            ],
          };
          
          newProjectOptions.push(expProjectOptions);
        }
      });
      
      setProjectOptions(newProjectOptions);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!session || !currentConversation) return;

    setIsLoading(true);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    await supabase.from("messages").insert({
      conversation_id: currentConversation.id,
      role: "user",
      content: message,
    });

    setChatMessages((prev) => [...prev, userMsg]);

    const tempId = crypto.randomUUID();
    setChatMessages((prev) => [
      ...prev,
      { id: tempId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    try {
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
            messages: [...chatMessages, userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            currentResume: resumeData,
            selectedModel,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded.");
        if (response.status === 402) throw new Error("AI usage limit reached.");
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
                setChatMessages((prev) =>
                  prev.map((m) => (m.id === tempId ? { ...m, content: assistantContent } : m))
                );
                // Live parse for real-time preview updates
                parseIncremental(assistantContent);
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Full parse after streaming complete for experience options
      parseComplete(assistantContent);

      await supabase.from("messages").insert({
        conversation_id: currentConversation.id,
        role: "assistant",
        content: assistantContent,
      });

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

  const handleSelectSummary = (optionId: string) => {
    // Update resume data with selected summary
    const selectedOption = summaryOptions?.options.find(opt => opt.id === optionId);
    if (selectedOption) {
      setResumeData((prev) => ({
        ...prev,
        summary: selectedOption.content,
      }));
    }

    // Update options panel state
    setSummaryOptions((prev) => prev ? {
      ...prev,
      options: prev.options.map((opt) => ({
        ...opt,
        isSelected: opt.id === optionId,
      })),
    } : null);
  };

  const handleSelectProject = (experienceId: string, optionId: string) => {
    // Find the selected option and update the experience bullets
    const projectOpt = projectOptions.find(p => p.clientId === experienceId);
    const selectedOption = projectOpt?.options.find(o => o.id === optionId);
    
    if (selectedOption) {
      setResumeData((prev) => ({
        ...prev,
        experience: prev.experience.map((exp) =>
          exp.id === experienceId
            ? { ...exp, bullets: selectedOption.bullets }
            : exp
        ),
      }));
    }

    // Update options panel state
    setProjectOptions((prev) =>
      prev.map((expData) =>
        expData.clientId === experienceId
          ? {
              ...expData,
              options: expData.options.map((opt) => ({
                ...opt,
                isSelected: opt.id === optionId,
              })),
            }
          : expData
      )
    );
  };

  // Store deleted conversation for undo
  const [deletedConversation, setDeletedConversation] = useState<{
    id: string;
    data: any;
    messages: any[];
  } | null>(null);

  const handleDeleteConversation = async (id: string) => {
    // First, get the conversation and messages for undo
    const { data: convData } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .single();
    
    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id);

    // Store for undo
    setDeletedConversation({
      id,
      data: convData,
      messages: messagesData || [],
    });

    // Delete messages first, then conversation
    await supabase.from("messages").delete().eq("conversation_id", id);
    await supabase.from("conversations").delete().eq("id", id);
    await fetchConversations();
    
    if (currentConversation?.id === id) {
      navigate("/chat");
    }

    // Show toast with undo option
    toast({
      title: "Conversation deleted",
      description: convData?.title || "Conversation",
      action: (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (convData) {
              // Restore conversation
              await supabase.from("conversations").insert(convData);
              // Restore messages
              if (messagesData && messagesData.length > 0) {
                await supabase.from("messages").insert(messagesData);
              }
              await fetchConversations();
              setDeletedConversation(null);
              toast({
                title: "Conversation restored",
                description: convData.title,
              });
            }
          }}
        >
          Undo
        </Button>
      ),
    });
  };

  const handleClearAllConversations = async () => {
    // Delete all messages first
    for (const conv of conversations) {
      await supabase.from("messages").delete().eq("conversation_id", conv.id);
    }
    // Delete all conversations
    await supabase.from("conversations").delete().eq("user_id", user?.id);
    await fetchConversations();
    navigate("/chat");
    toast({
      title: "All conversations cleared",
      description: `${conversations.length} conversations deleted`,
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!user) return null;

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "there";

  return (
    <SidebarProvider>
      <div className="flex h-full w-full overflow-hidden bg-background">
        <ChatSidebar
          conversations={conversations}
          currentConversationId={currentConversation?.id}
          folders={folders}
          onNewChat={handleNewChat}
          onSelectConversation={(id) => navigate(`/c/${id}`)}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveToFolder={handleMoveToFolder}
          onClearAllConversations={handleClearAllConversations}
        />

        <div className="flex-1 flex flex-col min-w-0">

          <main className="flex-1 flex overflow-hidden">
            {/* Welcome / General Chat Mode */}
            {(chatMode === "welcome" || chatMode === "general") && (
              <div className="flex-1">
                <GeneralChatPanel
                  messages={generalMessages}
                  isLoading={isLoading}
                  onSendMessage={handleGeneralChat}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  welcomeComponent={
                    chatMode === "welcome" ? (
                      <ChatWelcome
                        displayName={displayName}
                        onSuggestionClick={handleGeneralChat}
                        onStartResume={handleStartResume}
                        onStartATSCheck={handleStartATSCheck}
                        onStartJobSearch={handleStartJobSearch}
                        onStartCoverLetter={handleStartCoverLetter}
                        onStartInterviewPrep={handleStartInterviewPrep}
                      />
                    ) : undefined
                  }
                />
              </div>
            )}

            {/* ATS Check Mode */}
            {chatMode === "ats-check" && (
              <div className="flex-1">
                <ATSCheckerPanel
                  messages={atsMessages}
                  isLoading={isLoading}
                  onAnalyze={handleATSAnalyze}
                  onSendMessage={handleATSFollowUp}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                />
              </div>
            )}

            {/* Job Search Mode */}
            {chatMode === "job-search" && (
              <div className="flex-1">
                <JobSearchPanel
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                />
              </div>
            )}

            {/* Cover Letter Mode */}
            {chatMode === "cover-letter" && (
              <div className="flex-1">
                <CoverLetterPanel
                  messages={coverLetterMessages}
                  isLoading={isLoading}
                  onGenerate={handleCoverLetterGenerate}
                  onSendMessage={handleCoverLetterFollowUp}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  onBack={handleNewChat}
                />
              </div>
            )}

            {/* Interview Prep Mode */}
            {chatMode === "interview-prep" && (
              <div className="flex-1">
                <InterviewPrepPanel
                  messages={interviewMessages}
                  isLoading={isLoading}
                  onGenerate={handleInterviewGenerate}
                  onSendMessage={handleInterviewFollowUp}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  onBack={handleNewChat}
                  session={session}
                />
              </div>
            )}

            {/* Resume Form Mode */}
            {chatMode === "resume-form" && (
              <div className="flex-1 relative">
                <EnhancedResumeForm
                  data={resumeData}
                  onChange={setResumeData}
                  onGenerate={handleGenerateResume}
                  isGenerating={isLoading}
                />
              </div>
            )}

            {/* Resume Chat Mode */}
            {chatMode === "resume-chat" && (
              <>
                {/* Chat Panel - Left */}
                <div className="w-[400px] border-r border-border flex flex-col h-full overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ResumeChatPanel
                      messages={chatMessages}
                      isLoading={isLoading}
                      generationPhase={generationPhase}
                      onSendMessage={handleSendMessage}
                      selectedModel={selectedModel}
                      onModelChange={setSelectedModel}
                    />
                  </div>
                  
                  {(projectOptions.length > 0 || summaryOptions) && (
                    <div className="shrink-0 max-h-[280px] overflow-y-auto border-t border-border">
                      <OptionsPanel
                        projectOptions={projectOptions}
                        summaryOptions={summaryOptions}
                        onSelectProject={handleSelectProject}
                        onSelectSummary={handleSelectSummary}
                      />
                    </div>
                  )}
                </div>

                {/* Resume Preview - Right */}
                <div className="flex-1 h-full overflow-y-auto bg-muted/30">
                  <ResumePreview data={resumeData} isGenerating={isLoading} />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

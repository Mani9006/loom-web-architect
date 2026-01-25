import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { EnhancedResumeForm } from "@/components/resume/EnhancedResumeForm";
import { ResumeChatPanel, ChatMessage, ProjectOptionsData, SummaryOptionsData } from "@/components/resume/ResumeChatPanel";
import { ResumePreview } from "@/components/resume/ResumePreview";
import { OptionsPanel } from "@/components/resume/OptionsPanel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ResumeData, Client } from "@/types/resume";

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

const createEmptyResumeData = (): ResumeData => ({
  templateId: "",
  personalInfo: {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    portfolio: "",
  },
  summary: "",
  summaryOptions: [],
  totalYearsExperience: 0,
  clients: [
    {
      id: crypto.randomUUID(),
      name: "",
      industry: "",
      location: "",
      role: "",
      startDate: "",
      endDate: "",
      isCurrent: false,
      responsibilities: "",
      projects: [],
    },
  ],
  education: [
    {
      id: crypto.randomUUID(),
      school: "",
      degree: "",
      field: "",
      graduationDate: "",
      gpa: "",
    },
  ],
  certifications: [],
  skillCategories: [],
  targetRole: "",
});

export default function Chat() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [generationPhase, setGenerationPhase] = useState<"thinking" | "generating" | null>(null);
  const [resumeData, setResumeData] = useState<ResumeData>(createEmptyResumeData());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOptionsData[]>([]);
  const [summaryOptions, setSummaryOptions] = useState<SummaryOptionsData | null>(null);
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
      setShowForm(false);
    } else {
      setCurrentConversation(null);
      setChatMessages([]);
      setShowForm(true);
      setResumeData(createEmptyResumeData());
    }
  }, [conversationId, user]);

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
        setChatMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
          }))
        );
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
      toast({ title: "Error", description: "Failed to create conversation", variant: "destructive" });
      return null;
    }
    await fetchConversations();
    return data.id;
  };

  const handleNewChat = () => {
    navigate("/");
    setCurrentConversation(null);
    setChatMessages([]);
    setShowForm(true);
    setResumeData(createEmptyResumeData());
  };

  const calculateTotalExperience = (clients: Client[]): number => {
    let totalMonths = 0;
    const now = new Date();

    clients.forEach((client) => {
      if (!client.startDate) return;
      const start = parseDate(client.startDate);
      const end = client.isCurrent ? now : parseDate(client.endDate);
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
    setShowForm(false);

    // Calculate total experience
    const totalYears = calculateTotalExperience(resumeData.clients);
    setResumeData((prev) => ({ ...prev, totalYearsExperience: totalYears }));

    try {
      const title = `Resume: ${resumeData.personalInfo.fullName}`;
      const convId = await createNewConversation(title);
      if (!convId) {
        setIsLoading(false);
        setShowForm(true);
        return;
      }
      navigate(`/c/${convId}`);

      // Build context message
      const clientSummary = resumeData.clients
        .filter((c) => c.name)
        .map((c) => `- ${c.role} at ${c.name} (${c.industry || "N/A"}) from ${c.startDate} to ${c.isCurrent ? "Present" : c.endDate}${c.responsibilities ? `: ${c.responsibilities}` : ""}`)
        .join("\n");

      const userContent = `Generate my resume using the ${resumeData.templateId} template.

**Target Role**: ${resumeData.targetRole || "General"}
**Total Experience**: ${totalYears}+ years

**Personal Info**: ${resumeData.personalInfo.fullName}, ${resumeData.personalInfo.email}

**Clients/Experience**:
${clientSummary}

**Instructions**:
1. Generate 2 different project bullet options for EACH client/role
2. Generate 2 summary options based on all experiences combined
3. Calculate and include total years of experience in summaries
4. Use strong action verbs and quantify achievements
5. Make it ATS-friendly for the target role`;

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
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Parse and update resume data from response
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
      setShowForm(true);
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
        // Parse role and client name from "Role | Client Name"
        const headerMatch = section.match(/^([^|]+)\s*\|\s*([^\n]+)/);
        if (!headerMatch) return;
        
        const role = headerMatch[1].trim();
        const clientName = headerMatch[2].trim();
        
        // Find matching client in resumeData
        const matchingClient = resumeData.clients.find(
          (c) => c.name.toLowerCase() === clientName.toLowerCase() || 
                 c.role.toLowerCase() === role.toLowerCase()
        );
        
        if (!matchingClient) return;
        
        // Extract Project Option 1 and Option 2
        const option1Match = section.match(/\*\*Project Option 1[^*]*\*\*\s*([\s\S]*?)(?=\*\*Project Option 2|$)/);
        const option2Match = section.match(/\*\*Project Option 2[^*]*\*\*\s*([\s\S]*?)(?=\n###|\n##|$)/);
        
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
          
          const clientProjectOptions: ProjectOptionsData = {
            clientId: matchingClient.id,
            clientName,
            role,
            options: [
              { id: crypto.randomUUID(), title: "Option 1", bullets: bullets1, isSelected: true },
              { id: crypto.randomUUID(), title: "Option 2", bullets: bullets2, isSelected: false },
            ],
          };
          
          newProjectOptions.push(clientProjectOptions);
          
          // Update client with project options - select first by default
          setResumeData((prev) => ({
            ...prev,
            clients: prev.clients.map((c) =>
              c.id === matchingClient.id
                ? { ...c, projects: clientProjectOptions.options }
                : c
            ),
          }));
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
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

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
    // Update resume data
    const selectedOption = summaryOptions?.options.find(opt => opt.id === optionId);
    setResumeData((prev) => ({
      ...prev,
      summaryOptions: prev.summaryOptions.map((opt) => ({
        ...opt,
        isSelected: opt.id === optionId,
      })),
      summary: selectedOption?.content || prev.summary,
    }));

    // Update options panel state
    setSummaryOptions((prev) => prev ? {
      ...prev,
      options: prev.options.map((opt) => ({
        ...opt,
        isSelected: opt.id === optionId,
      })),
    } : null);
  };

  const handleSelectProject = (clientId: string, optionId: string) => {
    // Update resume data
    setResumeData((prev) => ({
      ...prev,
      clients: prev.clients.map((client) =>
        client.id === clientId
          ? {
              ...client,
              projects: client.projects.map((p) => ({
                ...p,
                isSelected: p.id === optionId,
              })),
            }
          : client
      ),
    }));

    // Update options panel state
    setProjectOptions((prev) =>
      prev.map((clientData) =>
        clientData.clientId === clientId
          ? {
              ...clientData,
              options: clientData.options.map((opt) => ({
                ...opt,
                isSelected: opt.id === optionId,
              })),
            }
          : clientData
      )
    );
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
      {/*
        Fixed-screen layout:
        - Prevent the overall page from scrolling
        - Allow only the left chat message viewport to scroll (handled inside ResumeChatPanel)
        - Keep the right resume preview pane fixed
      */}
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <ChatSidebar
          conversations={conversations}
          currentConversationId={currentConversation?.id}
          onNewChat={handleNewChat}
          onSelectConversation={(id) => navigate(`/c/${id}`)}
          onDeleteConversation={handleDeleteConversation}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <ChatHeader user={user} displayName={displayName} onSignOut={handleSignOut} />

          <main className="flex-1 flex overflow-hidden">
            {showForm ? (
              <div className="flex-1 relative">
                <EnhancedResumeForm
                  data={resumeData}
                  onChange={setResumeData}
                  onGenerate={handleGenerateResume}
                  isGenerating={isLoading}
                />
              </div>
            ) : (
              <>
                {/* Chat Panel - Left - Only this scrolls */}
                <div className="w-[400px] border-r border-border flex flex-col h-full overflow-hidden">
                  {/* Chat messages - only this part scrolls */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ResumeChatPanel
                      messages={chatMessages}
                      isLoading={isLoading}
                      generationPhase={generationPhase}
                      onSendMessage={handleSendMessage}
                    />
                  </div>
                  
                  {/* Options Panel - fixed at bottom of chat panel */}
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

                {/* Resume Preview - Right - Fixed, scrolls only if content exceeds viewport */}
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

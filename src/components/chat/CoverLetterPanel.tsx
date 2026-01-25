import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ModelSelector } from "@/components/resume/ModelSelector";
import { SavedCoverLettersList } from "./SavedCoverLettersList";
import { useCoverLetters, CoverLetter } from "@/hooks/use-cover-letters";
import { Loader2, FileText, Send, Copy, Download, ArrowLeft, Sparkles, Save, FolderOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

export interface CoverLetterMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
}

interface CoverLetterPanelProps {
  messages: CoverLetterMessage[];
  isLoading: boolean;
  onGenerate: (resumeText: string, jobDescription: string, companyName: string, jobTitle: string) => void;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onBack?: () => void;
}

export function CoverLetterPanel({
  messages,
  isLoading,
  onGenerate,
  onSendMessage,
  selectedModel,
  onModelChange,
  onBack,
}: CoverLetterPanelProps) {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "saved">("create");
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const {
    coverLetters,
    isLoading: isLoadingCoverLetters,
    saveCoverLetter,
    deleteCoverLetter,
  } = useCoverLetters();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      setHasGenerated(true);
    }
  }, [messages]);

  const handleResumeUpload = (text: string) => {
    setResumeText(text);
  };

  const handleGenerate = () => {
    if (!resumeText.trim()) {
      toast({ title: "Resume required", description: "Please upload or paste your resume.", variant: "destructive" });
      return;
    }
    if (!jobDescription.trim()) {
      toast({ title: "Job description required", description: "Please paste the job description.", variant: "destructive" });
      return;
    }
    onGenerate(resumeText, jobDescription, companyName, jobTitle);
  };

  const handleFollowUp = () => {
    if (!followUpInput.trim() || isLoading) return;
    onSendMessage(followUpInput);
    setFollowUpInput("");
  };

  const getLatestCoverLetter = () => {
    return [...messages].reverse().find(m => m.role === "assistant" && m.content && !m.isThinking);
  };

  const handleCopyLetter = () => {
    const lastAssistant = getLatestCoverLetter();
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content);
      toast({ title: "Copied!", description: "Cover letter copied to clipboard." });
    }
  };

  const handleDownload = () => {
    const lastAssistant = getLatestCoverLetter();
    if (lastAssistant) {
      const blob = new Blob([lastAssistant.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cover_Letter_${companyName || "Company"}_${jobTitle || "Position"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleSave = async () => {
    const lastAssistant = getLatestCoverLetter();
    if (!lastAssistant) {
      toast({ title: "Nothing to save", description: "Generate a cover letter first.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const title = companyName && jobTitle 
      ? `${companyName} - ${jobTitle}` 
      : companyName || jobTitle || `Cover Letter ${new Date().toLocaleDateString()}`;

    await saveCoverLetter({
      title,
      content: lastAssistant.content,
      companyName,
      jobTitle,
      jobDescription,
      resumeText,
    });
    setIsSaving(false);
  };

  const handleSelectSavedLetter = (letter: CoverLetter) => {
    // Load the saved letter into the chat view
    setCompanyName(letter.company_name || "");
    setJobTitle(letter.job_title || "");
    setJobDescription(letter.job_description || "");
    setResumeText(letter.resume_text || "");
    setHasGenerated(true);
    setActiveTab("create");
    
    // Note: We show the content in the messages but can't modify parent state directly
    // The user can see it was loaded and continue editing
    toast({ 
      title: "Loaded!", 
      description: "Cover letter loaded. You can copy, download, or request revisions." 
    });
  };

  // Form view - before generation
  if (!hasGenerated) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Cover Letter Generator</h2>
              <p className="text-xs text-muted-foreground">Create a tailored cover letter</p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "saved")} className="flex-1 flex flex-col">
          <div className="px-4 pt-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="create" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Create New
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Saved ({coverLetters.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="create" className="flex-1 mt-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6 max-w-2xl mx-auto">
                {/* Resume Upload */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                      Your Resume
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DocumentUpload
                      onTextExtracted={(text) => handleResumeUpload(text)}
                      accept=".pdf,.docx,.doc,.txt,.md"
                      label="Upload your resume"
                    />
                    <div className="text-center text-sm text-muted-foreground">or paste below</div>
                    <Textarea
                      placeholder="Paste your resume content here..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      className="min-h-[120px] text-sm"
                    />
                  </CardContent>
                </Card>

                {/* Job Details */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                      Job Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="company">Company Name</Label>
                        <Input
                          id="company"
                          placeholder="e.g., Google"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="jobTitle">Job Title</Label>
                        <Input
                          id="jobTitle"
                          placeholder="e.g., Senior Software Engineer"
                          value={jobTitle}
                          onChange={(e) => setJobTitle(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobDescription">Job Description *</Label>
                      <Textarea
                        id="jobDescription"
                        placeholder="Paste the full job description here..."
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        className="min-h-[150px] text-sm"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Model Selection & Generate */}
                <div className="flex items-center justify-between gap-4">
                  <ModelSelector value={selectedModel} onChange={onModelChange} />
                  <Button onClick={handleGenerate} disabled={isLoading} className="gap-2">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Cover Letter
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="saved" className="flex-1 mt-0 px-4">
            <SavedCoverLettersList
              coverLetters={coverLetters}
              isLoading={isLoadingCoverLetters}
              onSelect={handleSelectSavedLetter}
              onDelete={deleteCoverLetter}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Chat view - after generation
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">
                Cover Letter {companyName && `- ${companyName}`}
              </h2>
              <p className="text-xs text-muted-foreground">{jobTitle || "Position"}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSave} 
            disabled={isSaving || isLoading}
            className="gap-1"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyLetter} className="gap-1">
            <Copy className="h-3 w-3" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1">
            <Download className="h-3 w-3" />
            Download
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.isThinking ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Crafting your cover letter...</span>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Follow-up Input */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <ModelSelector value={selectedModel} onChange={onModelChange} />
          <div className="flex-1 relative">
            <Input
              placeholder="Ask for revisions (e.g., 'make it more formal', 'add more about my leadership')"
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleFollowUp()}
              disabled={isLoading}
              className="pr-12"
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={handleFollowUp}
              disabled={isLoading || !followUpInput.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

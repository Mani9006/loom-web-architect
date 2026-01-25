import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { ModelSelector } from "@/components/resume/ModelSelector";
import { Loader2, MessageSquare, Send, ArrowLeft, Sparkles, Brain, HelpCircle, Target } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

export interface InterviewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
}

interface InterviewPrepPanelProps {
  messages: InterviewMessage[];
  isLoading: boolean;
  onGenerate: (resumeText: string, jobDescription: string, companyName: string, jobTitle: string, interviewType: string) => void;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onBack?: () => void;
}

const interviewTypes = [
  { id: "behavioral", label: "Behavioral", icon: Brain, description: "STAR method questions about past experiences" },
  { id: "technical", label: "Technical", icon: Target, description: "Skills and knowledge assessment" },
  { id: "situational", label: "Situational", icon: HelpCircle, description: "Hypothetical scenarios and problem-solving" },
  { id: "mixed", label: "Full Interview", icon: MessageSquare, description: "Comprehensive mix of all types" },
];

export function InterviewPrepPanel({
  messages,
  isLoading,
  onGenerate,
  onSendMessage,
  selectedModel,
  onModelChange,
  onBack,
}: InterviewPrepPanelProps) {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedType, setSelectedType] = useState("mixed");
  const [followUpInput, setFollowUpInput] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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
    onGenerate(resumeText, jobDescription, companyName, jobTitle, selectedType);
  };

  const handleFollowUp = () => {
    if (!followUpInput.trim() || isLoading) return;
    onSendMessage(followUpInput);
    setFollowUpInput("");
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
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Interview Prep</h2>
              <p className="text-xs text-muted-foreground">Practice with AI-generated questions</p>
            </div>
          </div>
        </div>

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

            {/* Interview Type Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                  Interview Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {interviewTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                        selectedType === type.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        selectedType === type.id ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <type.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{type.label}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </button>
                  ))}
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
                    Generate Questions
                  </>
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
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
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">
                Interview Prep {companyName && `- ${companyName}`}
              </h2>
              <p className="text-xs text-muted-foreground">{jobTitle || "Position"}</p>
            </div>
          </div>
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
                    <span className="text-sm">Preparing interview questions...</span>
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
              placeholder="Ask for sample answers, more questions, or clarification..."
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

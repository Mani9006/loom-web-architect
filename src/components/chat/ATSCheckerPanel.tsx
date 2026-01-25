import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Send, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

export interface ATSMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  atsScore?: number;
}

interface ATSCheckerPanelProps {
  messages: ATSMessage[];
  isLoading: boolean;
  onAnalyze: (resumeText: string, jobDescription?: string) => void;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function ATSCheckerPanel({
  messages,
  isLoading,
  onAnalyze,
  onSendMessage,
  selectedModel,
  onModelChange,
}: ATSCheckerPanelProps) {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read text from file
    const text = await file.text();
    setResumeText(text);
  };

  const handleAnalyze = () => {
    if (!resumeText.trim()) return;
    setHasAnalyzed(true);
    onAnalyze(resumeText, jobDescription || undefined);
  };

  const handleSendFollowUp = () => {
    if (!followUpMessage.trim() || isLoading) return;
    onSendMessage(followUpMessage);
    setFollowUpMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendFollowUp();
    }
  };

  // Extract ATS score from the latest assistant message
  const latestScore = messages
    .filter((m) => m.role === "assistant" && m.atsScore !== undefined)
    .pop()?.atsScore;

  return (
    <div className="flex flex-col h-full">
      {!hasAnalyzed ? (
        // Initial form view
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Target className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">ATS Score Checker</h2>
              <p className="text-muted-foreground">
                Paste your resume and optionally a job description to get an ATS compatibility score
              </p>
            </div>

            {/* Resume Input */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Your Resume *</Label>
              <div className="flex gap-2 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <Textarea
                placeholder="Paste your resume content here..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                className="min-h-[200px] resize-none"
              />
            </div>

            {/* Job Description Input */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Job Description (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Adding a job description helps analyze keyword matching
              </p>
              <Textarea
                placeholder="Paste the job description here for better analysis..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-[150px] resize-none"
              />
            </div>

            {/* Analyze Button */}
            <Button
              onClick={handleAnalyze}
              disabled={!resumeText.trim() || isLoading}
              className="w-full gap-2"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Check ATS Score
                </>
              )}
            </Button>
          </div>
        </ScrollArea>
      ) : (
        // Results and chat view
        <>
          {/* Score Header */}
          {latestScore !== undefined && (
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-muted"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray={`${(latestScore / 100) * 226} 226`}
                      className={
                        latestScore >= 80
                          ? "text-green-500"
                          : latestScore >= 60
                          ? "text-yellow-500"
                          : "text-red-500"
                      }
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">
                    {latestScore}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">ATS Score</h3>
                  <p className="text-sm text-muted-foreground">
                    {latestScore >= 80
                      ? "Excellent! Your resume is well-optimized"
                      : latestScore >= 60
                      ? "Good, but there's room for improvement"
                      : "Needs improvement for better ATS compatibility"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.isThinking ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing resume...</span>
                      </div>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Follow-up Input */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <Input
                value={followUpMessage}
                onChange={(e) => setFollowUpMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask follow-up questions about your resume..."
                disabled={isLoading}
              />
              <Button
                onClick={handleSendFollowUp}
                disabled={!followUpMessage.trim() || isLoading}
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

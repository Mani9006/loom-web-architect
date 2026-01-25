import { useState, useRef } from "react";
import { Search, Briefcase, MapPin, Clock, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

export interface JobSearchMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  jobs?: JobResult[];
}

export interface JobResult {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string; // Full-time, Part-time, Contract
  salary?: string;
  postedDate: string;
  description: string;
  url?: string;
  matchScore?: number;
}

interface JobSearchPanelProps {
  messages: JobSearchMessage[];
  isLoading: boolean;
  onSearch: (resumeText: string, preferences?: string) => void;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function JobSearchPanel({
  messages,
  isLoading,
  onSearch,
  onSendMessage,
  selectedModel,
  onModelChange,
}: JobSearchPanelProps) {
  const [resumeText, setResumeText] = useState("");
  const [preferences, setPreferences] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSearch = () => {
    if (!resumeText.trim()) return;
    setHasSearched(true);
    onSearch(resumeText, preferences || undefined);
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

  return (
    <div className="flex flex-col h-full">
      {!hasSearched ? (
        // Initial search form
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Search className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">AI Job Search</h2>
              <p className="text-muted-foreground">
                Paste your resume and let AI find the latest matching jobs for you
              </p>
            </div>

            {/* Resume Input */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Your Resume / Skills *</Label>
              <p className="text-sm text-muted-foreground">
                Paste your resume or describe your skills and experience
              </p>
              <Textarea
                placeholder="Paste your resume or describe your skills, experience, and what you're looking for..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                className="min-h-[180px] resize-none"
              />
            </div>

            {/* Preferences */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Job Preferences (Optional)</Label>
              <Textarea
                placeholder="e.g., Remote only, San Francisco Bay Area, $120k+ salary, startup culture, etc."
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>

            {/* Search Button */}
            <Button
              onClick={handleSearch}
              disabled={!resumeText.trim() || isLoading}
              className="w-full gap-2"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching Jobs...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Find Matching Jobs
                </>
              )}
            </Button>

            {/* Info Card */}
            <Card className="p-4 bg-muted/50">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                How it works
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• AI analyzes your resume to understand your skills</li>
                <li>• Searches for the latest job postings matching your profile</li>
                <li>• Ranks jobs by how well they match your experience</li>
                <li>• Provides personalized recommendations</li>
              </ul>
            </Card>
          </div>
        </ScrollArea>
      ) : (
        // Results and chat view
        <>
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
                        <span>Searching for matching jobs...</span>
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
                placeholder="Ask about specific jobs or refine your search..."
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

import { useState, useRef } from "react";
import { Search, Loader2, Send, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { AIMessageContent } from "@/components/chat/AIMessageContent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  type: string;
  salary?: string;
  postedDate: string;
  description: string;
  url?: string;
  matchScore?: number;
}

export interface JobFilters {
  jobType: string;
  experienceLevel: string;
  workLocation: string;
  datePosted: string;
  salaryRange: string;
}

interface JobSearchPanelProps {
  messages: JobSearchMessage[];
  isLoading: boolean;
  onSearch: (resumeText: string, filters?: JobFilters) => void;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function JobSearchPanel({
  messages,
  isLoading,
  onSearch,
  onSendMessage,
}: JobSearchPanelProps) {
  const [resumeText, setResumeText] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // LinkedIn-style filters
  const [filters, setFilters] = useState<JobFilters>({
    jobType: "all",
    experienceLevel: "all",
    workLocation: "all",
    datePosted: "24h",
    salaryRange: "all",
  });

  const handleDocumentExtracted = (text: string, fileName: string) => {
    setResumeText(text);
    setUploadedFileName(fileName);
  };

  const handleSearch = () => {
    if (!resumeText.trim()) return;
    setHasSearched(true);
    onSearch(resumeText, filters);
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

  const updateFilter = (key: keyof JobFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
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
                Upload your resume and let AI find real jobs posted in the last 24 hours
              </p>
            </div>

            {/* Resume Input */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Your Resume / Skills *</Label>
              
              <DocumentUpload 
                onTextExtracted={handleDocumentExtracted}
                isLoading={isLoading}
                label="Upload Resume (PDF/Word)"
              />

              {uploadedFileName && (
                <p className="text-sm text-muted-foreground">
                  Loaded from: <span className="font-medium">{uploadedFileName}</span>
                </p>
              )}

              <div className="relative">
                <div className="absolute inset-x-0 top-0 flex items-center justify-center">
                  <span className="bg-background px-2 text-xs text-muted-foreground -translate-y-1/2">
                    or paste your resume/skills
                  </span>
                </div>
              </div>

              <Textarea
                placeholder="Paste your resume or describe your skills, experience, and what you're looking for..."
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  setUploadedFileName(null);
                }}
                className="min-h-[160px] resize-none mt-4"
              />
            </div>

            {/* Job Filters - LinkedIn Style */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Label className="text-base font-medium">Job Filters</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Date Posted */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Date Posted</Label>
                  <Select value={filters.datePosted} onValueChange={(v) => updateFilter("datePosted", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="24h">Last 24 hours</SelectItem>
                      <SelectItem value="week">Past week</SelectItem>
                      <SelectItem value="month">Past month</SelectItem>
                      <SelectItem value="all">Any time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Job Type */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Job Type</Label>
                  <Select value={filters.jobType} onValueChange={(v) => updateFilter("jobType", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="fulltime">Full-time</SelectItem>
                      <SelectItem value="parttime">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Experience Level */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Experience Level</Label>
                  <Select value={filters.experienceLevel} onValueChange={(v) => updateFilter("experienceLevel", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior Level</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Work Location */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Work Location</Label>
                  <Select value={filters.workLocation} onValueChange={(v) => updateFilter("workLocation", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="all">All Locations</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="onsite">On-site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Salary Range */}
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-sm text-muted-foreground">Salary Range</Label>
                  <Select value={filters.salaryRange} onValueChange={(v) => updateFilter("salaryRange", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="all">Any Salary</SelectItem>
                      <SelectItem value="40k+">$40,000+</SelectItem>
                      <SelectItem value="60k+">$60,000+</SelectItem>
                      <SelectItem value="80k+">$80,000+</SelectItem>
                      <SelectItem value="100k+">$100,000+</SelectItem>
                      <SelectItem value="120k+">$120,000+</SelectItem>
                      <SelectItem value="150k+">$150,000+</SelectItem>
                      <SelectItem value="200k+">$200,000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                  Searching Real Jobs...
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
                Smart Matching
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Matches your skills to related roles (not just exact titles)</li>
                <li>• Searches LinkedIn, Indeed, Glassdoor & company pages</li>
                <li>• Returns 5 real jobs with direct apply links</li>
                <li>• Remembers shown jobs to avoid duplicates</li>
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
                      <AIMessageContent content={message.content} />
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
                placeholder="Ask for more jobs, different roles, or refine your search..."
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

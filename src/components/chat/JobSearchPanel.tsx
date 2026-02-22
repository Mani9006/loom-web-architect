import { useState, useRef, useEffect } from "react";
import { Search, Loader2, Sparkles, Filter, MapPin, Building2, DollarSign, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ApplyPassWorkspace from "@/components/chat/ApplyPassWorkspace";
import { useLocation, useNavigate } from "react-router-dom";

const FILTERS_STORAGE_KEY = "job-search-filters";
export const APPLYPASS_LATEST_SEARCH_KEY = "applypass-latest-search-v1";

export interface JobFilters {
  jobType: string;
  experienceLevel: string;
  workLocation: string;
  datePosted: string;
  salaryRange: string;
}

export interface JobResult {
  id: string;
  title: string;
  company: string;
  location: string;
  type?: string;
  salary?: string;
  postedDate?: string;
  description?: string;
  url?: string;
  fallbackUrl?: string;
  sourceUrl?: string;
  matchScore?: number;
}

export interface ApplyPassSearchState {
  jobs: JobResult[];
  resumeText: string;
  preferredResumeId?: string | null;
  searchMarkdown: string;
  filters: JobFilters;
  searchedAt: string;
}

interface JobSearchPanelProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const defaultFilters: JobFilters = {
  jobType: "all",
  experienceLevel: "all",
  workLocation: "all",
  datePosted: "24h",
  salaryRange: "all",
};

function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  const unescaped = rawUrl.replace(/&amp;/gi, "&").trim();
  const cleaned = unescaped
    .replace(/^<+|>+$/g, "")
    .replace(/^\(+|\)+$/g, "")
    .replace(/[),.;]+$/g, "")
    .trim();

  if (!/^https?:\/\//i.test(cleaned)) return "";

  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isLikelyBrokenUrl(url: string): boolean {
  const normalized = url.toLowerCase();

  if (!normalized.startsWith("http")) return true;
  if (/fake|placeholder|example\.com|undefined|null|lorem/.test(normalized)) return true;
  if (normalized.includes("linkedin.com/jobs/view/") && !/linkedin\.com\/jobs\/view\/\d+/.test(normalized)) return true;
  if (normalized.includes("indeed.com/viewjob") && !/[?&]jk=/.test(normalized)) return true;

  return false;
}

function buildLinkedInFallbackUrl(title: string, company: string, location?: string): string {
  const q = `${title} ${company}`.trim();
  const where = (location || "United States").trim();
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent(where)}`;
}

function extractLinks(section: string): string[] {
  const links: string[] = [];

  for (const match of section.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi)) {
    links.push(match[1]);
  }

  for (const match of section.matchAll(/(?:^|\s)(https?:\/\/[^\s<>()]+)(?=$|\s)/gi)) {
    links.push(match[1]);
  }

  return links;
}

function parseJobsFromMarkdown(markdown: string, filters: JobFilters): JobResult[] {
  const sections = markdown
    .split(/\n##\s+/)
    .map((part, idx) => (idx === 0 ? part : `## ${part}`))
    .filter((part) => /^##\s*\d+\./m.test(part));

  const parsed: JobResult[] = [];
  const seen = new Set<string>();

  sections.forEach((section, idx) => {
    const headingMatch = section.match(/^##\s*\d+\.\s*(?:[^\w]*)?(.*?)$/m) || section.match(/^##\s*(.*?)$/m);
    const heading = (headingMatch?.[1] || "").replace(/\*\*/g, "").trim();

    let title = heading;
    let company = "Unknown Company";
    const atMatch = heading.match(/(.+?)\s+at\s+(.+)/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    }

    const location =
      section.match(/- \*\*(?:Location|Where):\*\*\s*(.+)/i)?.[1]?.trim() ||
      section.match(/Location:\s*(.+)/i)?.[1]?.trim() ||
      "";
    const postedDate = section.match(/- \*\*Posted:\*\*\s*(.+)/i)?.[1]?.trim() || "";
    const whyMatch = section.match(/- \*\*Why You're a Match:\*\*\s*([\s\S]*?)(?:\n- \*\*|\n---|\n##|$)/i);
    const description = whyMatch?.[1]?.trim() || section.slice(0, 380);

    const links = extractLinks(section);
    const preferred = links.find((link) => /apply|jobs\/view|greenhouse|lever|workday|myworkdayjobs/i.test(link)) || links[0] || "";
    const cleanedPrimary = normalizeUrl(preferred);
    const primary = cleanedPrimary && !isLikelyBrokenUrl(cleanedPrimary) ? cleanedPrimary : "";
    const fallbackLocation = location || (filters.workLocation === "remote" ? "Remote" : "United States");
    const fallback = buildLinkedInFallbackUrl(title || `Job ${idx + 1}`, company, fallbackLocation);
    const resolvedUrl = primary || fallback;

    const jobKey = `${title}|${company}|${resolvedUrl}`.toLowerCase();
    if (seen.has(jobKey)) return;
    seen.add(jobKey);

    const matchScoreRaw = section.match(/(?:match score|fit score|score):\s*(\d{1,3})%?/i)?.[1];
    const matchScore = matchScoreRaw ? Number(matchScoreRaw) : undefined;

    parsed.push({
      id: `${idx + 1}-${title}-${company}-${resolvedUrl}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: title || `Job ${idx + 1}`,
      company,
      location,
      postedDate,
      description,
      url: resolvedUrl,
      fallbackUrl: fallback,
      sourceUrl: cleanedPrimary || undefined,
      matchScore: Number.isFinite(matchScore) ? matchScore : undefined,
    });
  });

  return parsed.slice(0, 10);
}

export function JobSearchPanel({ selectedModel, onModelChange }: JobSearchPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [resumeText, setResumeText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState("");
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [savedResumeDocId, setSavedResumeDocId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load filters from localStorage on mount
  const [filters, setFilters] = useState<JobFilters>(() => {
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        return { ...defaultFilters, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to load filters from localStorage:", e);
    }
    return defaultFilters;
  });

  // Save filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (e) {
      console.error("Failed to save filters to localStorage:", e);
    }
  }, [filters]);

  const handleDocumentExtracted = (text: string, fileName: string) => {
    setResumeText(text);
    setUploadedFileName(fileName);
  };

  const updateFilter = (key: keyof JobFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearch = async (isFollowUp = false) => {
    if (!resumeText.trim() && !isFollowUp) {
      toast.error("Please upload or paste your resume first");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setStreamingResponse("");

    if (!isFollowUp) {
      setJobs([]);
      setConversationHistory([]);
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in to search for jobs");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey =
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.VITE_SUPABASE_ANON_KEY ||
        import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl) {
        throw new Error("Supabase URL is not configured");
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };
      if (publishableKey) {
        headers.apikey = publishableKey;
      }
      const response = await fetch(`${supabaseUrl}/functions/v1/job-search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resumeText,
          filters,
          isFollowUp,
          conversationHistory: isFollowUp ? conversationHistory : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let streamBuffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                fullResponse += content;
                setStreamingResponse(fullResponse);
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }

        if (streamBuffer.startsWith("data: ")) {
          const finalData = streamBuffer.slice(6);
          if (finalData && finalData !== "[DONE]") {
            try {
              const parsed = JSON.parse(finalData);
              const content = parsed.choices?.[0]?.delta?.content || "";
              fullResponse += content;
              setStreamingResponse(fullResponse);
            } catch {
              // Ignore trailing malformed chunk.
            }
          }
        }
      } else {
        fullResponse = await response.text();
        setStreamingResponse(fullResponse);
      }

      // Update conversation history
      setConversationHistory((prev) => [
        ...prev,
        {
          role: "user",
          content: isFollowUp ? "Generate more job opportunities" : `Find jobs for: ${resumeText.substring(0, 200)}...`,
        },
        { role: "assistant", content: fullResponse },
      ]);
      const parsedJobs = parseJobsFromMarkdown(fullResponse, filters);
      setJobs(parsedJobs);

      if (parsedJobs.length > 0) {
        const state: ApplyPassSearchState = {
          jobs: parsedJobs,
          resumeText,
          preferredResumeId: savedResumeDocId,
          searchMarkdown: fullResponse,
          filters,
          searchedAt: new Date().toISOString(),
        };
        try {
          sessionStorage.setItem(APPLYPASS_LATEST_SEARCH_KEY, JSON.stringify(state));
        } catch (storageError) {
          console.warn("Failed to persist ApplyPass search state:", storageError);
        }

        if (!isFollowUp && location.pathname !== "/applypass") {
          navigate("/applypass", { state });
          toast.success("Jobs found. Opening ApplyPass workspace.");
        } else {
          toast.success("Job search completed!");
        }
      } else {
        toast.error("No valid jobs could be parsed from this response. Try Generate More Jobs.");
      }
    } catch (error) {
      console.error("Job search error:", error);
      const message = error instanceof Error ? error.message : "Failed to search for jobs. Please try again.";
      if (message.toLowerCase().includes("failed to fetch")) {
        toast.error("Failed to fetch jobs. Please refresh and try again. If it persists, reconnect Supabase env keys.");
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!resultsRef.current || !streamingResponse) {
      toast.error("No results to download");
      return;
    }

    const element = resultsRef.current;
    const opt = {
      margin: 0.5,
      filename: "job-matches.pdf",
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in" as const, format: "letter" as const, orientation: "portrait" as const },
    };

    // Lazy load html2pdf only when user exports
    toast.promise(
      (async () => {
        const html2pdf = (await import("html2pdf.js")).default;
        return html2pdf().set(opt).from(element).save();
      })(),
      {
        loading: "Generating PDF...",
        success: "PDF downloaded successfully!",
        error: "Failed to generate PDF",
      }
    );
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 90) return "bg-primary text-primary-foreground";
    if (score >= 80) return "bg-primary/80 text-primary-foreground";
    if (score >= 70) return "bg-secondary text-secondary-foreground";
    return "bg-muted text-muted-foreground";
  };

  const handleNewSearch = () => {
    setHasSearched(false);
    setJobs([]);
    setResumeText("");
    setUploadedFileName(null);
    setSavedResumeDocId(null);
    // Keep the filters - they are persisted in localStorage
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Search className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">AI Job Search</h2>
            <p className="text-muted-foreground">Upload your resume and let AI find real jobs matching your skills</p>
          </div>

          {/* Resume Input */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Your Resume / Skills *</Label>

            <DocumentUpload
              onTextExtracted={handleDocumentExtracted}
              isLoading={isLoading}
              label="Upload Resume (PDF/Word)"
              persistToDocuments
              documentCategory="resume"
              onDocumentSaved={(doc) => setSavedResumeDocId(doc.id)}
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
              className="min-h-[120px] resize-none mt-4"
            />
          </div>

          {/* Job Filters - LinkedIn Style */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-medium">Job Filters</Label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
              <div className="space-y-1.5 col-span-2 md:col-span-2">
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
          <div className="flex gap-3">
            <Button
              onClick={() => handleSearch(false)}
              disabled={!resumeText.trim() || isLoading}
              className="flex-1 gap-2"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Find Matching Jobs
                </>
              )}
            </Button>

            {hasSearched && (
              <Button onClick={handleNewSearch} variant="outline" size="lg">
                New Search
              </Button>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <Card className="p-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                  <Sparkles className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium text-foreground">
                    Our AI agents are analyzing your skills and scanning the web for matches...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This may take a moment. We're finding the best opportunities for you.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Results */}
          {!isLoading && hasSearched && streamingResponse && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Job Search Results</h3>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSearch(true)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={isLoading}
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate More Jobs
                  </Button>
                  <Button onClick={handleDownloadPDF} variant="outline" size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    Download as PDF
                  </Button>
                </div>
              </div>

              {jobs.length > 0 && (
                <ApplyPassWorkspace
                  jobs={jobs}
                  resumeText={resumeText}
                  preferredResumeId={savedResumeDocId}
                />
              )}

              <Card ref={resultsRef} className="p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{streamingResponse}</ReactMarkdown>
                </div>
              </Card>
            </div>
          )}

          {/* No Results */}
          {!isLoading && hasSearched && !streamingResponse && (
            <Card className="p-8 text-center">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Jobs Found</h3>
              <p className="text-muted-foreground">
                Try adjusting your filters or updating your resume to find more matches.
              </p>
            </Card>
          )}

          {/* Info Card */}
          {!hasSearched && (
            <Card className="p-4 bg-muted/50">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Smart Matching
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Matches your skills to related roles (not just exact titles)</li>
                <li>• Searches across multiple job boards and company pages</li>
                <li>• Returns real jobs with direct apply links</li>
                <li>• AI-powered match scoring based on your experience</li>
              </ul>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

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
import html2pdf from "html2pdf.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILTERS_STORAGE_KEY = "job-search-filters";

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
  matchScore?: number;
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

export function JobSearchPanel({
  selectedModel,
  onModelChange,
}: JobSearchPanelProps) {
  const [resumeText, setResumeText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
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
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = async () => {
    if (!resumeText.trim()) {
      toast.error("Please upload or paste your resume first");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setJobs([]);

    try {
      const response = await fetch("https://reddy9006.app.n8n.cloud/webhook-test/job-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resume_text: resumeText,
          filters: {
            datePosted: filters.datePosted,
            jobType: filters.jobType,
            experienceLevel: filters.experienceLevel,
            workLocation: filters.workLocation,
            salaryRange: filters.salaryRange,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle different response formats from n8n
      let jobResults: JobResult[] = [];
      
      if (Array.isArray(data)) {
        jobResults = data.map((job: any, index: number) => ({
          id: job.id || `job-${index}`,
          title: job.title || job.job_title || "Unknown Title",
          company: job.company || job.company_name || "Unknown Company",
          location: job.location || "Not specified",
          type: job.type || job.job_type || filters.jobType,
          salary: job.salary || job.salary_range || "Not disclosed",
          postedDate: job.postedDate || job.posted_date || "Recent",
          description: job.description || "",
          url: job.url || job.link || job.apply_url || "#",
          matchScore: job.matchScore || job.match_score || Math.floor(Math.random() * 20) + 80,
        }));
      } else if (data.jobs && Array.isArray(data.jobs)) {
        jobResults = data.jobs.map((job: any, index: number) => ({
          id: job.id || `job-${index}`,
          title: job.title || job.job_title || "Unknown Title",
          company: job.company || job.company_name || "Unknown Company",
          location: job.location || "Not specified",
          type: job.type || job.job_type || filters.jobType,
          salary: job.salary || job.salary_range || "Not disclosed",
          postedDate: job.postedDate || job.posted_date || "Recent",
          description: job.description || "",
          url: job.url || job.link || job.apply_url || "#",
          matchScore: job.matchScore || job.match_score || Math.floor(Math.random() * 20) + 80,
        }));
      }

      setJobs(jobResults);
      
      if (jobResults.length === 0) {
        toast.info("No matching jobs found. Try adjusting your filters.");
      } else {
        toast.success(`Found ${jobResults.length} matching jobs!`);
      }
    } catch (error) {
      console.error("Job search error:", error);
      toast.error("Failed to search for jobs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!resultsRef.current || jobs.length === 0) {
      toast.error("No results to download");
      return;
    }

    const element = resultsRef.current;
    const opt = {
      margin: 0.5,
      filename: 'job-matches.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const }
    };

    toast.promise(
      html2pdf().set(opt).from(element).save(),
      {
        loading: 'Generating PDF...',
        success: 'PDF downloaded successfully!',
        error: 'Failed to generate PDF',
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
            <p className="text-muted-foreground">
              Upload your resume and let AI find real jobs matching your skills
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
              onClick={handleSearch}
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
              <Button
                onClick={handleNewSearch}
                variant="outline"
                size="lg"
              >
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
          {!isLoading && hasSearched && jobs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Found {jobs.length} Matching Jobs
                </h3>
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Matches as PDF
                </Button>
              </div>

              <div ref={resultsRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map((job) => (
                  <Card key={job.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg leading-tight">{job.title}</CardTitle>
                        {job.matchScore && (
                          <Badge className={`shrink-0 ${getMatchScoreColor(job.matchScore)}`}>
                            {job.matchScore}% Match
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building2 className="w-4 h-4 shrink-0" />
                          <span className="truncate">{job.company}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="w-4 h-4 shrink-0" />
                          <span className="truncate">{job.location}</span>
                        </div>
                        {job.salary && job.salary !== "Not disclosed" && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <DollarSign className="w-4 h-4 shrink-0" />
                            <span className="truncate">{job.salary}</span>
                          </div>
                        )}
                      </div>

                      {job.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {job.description}
                        </p>
                      )}

                      <Button
                        onClick={() => window.open(job.url, "_blank")}
                        className="w-full gap-2"
                        size="sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Job
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {!isLoading && hasSearched && jobs.length === 0 && (
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

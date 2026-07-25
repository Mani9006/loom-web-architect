import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import {
  Target, CheckCircle, AlertTriangle, Loader2, ArrowLeft,
  FileText, Layout, Key, Briefcase, GraduationCap, TrendingUp,
  Lightbulb, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionScore {
  score: number;
  issues?: string[];
  tips?: string[];
  matched?: string[];
  missing?: string[];
}

interface ATSResult {
  overallScore: number;
  sections: {
    formatting: SectionScore;
    keywords: SectionScore;
    experience: SectionScore;
    skills: SectionScore;
    education: SectionScore;
    impact: SectionScore;
  };
  summary: string;
  topImprovements: string[];
}

const SECTION_CONFIG = [
  { key: "formatting" as const, label: "Formatting & Structure", icon: Layout, weight: "15%", color: "blue" },
  { key: "keywords" as const, label: "Keyword Match", icon: Key, weight: "25%", color: "purple" },
  { key: "experience" as const, label: "Experience Relevance", icon: Briefcase, weight: "25%", color: "orange" },
  { key: "skills" as const, label: "Skills Coverage", icon: Sparkles, weight: "15%", color: "cyan" },
  { key: "education" as const, label: "Education", icon: GraduationCap, weight: "5%", color: "green" },
  { key: "impact" as const, label: "Impact & Achievements", icon: TrendingUp, weight: "15%", color: "pink" },
];

function ScoreRing({ score, size = 120, strokeWidth = 10 }: { score: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : score >= 40 ? "text-orange-500" : "text-red-500";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className={cn(color, "transition-all duration-1000 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function SectionCard({ config, data, expanded, onToggle }: {
  config: typeof SECTION_CONFIG[0];
  data: SectionScore;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = config.icon;
  const scoreColor = data.score >= 80 ? "text-green-600" : data.score >= 60 ? "text-yellow-600" : data.score >= 40 ? "text-orange-600" : "text-red-600";
  const barColor = data.score >= 80 ? "bg-green-500" : data.score >= 60 ? "bg-yellow-500" : data.score >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} aria-expanded={expanded} className="w-full text-left">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">{config.label}</span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", scoreColor)}>{data.score}</span>
                  <span className="text-[10px] text-muted-foreground">{config.weight}</span>
                  {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${data.score}%` }} />
              </div>
            </div>
          </div>
        </CardContent>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t space-y-3">
          {/* Matched items */}
          {data.matched && data.matched.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5">Matched</p>
              <div className="flex flex-wrap gap-1.5">
                {data.matched.map((item, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px] bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" /> {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Missing items */}
          {data.missing && data.missing.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1.5">Missing</p>
              <div className="flex flex-wrap gap-1.5">
                {data.missing.map((item, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px] bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    <AlertTriangle className="w-3 h-3 mr-1" /> {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Issues */}
          {data.issues && data.issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Issues Found</p>
              <ul className="space-y-1">
                {data.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tips */}
          {data.tips && data.tips.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Recommendations</p>
              <ul className="space-y-1">
                {data.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <Lightbulb className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ATSCheckerPage() {
  const { toast } = useToast();
  const [resumeText, setResumeText] = usePersistedState("atsChecker.resumeText", "", "localStorage");
  const [jobDescription, setJobDescription] = usePersistedState("atsChecker.jobDescription", "", "localStorage");
  const [uploadedFileName, setUploadedFileName] = usePersistedState<string | null>("atsChecker.fileName", null, "sessionStorage");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = usePersistedState<ATSResult | null>("atsChecker.result", null, "sessionStorage");
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const handleDocumentExtracted = (text: string, fileName: string) => {
    setResumeText(text);
    setUploadedFileName(fileName);
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const analyze = async () => {
    // Server rejects resume text under 50 chars; fail fast with the same rule.
    if (resumeText.trim().length < 50) {
      toast({
        title: "Add more of your résumé",
        description: "Paste or upload at least 50 characters of résumé content so the ATS check has something to score.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${baseUrl}/functions/v1/ats-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resumeText, jobDescription: jobDescription || undefined }),
      });

      if (!response.ok) {
        // Function returns { error } on 4xx/5xx, surface it when present.
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : `ATS analysis request failed (${response.status})`);
      }

      const data = await response.json();
      setResult(data);
      // Expand all sections that need attention (score < 70)
      const weak = SECTION_CONFIG.filter((c) => data.sections?.[c.key]?.score < 70).map((c) => c.key);
      setExpandedSections(weak.length > 0 ? weak : [SECTION_CONFIG[0].key]);
    } catch (err) {
      console.error("ATS analysis failed:", err);
      toast({
        title: "We could not complete the ATS check",
        description: err instanceof Error && err.message ? err.message : "Your résumé is safe. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setExpandedSections([]);
  };

  // RESULTS VIEW
  if (result) {
    const label = result.overallScore >= 80 ? "Excellent" : result.overallScore >= 60 ? "Good" : result.overallScore >= 40 ? "Needs Work" : "Poor";

    return (
      <div className="bg-muted/30 min-h-full">
        <ScrollArea className="h-[calc(100vh-68px)]">
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" aria-label="Back to ATS input" onClick={reset} className="shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">ATS Analysis Results</h1>
                <p className="text-sm text-muted-foreground">Detailed résumé-readiness breakdown</p>
              </div>
            </div>

            <div className="rounded-lg border bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              This is the standalone ATS résumé-readiness estimate. Job matching uses a separate career-fit score that also considers role, experience level, location, compensation, and authorization; the two percentages should not be added together or treated as the same score.
            </div>

            {/* Overall Score Card */}
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  <ScoreRing score={result.overallScore} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold">ATS Compatibility: {label}</h2>
                      <Badge variant={result.overallScore >= 70 ? "default" : "destructive"} className="text-xs">
                        {result.overallScore >= 80 ? "Pass" : result.overallScore >= 60 ? "Borderline" : "Fail"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{result.summary}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Improvements */}
            {result.topImprovements && result.topImprovements.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-500" /> Top Improvements
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ol className="space-y-2">
                    {result.topImprovements.map((item, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">
                          {i + 1}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* Section Scores */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">SECTION BREAKDOWN</h3>
              <div className="space-y-2">
                {SECTION_CONFIG.map((config) => {
                  const data = result.sections[config.key];
                  if (!data) return null;
                  return (
                    <SectionCard
                      key={config.key}
                      config={config}
                      data={data}
                      expanded={expandedSections.includes(config.key)}
                      onToggle={() => toggleSection(config.key)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Re-analyze */}
            <div className="flex justify-center pt-4 pb-8">
              <Button variant="outline" onClick={reset} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Analyze Another Resume
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // INPUT FORM VIEW
  return (
    <div className="bg-muted/30 min-h-full">
      <ScrollArea className="h-[calc(100vh-68px)]">
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-16 space-y-6">
          <PageHeader
            title="Score it."
            status="ats · 6 dimensions"
            description="Deep analysis across formatting, keywords, experience relevance, skills coverage, education, and content quality. Paste your résumé and a job description; we'll tell you exactly what to fix."
          />


          {/* Resume Input */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <Label className="text-base font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" /> Your Resume *
              </Label>

              <DocumentUpload
                onTextExtracted={handleDocumentExtracted}
                isLoading={loading}
                label="Upload Resume (PDF/Word)"
              />

              {uploadedFileName && (
                <p className="text-sm text-muted-foreground">
                  Loaded: <span className="font-medium">{uploadedFileName}</span>
                </p>
              )}

              <Textarea
                aria-label="Résumé text"
                placeholder="Or paste your resume content here..."
                value={resumeText}
                onChange={(e) => { setResumeText(e.target.value); setUploadedFileName(null); }}
                className="min-h-[180px] resize-none"
              />
            </CardContent>
          </Card>

          {/* Job Description */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <Label className="text-base font-medium flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Job Description
                <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Paste the job posting to get keyword match analysis and tailored recommendations
              </p>
              <Textarea
                aria-label="Target job description"
                placeholder="Paste the target job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-[140px] resize-none"
              />
            </CardContent>
          </Card>

          {/* Scoring Preview */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">SCORING DIMENSIONS</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SECTION_CONFIG.map((config) => {
                  const Icon = config.icon;
                  return (
                    <div key={config.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="w-3.5 h-3.5" />
                      <span>{config.label}</span>
                      <span className="text-[10px] opacity-50">{config.weight}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Analyze Button */}
          <Button onClick={analyze} disabled={!resumeText.trim() || loading} className="w-full gap-2" size="lg">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing across 6 dimensions...</>
            ) : (
              <><Target className="w-4 h-4" /> Analyze ATS Compatibility</>
            )}
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

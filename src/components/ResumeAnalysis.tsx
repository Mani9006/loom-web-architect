import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  TrendingUp, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeScore } from "@/lib/score-truth";

interface ScoreBreakdown {
  category: string;
  score: number;
  maxScore: number;
  feedback: string;
  status: "good" | "warning" | "poor";
}

interface AnalysisResult {
  overallScore: number;
  scoreKind: "resume_quality";
  breakdown: ScoreBreakdown[];
  suggestions: string[];
  keywords: string[];
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-red-500";
  const bgColor = score >= 80 ? "stroke-green-500" : score >= 60 ? "stroke-yellow-500" : "stroke-red-500";
  const bgTrack = "stroke-muted";
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" className={bgTrack} strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius} fill="none" className={bgColor}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-bold", color)}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: "good" | "warning" | "poor" }) {
  if (status === "good") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

interface ResumeAnalysisProps {
  resumeText?: string | null;
  compact?: boolean;
  onScoreComputed?: (score: number) => void;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function ResumeAnalysis({ resumeText, compact, onScoreComputed }: ResumeAnalysisProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyzeResume = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to analyze your resume." });
      return;
    }
    if (!resumeText || resumeText.trim().length < 50) {
      toast({
        title: "Add more résumé text",
        description: "At least 50 characters are needed for a meaningful quality check.",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ats-score", {
        body: { resumeText },
      });
      if (error) throw error;

      const score = normalizeScore(data?.resumeQualityScore ?? data?.overallScore);
      if (score === null || data?.scoreType !== "resume_quality") {
        throw new Error("A typed résumé-quality result was not returned.");
      }

      const rawSections = record(data.sections);
      const sectionConfig = [
        ["formatting", "Formatting & structure"],
        ["experience", "Experience evidence"],
        ["skills", "Skills structure"],
        ["education", "Education"],
        ["impact", "Impact & achievements"],
      ] as const;
      const breakdown: ScoreBreakdown[] = sectionConfig.flatMap(([key, category]) => {
        const section = record(rawSections[key]);
        const sectionScore = normalizeScore(section.score);
        if (sectionScore === null) return [];
        const issues = Array.isArray(section.issues) ? section.issues.map(String) : [];
        const tips = Array.isArray(section.tips) ? section.tips.map(String) : [];
        return [{
          category,
          score: sectionScore,
          maxScore: 100,
          feedback: tips[0] ?? issues[0] ?? "No specific change recommended.",
          status: sectionScore >= 80 ? "good" as const : sectionScore >= 60 ? "warning" as const : "poor" as const,
        }];
      });

      const analysis: AnalysisResult = {
        overallScore: score,
        scoreKind: "resume_quality",
        breakdown,
        suggestions: Array.isArray(data.topImprovements) ? data.topImprovements.map(String) : [],
        keywords: [],
      };

      setResult(analysis);
      onScoreComputed?.(score);
    } catch {
      toast({
        title: "Analysis error",
        description: "Could not analyze resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (compact && !result) {
    return (
      <Button variant="outline" size="sm" className="gap-2" onClick={analyzeResume} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
        {loading ? "Analyzing..." : "Check résumé quality"}
      </Button>
    );
  }

  if (compact && result) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative">
          <ScoreGauge score={result.overallScore} />
        </div>
        <div className="text-sm">
          <p className="font-medium">Résumé quality</p>
          <p className="text-muted-foreground">
            {result.overallScore >= 80 ? "Great!" : result.overallScore >= 60 ? "Needs improvement" : "Needs attention"}
          </p>
          <Button variant="ghost" size="sm" className="gap-1 h-6 px-1 text-xs mt-1" onClick={analyzeResume}>
            <RefreshCw className="w-3 h-3" /> Re-analyze
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="w-5 h-5 text-primary" />
          Generic résumé quality
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!result ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Measure résumé structure and evidence quality independently of any job
            </p>
            <Button onClick={analyzeResume} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
              {loading ? "Analyzing Resume..." : "Analyze My Resume"}
            </Button>
          </div>
        ) : (
          <>
            {/* Score gauge */}
            <div className="flex justify-center">
              <ScoreGauge score={result.overallScore} />
            </div>

            {/* Breakdown */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Résumé quality breakdown</h4>
              {result.breakdown.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={item.status} />
                      <span>{item.category}</span>
                    </div>
                    <span className="font-medium">{item.score}/{item.maxScore}</span>
                  </div>
                  <Progress value={(item.score / item.maxScore) * 100} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">{item.feedback}</p>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Improvement Tips</h4>
                <ul className="space-y-1">
                  {result.suggestions.slice(0, 5).map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Keywords */}
            {result.keywords.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Detected Keywords</h4>
                <div className="flex flex-wrap gap-1.5">
                  {result.keywords.slice(0, 15).map((kw) => (
                    <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" className="w-full gap-2" onClick={analyzeResume} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-Analyze Resume
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

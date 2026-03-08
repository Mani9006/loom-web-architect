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

interface ScoreBreakdown {
  category: string;
  score: number;
  maxScore: number;
  feedback: string;
  status: "good" | "warning" | "poor";
}

interface AnalysisResult {
  overallScore: number;
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
  resumeUrl?: string | null;
  compact?: boolean;
  onScoreComputed?: (score: number) => void;
}

export function ResumeAnalysis({ resumeUrl, compact, onScoreComputed }: ResumeAnalysisProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyzeResume = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to analyze your resume." });
      return;
    }

    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-score`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            resume_url: resumeUrl,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const score = data.score || data.overall_score || 0;

        const breakdown: ScoreBreakdown[] = [
          {
            category: "Contact Information",
            score: data.contact_score || Math.min(Math.round(score * 0.15), 15),
            maxScore: 15,
            feedback: data.contact_feedback || "Include email, phone, LinkedIn",
            status: (data.contact_score || score * 0.15) >= 12 ? "good" : (data.contact_score || score * 0.15) >= 8 ? "warning" : "poor",
          },
          {
            category: "Work Experience",
            score: data.experience_score || Math.min(Math.round(score * 0.30), 30),
            maxScore: 30,
            feedback: data.experience_feedback || "Use action verbs and quantify results",
            status: (data.experience_score || score * 0.30) >= 24 ? "good" : (data.experience_score || score * 0.30) >= 15 ? "warning" : "poor",
          },
          {
            category: "Skills & Keywords",
            score: data.skills_score || Math.min(Math.round(score * 0.25), 25),
            maxScore: 25,
            feedback: data.skills_feedback || "Include relevant technical and soft skills",
            status: (data.skills_score || score * 0.25) >= 20 ? "good" : (data.skills_score || score * 0.25) >= 13 ? "warning" : "poor",
          },
          {
            category: "Education",
            score: data.education_score || Math.min(Math.round(score * 0.15), 15),
            maxScore: 15,
            feedback: data.education_feedback || "List relevant degrees and certifications",
            status: (data.education_score || score * 0.15) >= 12 ? "good" : (data.education_score || score * 0.15) >= 8 ? "warning" : "poor",
          },
          {
            category: "Formatting & ATS",
            score: data.format_score || Math.min(Math.round(score * 0.15), 15),
            maxScore: 15,
            feedback: data.format_feedback || "Use clean formatting, no tables or images",
            status: (data.format_score || score * 0.15) >= 12 ? "good" : (data.format_score || score * 0.15) >= 8 ? "warning" : "poor",
          },
        ];

        const analysis: AnalysisResult = {
          overallScore: score,
          breakdown,
          suggestions: data.suggestions || data.improvements || [],
          keywords: data.keywords || data.matched_keywords || [],
        };

        setResult(analysis);
        onScoreComputed?.(score);
      } else {
        // Fallback: generate a placeholder analysis
        toast({
          title: "Analysis unavailable",
          description: "Upload a resume and complete your profile for accurate scoring.",
        });
      }
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
        {loading ? "Analyzing..." : "Check ATS Score"}
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
          <p className="font-medium">ATS Score</p>
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
          Resume ATS Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!result ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Analyze your resume to see how it scores against ATS systems
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
              <h4 className="text-sm font-semibold">Score Breakdown</h4>
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

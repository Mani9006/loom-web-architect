/**
 * Side panel: job tailoring + live ATS score.
 *
 * - User pastes a job description and clicks "Tailor".
 * - Calls career-ops-tailor-v2 edge function.
 * - Hands the tailored result back to the builder so it can be saved as a
 *   separate version without overwriting the source resume.
 * - Below, shows live ATS score (computed client-side from current store state)
 *   plus JD-keyword match if a JD is present.
 */
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useResumeStore } from "@/lib/resume-store";
import { calculateATSScore } from "@/lib/ats-scorer";
import { TerminalLoader } from "@/components/Terminal";
import type { ResumeJSON } from "@/types/resume";
import { captureIncident } from "@/lib/incidents";

export function AiTailorPanel({
  onCreateTailoredVersion,
}: {
  onCreateTailoredVersion: (tailored: ResumeJSON) => Promise<void>;
}) {
  const { resume, jobDescription, setJobDescription } = useResumeStore(
    useShallow((s) => ({
      resume: s.resume,
      jobDescription: s.jobDescription,
      setJobDescription: s.setJobDescription,
    })),
  );
  const [busy, setBusy] = useState(false);

  const score = useMemo(() => {
    try {
      return calculateATSScore(resume, jobDescription || undefined);
    } catch {
      return null;
    }
  }, [resume, jobDescription]);

  const onTailor = async () => {
    if (!jobDescription.trim() || jobDescription.trim().length < 50) {
      toast.error("Paste the full job description (at least 50 chars).");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ tailored: ResumeJSON }>(
        "career-ops-tailor-v2",
        { body: { resume, job_description: jobDescription } },
      );
      if (error) throw error;
      if (!data?.tailored) throw new Error("Empty response from tailor");
      await onCreateTailoredVersion(data.tailored);
      toast.success("Tailored version created. Your source resume is unchanged.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tailor failed";
      void captureIncident(e, { source: "manual", operation: "resume_tailor" });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="size-4 text-primary" /> Job Tailor
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Create a separate, job-specific version without changing your source resume or inventing experience.
        </p>
      </div>

      <div className="p-4 space-y-3">
        <Textarea
          rows={8}
          placeholder="Paste the full job description here..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className="font-mono text-xs resize-none"
        />
        <Button onClick={onTailor} disabled={busy} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Sparkles className="size-4 mr-1.5" />}
          {busy ? "Creating tailored version..." : "Create tailored version"}
        </Button>
        {busy && (
          <TerminalLoader
            title="Job tailor"
            lines={[
              "extracting required skills from the JD...",
              "scoring your bullets against the role...",
              "rewriting summary + bullets for impact...",
              "preserving every fact, no fabrication...",
              "rendering tailored output...",
            ]}
          />
        )}
      </div>

      <div className="border-t flex-1 overflow-auto">
        <div className="p-4">
          <h3 className="text-sm font-semibold mb-2">ATS Score</h3>
          {score ? <ScoreView score={score} /> : <p className="text-xs text-muted-foreground">No score yet.</p>}
        </div>
      </div>
    </div>
  );
}

function ScoreView({ score }: { score: ReturnType<typeof calculateATSScore> }) {
  const tier = score.overall >= 90 ? "Excellent" : score.overall >= 75 ? "Strong" : score.overall >= 60 ? "Decent" : "Needs work";
  const color =
    score.overall >= 90 ? "bg-emerald-500" : score.overall >= 75 ? "bg-blue-500" : score.overall >= 60 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold tabular-nums">{score.overall}</div>
          <Badge variant={score.passesATS ? "default" : "destructive"}>{tier}</Badge>
        </div>
        <Progress value={score.overall} indicatorClassName={color} className="mt-2" />
        <p className="text-[11px] text-muted-foreground mt-1.5">{score.summary}</p>
      </div>

      <div className="space-y-1.5">
        {score.sections.map((s) => (
          <div key={s.section} className="text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{s.section}</span>
              <span className="tabular-nums">{s.score}/{s.maxScore}</span>
            </div>
            <Progress value={(s.score / s.maxScore) * 100} className="h-1 mt-0.5" />
          </div>
        ))}
      </div>

      {score.issues.length > 0 && (
        <div>
          <div className="text-xs font-semibold mt-2 mb-1">Top issues</div>
          <ul className="space-y-1.5">
            {score.issues.slice(0, 5).map((iss) => (
              <li key={iss.id} className="text-[11px] leading-snug">
                <Badge variant={iss.severity === "critical" ? "destructive" : "secondary"} className="mr-1 align-middle">
                  {iss.severity}
                </Badge>
                <span className="font-medium">{iss.title}.</span>{" "}
                <span className="text-muted-foreground">{iss.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

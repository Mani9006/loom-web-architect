import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink, Zap, Loader2, CheckCircle2, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveJobUrl } from "@/lib/job-url";
import { trackProductEvent } from "@/lib/product-analytics";
import { useNavigate } from "react-router-dom";
import { normalizeScore } from "@/lib/score-truth";

interface JobApplyButtonProps {
  job: {
    id?: string;
    title: string;
    company: string;
    location?: string | null;
    apply_url?: string | null;
    source?: string | null;
    description?: string | null;
  };
  variant?: "default" | "compact";
  onApplied?: () => void;
}

export function JobApplyButton({ job, variant = "default", onApplied }: JobApplyButtonProps) {
  const { user } = useAuth();
  const { hasAutoApply } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [applying, setApplying] = useState(false);
  const [actionComplete, setActionComplete] = useState<"opened" | "prepared" | "queued" | null>(null);

  const resolved = resolveJobUrl(job.apply_url, job.title, job.company, job.location);

  const recordApplicationAction = async (method: "manual" | "auto") => {
    if (!user) return;

    try {
      // Opening a form or entering the automation queue is not a verified
      // submission. Keep it saved until the worker records a receipt.
      const { data: existing, error: lookupError } = await supabase
        .from("tracked_jobs")
        .select("id")
        .eq("user_id", user.id)
        .eq("title", job.title)
        .eq("company", job.company)
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) {
        const { error: insertError } = await supabase.from("tracked_jobs").insert({
          user_id: user.id,
          title: job.title,
          company: job.company,
          status: "Saved",
          url: resolved.url,
        });
        if (insertError) throw insertError;
      }

      void trackProductEvent(method === "auto" ? "job_apply_queued" : "job_apply_opened", {
        method,
        source: job.source || "unknown",
        company: job.company,
      });
    } catch (err) {
      console.error("Error recording application:", err);
    }
  };

  const handleManualApply = async () => {
    // Open job URL in new tab
    window.open(resolved.url, "_blank", "noopener,noreferrer");

    await recordApplicationAction("manual");
    setActionComplete("opened");
    onApplied?.();

    toast({
      title: "Application opened",
      description: `The ${job.company} form is open. ResumePreps will not mark it submitted until there is a receipt.`,
    });
  };

  const handleAutoApply = async () => {
    if (!hasAutoApply) {
      toast({
        title: "Premium Feature",
        description: "Cloud Auto-Apply requires an Autopilot subscription.",
      });
      navigate("/pricing");
      return;
    }

    setApplying(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/career-ops-one-click`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            apply_url: job.apply_url,
            source: job.source,
            queue_if_supported: true,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        const jobCoverage = normalizeScore(result.ats_score);
        await recordApplicationAction("auto");
        setActionComplete(result.status === "queued" ? "queued" : "prepared");
        onApplied?.();
        toast({
          title: result.status === "queued" ? "Added to application queue" : "Application packet ready",
          description: result.status === "queued"
            ? `ResumePreps prepared the tailored packet and queued the ${job.company} application.`
            : `The tailored resume and answers are ready for review${jobCoverage !== null ? ` · Job-requirement coverage ${jobCoverage}%` : ""}.`,
        });
        if (result.draft_id) navigate(`/applications/${result.draft_id}`);
      } else {
        await response.json().catch(() => ({}));
        toast({
          title: "Application could not be prepared",
          description: response.status === 412
            ? "Add or finish your source resume, then try again."
            : "Try again in a moment. You can still open the employer application directly.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Application could not be prepared",
        description: "Try again in a moment. You can still open the employer application directly.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  if (actionComplete) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-9 gap-2 px-3 font-medium">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          {actionComplete === "queued" ? "Queued" : actionComplete === "prepared" ? "Packet ready" : "Application opened"}
        </Badge>
        <Button
          variant="outline"
          size={variant === "compact" ? "sm" : "default"}
          className="gap-2"
          onClick={() => window.open(resolved.url, "_blank", "noopener,noreferrer")}
        >
          Open application again <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" className="gap-1.5 h-8" onClick={handleManualApply}>
          Apply <ExternalLink className="w-3.5 h-3.5" />
        </Button>
        {hasAutoApply && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 h-8"
            onClick={handleAutoApply}
            disabled={applying}
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Queue
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button className="gap-2 flex-1" onClick={handleManualApply}>
        {resolved.isFallback ? resolved.label : "Apply Now"}
        <ExternalLink className="w-4 h-4" />
      </Button>
      <Button
        variant={hasAutoApply ? "secondary" : "outline"}
        className={cn("gap-2", !hasAutoApply && "opacity-70")}
        onClick={handleAutoApply}
        disabled={applying}
      >
        {applying ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : hasAutoApply ? (
          <Zap className="w-4 h-4" />
        ) : (
          <Crown className="w-4 h-4" />
        )}
        {hasAutoApply ? "Prepare & queue" : "Autopilot"}
      </Button>
    </div>
  );
}

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

interface JobApplyButtonProps {
  job: {
    id?: string;
    title: string;
    company: string;
    location?: string | null;
    apply_url?: string | null;
    source?: string | null;
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
  const [applied, setApplied] = useState(false);

  const resolved = resolveJobUrl(job.apply_url, job.title, job.company, job.location);

  const recordApplication = async (method: "manual" | "auto") => {
    if (!user) return;

    try {
      // Record in tracked_jobs
      await supabase.from("tracked_jobs").upsert(
        {
          user_id: user.id,
          title: job.title,
          company: job.company,
          status: "Applied",
        },
        { onConflict: "user_id,title,company" }
      );

      // Record in job_applications if it exists
      try {
        await supabase.from("job_applications").insert({
          user_id: user.id,
          job_id: job.id || null,
          title: job.title,
          company: job.company,
          status: "applied",
          notes: `Applied via ${method}`,
        });
      } catch {
        // job_applications table may not exist yet
      }

      void trackProductEvent("job_applied", {
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

    // Record the application
    await recordApplication("manual");
    setApplied(true);
    onApplied?.();

    toast({
      title: "Application started!",
      description: `Opened ${job.company} job page. Update your tracker after applying.`,
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/applypass-agent-queue`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || anonKey}`,
          },
          body: JSON.stringify({
            action: "enqueue",
            user_id: user?.id,
            jobs: [{
              title: job.title,
              company: job.company,
              apply_url: job.apply_url,
              source: job.source,
            }],
          }),
        }
      );

      if (response.ok) {
        await recordApplication("auto");
        setApplied(true);
        onApplied?.();
        toast({
          title: "Auto-Apply queued!",
          description: `Application to ${job.company} has been queued for processing.`,
        });
      } else {
        toast({
          title: "Auto-Apply failed",
          description: "Could not queue auto-application. Try manual apply.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Auto-Apply error",
        description: "Something went wrong. Try manual apply instead.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  if (applied) {
    return (
      <Button variant="outline" size={variant === "compact" ? "sm" : "default"} disabled className="gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        Applied
      </Button>
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
            Auto
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
        {hasAutoApply ? "Auto-Apply" : "Autopilot"}
      </Button>
    </div>
  );
}

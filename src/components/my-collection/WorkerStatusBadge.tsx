import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { isWorkerOnline } from "@/lib/mc-ai-jobs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Small badge that shows whether AI features are currently available.
 * The worker writes a heartbeat into mc_worker_heartbeats every 30s.
 * "Online" means we've seen one in the last 90s.
 */
export default function WorkerStatusBadge() {
  const [state, setState] = useState<{
    online: boolean;
    lastSeen: string | null;
    hostname: string | null;
  } | null>(null);

  useEffect(() => {
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const status = await isWorkerOnline(userData.user.id);
      if (!stopped) setState(status);
    }

    refresh();
    interval = setInterval(refresh, 20000);

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  if (!state) {
    return null;
  }

  const dotColor = state.online ? "bg-emerald-500" : "bg-zinc-400";
  const label = state.online ? "AI ready" : "AI offline";
  const description = state.online
    ? `AI features are available${state.hostname ? ` (worker: ${state.hostname})` : ""}. Tailoring and job search typically take 15–60 seconds.`
    : "The AI worker isn't running. Start the Claude worker on your machine to enable AI features (job search, tailoring, line rewrites).";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1.5 text-[10px] font-normal cursor-help">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-[11px]">
          {description}
          {state.lastSeen && (
            <div className="mt-1 opacity-60">
              Last heartbeat: {new Date(state.lastSeen).toLocaleTimeString()}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

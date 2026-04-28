import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 2 — per-session metrics: discovery count, applied count, response rate,
 * interview conversion, days-to-interview-median, top companies, AI cost spent.
 * For now shows the basic counts and a placeholder for the rest.
 */
export default function StatsTab({ sessionId }: { sessionId: string }) {
  const [counts, setCounts] = useState({ tracked: 0, evaluations: 0, resumes: 0 });

  useEffect(() => {
    (async () => {
      const [tracked, evaluations, resumes] = await Promise.all([
        (supabase as any).from("mc_tracked_jobs").select("*", { count: "exact", head: true }).eq("session_id", sessionId),
        (supabase as any).from("mc_evaluations").select("*", { count: "exact", head: true }).eq("session_id", sessionId),
        (supabase as any)
          
.from("mc_tailored_resumes")
          .select("*", { count: "exact", head: true })
          .eq("session_id", sessionId),
      ]);
      setCounts({
        tracked: tracked.count ?? 0,
        evaluations: evaluations.count ?? 0,
        resumes: resumes.count ?? 0,
      });
    })();
  }, [sessionId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Jobs scored" value={counts.evaluations} />
        <StatCard label="On the board" value={counts.tracked} />
        <StatCard label="Tailored resumes" value={counts.resumes} />
      </div>
      <Card className="p-6 text-center border-dashed">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Detailed stats (response rate, days-to-interview, top companies, AI tokens used) ship in Phase 2.
        </p>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </Card>
  );
}

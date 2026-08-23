import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { DeskChatRail } from "@/components/desk/DeskChatRail";
import { EmptyState, Panel, PrimaryButton, PageSkeleton } from "@/components/brand/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useApplyCredits } from "@/hooks/use-apply-credits";
import { looksLikeUsLocation } from "@/lib/us-geo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MatchRow {
  evaluation_id: string;
  title: string;
  company: string;
  location: string;
  score: number;
}

interface AppRow {
  id: string;
  title: string;
  company: string;
  status: string;
}

interface InboxRow {
  id: string;
  subject: string;
  from: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { snapshot: credits } = useApplyCredits();
  const [hasResume, setHasResume] = useState(false);
  const [handsOff, setHandsOff] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [resumeRes, matchRes, appRes, prefRes, mailRes] = await Promise.all([
        supabase.from("resumes").select("id").eq("user_id", user.id).limit(1),
        supabase
          .from("job_evaluations")
          .select("id,fit_score,score,dismissed_at,scanned_jobs(title,location,company:scan_companies(name))")
          .eq("user_id", user.id)
          .is("dismissed_at", null)
          .order("fit_score", { ascending: false })
          .limit(10),
        supabase
          .from("draft_applications")
          .select("id,status,evaluation:job_evaluations(scanned_job:scanned_jobs(title,company:scan_companies(name)))")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(8),
        supabase.from("user_job_prefs").select("auto_apply_enabled,agent_enabled").eq("user_id", user.id).maybeSingle(),
        (supabase as never as { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Array<{ id: string; subject: string | null; from_email: string }> | null }> } } } } }).from("mc_inbound_emails")
          .select("id,subject,from_email")
          .eq("user_id", user.id)
          .order("received_at", { ascending: false })
          .limit(4),
      ]);
      setHasResume((resumeRes.data || []).length > 0);
      setHandsOff(Boolean(prefRes.data && (prefRes.data as { auto_apply_enabled?: boolean; agent_enabled?: boolean }).auto_apply_enabled && (prefRes.data as { agent_enabled?: boolean }).agent_enabled));
      const nextMatches: MatchRow[] = [];
      for (const row of (matchRes.data || []) as Array<Record<string, unknown>>) {
        const job = row.scanned_jobs as { title?: string; location?: string; company?: { name?: string } } | null;
        if (!job?.title || !looksLikeUsLocation(job.location)) continue;
        nextMatches.push({
          evaluation_id: String(row.id),
          title: job.title,
          company: job.company?.name || "Company",
          location: job.location || "United States",
          score: Math.round(Number(row.fit_score ?? Number(row.score) * 20)),
        });
      }
      setMatches(nextMatches.slice(0, 6));
      setApps(((appRes.data || []) as Array<Record<string, unknown>>).flatMap((row) => {
        const job = (row.evaluation as { scanned_job?: { title?: string; company?: { name?: string } } } | null)?.scanned_job;
        if (!job?.title) return [];
        return [{ id: String(row.id), title: job.title, company: job.company?.name || "Company", status: String(row.status) }];
      }));
      setInbox((mailRes.data || []).map((row) => ({
        id: row.id,
        subject: row.subject || "Application update",
        from: row.from_email,
      })));
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [user]);

  const applyOne = async (evaluationId: string) => {
    setApplyingId(evaluationId);
    const { error } = await supabase.functions.invoke("apply-engine-enqueue", {
      body: { evaluation_ids: [evaluationId], intent: "user_selected" },
    });
    setApplyingId(null);
    if (error) {
      toast.error("That job could not be queued.");
      return;
    }
    toast.success("Queued. Applications will show the receipt.");
    navigate("/applications");
  };

  if (loading || !user) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Home"
        status="united states desk"
        description="Today’s matches and cloud activity. The chat rail can search, explain, queue a job you chose, open a receipt, or summarize inbox — never invent history."
        action={
          <PrimaryButton onClick={() => navigate(hasResume ? "/matches" : "/resume-builder")}>
            {hasResume ? "Open job matches" : "Add a US resume"}
          </PrimaryButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between border-b border-rp-ink/10 px-5 py-4">
              <h2 className="font-display text-[22px] italic">United States matches</h2>
              <button type="button" onClick={() => navigate("/matches")} className="text-[12px] text-rp-accent">Full feed</button>
            </div>
            {matches.length === 0 ? (
              <EmptyState
                title={hasResume ? "Scan is still filling" : "Resume first"}
                body={hasResume ? "Paste a job URL on Job matches or wait for the hourly US career-page scan." : "Upload a United States resume so we can score roles against real history."}
                action={<PrimaryButton onClick={() => navigate(hasResume ? "/matches" : "/resume-builder")}>{hasResume ? "Paste a URL" : "Upload resume"}</PrimaryButton>}
              />
            ) : (
              <ul className="divide-y divide-rp-ink/10">
                {matches.map((match) => (
                  <li key={match.evaluation_id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{match.title}</p>
                      <p className="truncate text-[13px] text-rp-ink-2">{match.company} · {match.location}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[12px] text-rp-accent-2">{match.score}%</span>
                      <button
                        type="button"
                        disabled={applyingId === match.evaluation_id}
                        onClick={() => void applyOne(match.evaluation_id)}
                        className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {applyingId === match.evaluation_id ? "Queuing…" : "Apply"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <div className="flex items-center justify-between border-b border-rp-ink/10 px-5 py-4">
              <h2 className="font-display text-[22px] italic">Cloud activity</h2>
              <button type="button" onClick={() => navigate("/applications")} className="text-[12px] text-rp-accent">Applications</button>
            </div>
            {apps.length === 0 ? (
              <EmptyState title="No queue yet" body="Apply one match. Status moves queued → tailoring → receipt. Submitted never appears without evidence." />
            ) : (
              <ul className="divide-y divide-rp-ink/10">
                {apps.map((app) => (
                  <li key={app.id}>
                    <button type="button" onClick={() => navigate(`/applications/${app.id}`)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{app.title}</p>
                        <p className="truncate text-[13px] text-rp-ink-2">{app.company}</p>
                      </div>
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-rp-ink-3">{app.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {credits && (
              <p className="border-t border-rp-ink/10 px-5 py-3 font-mono text-[11px] text-rp-ink-3">
                {credits.remaining} credits left · {credits.daily_remaining} live left today · hands-off {handsOff ? "on" : "off"}
              </p>
            )}
          </Panel>

          <Panel>
            <div className="flex items-center justify-between border-b border-rp-ink/10 px-5 py-4">
              <h2 className="font-display text-[22px] italic">Recruiter inbox</h2>
              <button type="button" onClick={() => navigate("/inbox")} className="text-[12px] text-rp-accent">Open inbox</button>
            </div>
            {inbox.length === 0 ? (
              <EmptyState title="Quiet so far" body="Confirmations land on the dedicated apply-from address. Optional Gmail is read-only." />
            ) : (
              <ul className="divide-y divide-rp-ink/10">
                {inbox.map((row) => (
                  <li key={row.id} className="px-5 py-3.5">
                    <p className="truncate font-medium">{row.subject}</p>
                    <p className="truncate text-[13px] text-rp-ink-2">{row.from}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <DeskChatRail userId={user.id} handsOffEnabled={handsOff} />
      </div>
    </div>
  );
}

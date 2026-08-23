import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Bot } from "lucide-react";
import { canAutoApplyFromChat, deskGuardrailCopy, planDeskTurn, type DeskToolCall } from "@/lib/desk-chat";
import { looksLikeUsLocation } from "@/lib/us-geo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChatLine {
  role: "user" | "assistant";
  text: string;
  tool?: DeskToolCall;
}

export function DeskChatRail({
  userId,
  handsOffEnabled,
}: {
  userId: string;
  handsOffEnabled: boolean;
}) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([{
    role: "assistant",
    text: "I can search United States matches, explain a fit score, queue a job you chose, open a receipt, tune hands-off apply, or summarize inbox mail. I will not invent work history or mark anything submitted.",
  }]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const plan = planDeskTurn(text, { handsOffEnabled });
    setLines((current) => [...current, { role: "user", text }, { role: "assistant", text: "Working…", tool: plan }]);
    setBusy(true);
    const reply = await runTool(plan, { userId, handsOffEnabled, navigate, query: text });
    setLines((current) => {
      const next = [...current];
      next[next.length - 1] = { role: "assistant", text: reply, tool: plan };
      return next;
    });
    setBusy(false);
  };

  return (
    <aside className="flex h-[min(720px,calc(100vh-140px))] flex-col rounded-lg border border-rp-ink/10 bg-rp-paper">
      <div className="flex items-center gap-2 border-b border-rp-ink/10 px-4 py-3">
        <Bot className="h-4 w-4 text-rp-accent-2" strokeWidth={1.75} />
        <div>
          <p className="text-[13px] font-medium">Desk chat</p>
          <p className="text-[11px] text-rp-ink-3">Tools stay on-policy</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {lines.map((line, index) => (
          <div key={index} className={cn("max-w-[95%] text-[13px] leading-relaxed", line.role === "user" ? "ml-auto rounded-md bg-primary px-3 py-2 text-primary-foreground" : "text-rp-ink")}>
            {line.tool && line.role === "assistant" && (
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-rp-accent-2">
                tool · {line.tool.name}
              </p>
            )}
            {line.text}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-rp-ink/10 p-3"
        onSubmit={(event) => { event.preventDefault(); void send(); }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search matches, explain a role, queue Apply…"
          className="h-10 flex-1 rounded-md border border-rp-ink/15 bg-rp-canvas px-3 text-[13px]"
        />
        <button type="submit" disabled={busy} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send">
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}

async function runTool(
  plan: DeskToolCall,
  ctx: { userId: string; handsOffEnabled: boolean; navigate: (path: string) => void; query: string },
): Promise<string> {
  if (plan.name === "refuse") return deskGuardrailCopy(plan);

  if (plan.name === "tune_hands_off") {
    ctx.navigate("/agent");
    return "Opened Hands-off apply. Change the daily cap, recipes, and kill switch there. Chat will not enable apply behind your back.";
  }

  if (plan.name === "summarize_inbox") {
    const { data } = await (supabase as never as { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Array<{ subject: string | null; classification: string | null }> | null }> } } } } }).from("mc_inbound_emails")
      .select("subject,classification")
      .eq("user_id", ctx.userId)
      .order("received_at", { ascending: false })
      .limit(8);
    ctx.navigate("/inbox");
    if (!data?.length) return "Inbox is empty. Your dedicated apply-from address is on Recruiter inbox. Inbound delivery may be stubbed until VITE_APPLY_INBOX_INBOUND_ENABLED=true.";
    const counts = data.reduce<Record<string, number>>((acc, row) => {
      const key = row.classification || "other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return `Latest mail: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}. I opened Recruiter inbox.`;
  }

  if (plan.name === "open_application") {
    const { data } = await supabase
      .from("draft_applications")
      .select("id,status,evaluation:job_evaluations(scanned_job:scanned_jobs(title,company:scan_companies(name)))")
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false })
      .limit(8);
    const rows = (data || []) as Array<Record<string, unknown>>;
    const needle = ctx.query.toLowerCase();
    const hit = rows.find((row) => {
      const job = (row.evaluation as { scanned_job?: { title?: string; company?: { name?: string } } } | null)?.scanned_job;
      return `${job?.title || ""} ${job?.company?.name || ""}`.toLowerCase().includes(needle.replace(/open|application|receipt|status|of|the/g, "").trim());
    }) || rows[0];
    if (!hit) return "No applications yet. Apply a match first.";
    ctx.navigate(`/applications/${hit.id}`);
    return `Opened application ${String(hit.id).slice(0, 8)} · ${String(hit.status)}. Submitted only appears with a portal receipt.`;
  }

  if (plan.name === "search_matches" || plan.name === "explain_match" || plan.name === "apply_one_job") {
    const { data } = await supabase
      .from("job_evaluations")
      .select("id,fit_score,score,summary,scanned_jobs(title,location,company:scan_companies(name))")
      .eq("user_id", ctx.userId)
      .is("dismissed_at", null)
      .order("fit_score", { ascending: false })
      .limit(12);
    const matches = ((data || []) as Array<Record<string, unknown>>).flatMap((row) => {
      const job = row.scanned_jobs as { title?: string; location?: string; company?: { name?: string } } | null;
      if (!job?.title || !looksLikeUsLocation(job.location)) return [];
      return [{
        id: String(row.id),
        title: job.title,
        company: job.company?.name || "Company",
        location: job.location || "United States",
        score: Math.round(Number(row.fit_score ?? Number(row.score) * 20)),
        summary: String(row.summary || ""),
      }];
    });

    if (plan.name === "explain_match") {
      const needle = ctx.query.toLowerCase();
      const hit = matches.find((row) => `${row.title} ${row.company}`.toLowerCase().includes(needle.replace(/why|explain|match|this|that|the/g, "").trim())) || matches[0];
      if (!hit) return "No US matches to explain yet. Upload a resume and refresh Job matches.";
      ctx.navigate("/matches");
      return `${hit.title} at ${hit.company} is a ${hit.score}% career fit. ${hit.summary || "Score comes from stored evidence, not invented history."}`;
    }

    if (plan.name === "apply_one_job") {
      if (!canAutoApplyFromChat(ctx.handsOffEnabled, true)) {
        return "I will not apply unless you click Apply or enable hands-off apply.";
      }
      const hit = matches[0];
      if (!hit) return "No eligible US match to queue.";
      const { error } = await supabase.functions.invoke("apply-engine-enqueue", {
        body: { evaluation_ids: [hit.id], intent: "user_selected" },
      });
      if (error) return "The cloud queue rejected that job. Try Apply on Job matches.";
      ctx.navigate("/applications");
      return `Queued ${hit.title} at ${hit.company}. Watch Applications for queued → tailored → receipt. Failures do not spend a credit.`;
    }

    ctx.navigate("/matches");
    if (matches.length === 0) return "No United States matches stored yet. I opened Job matches so you can refresh or paste a URL.";
    return matches.slice(0, 5).map((row) => `${row.score}% · ${row.title} · ${row.company}`).join("\n");
  }

  return deskGuardrailCopy(plan);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { captureIncident } from "@/lib/incidents";
import {
  PIPELINE_COLUMNS,
  pipelineFromCsv,
  pipelineToCsv,
  normalizePipelineStatus,
  type PipelineCard,
  type PipelineStatus,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export default function PipelinePage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("tracked_jobs")
      .select("id,title,company,status,url,notes,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      void captureIncident(new Error(error.message), { source: "manual", operation: "pipeline_load" });
      setLoading(false);
      return;
    }
    setCards((data || []).map((row) => ({
      id: row.id,
      title: row.title,
      company: row.company,
      status: normalizePipelineStatus(row.status),
      url: row.url,
      notes: row.notes,
      updated_at: row.updated_at,
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_COLUMNS.map((column) => [column.key, [] as PipelineCard[]])) as Record<PipelineStatus, PipelineCard[]>;
    for (const card of cards) map[card.status].push(card);
    return map;
  }, [cards]);

  const move = async (id: string, status: PipelineStatus) => {
    setCards((current) => current.map((card) => card.id === id ? { ...card, status } : card));
    const { error } = await supabase.from("tracked_jobs").update({ status }).eq("id", id).eq("user_id", user!.id);
    if (error) void captureIncident(new Error(error.message), { source: "manual", operation: "pipeline_move" });
  };

  const exportCsv = () => {
    const blob = new Blob([pipelineToCsv(cards)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pipeline.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (!user) return;
    const text = await file.text();
    const rows = pipelineFromCsv(text);
    if (rows.length === 0) return;
    const { error } = await supabase.from("tracked_jobs").insert(rows.map((row) => ({
      user_id: user.id,
      title: row.title,
      company: row.company,
      status: row.status,
      url: row.url,
      notes: row.notes,
    })));
    if (error) void captureIncident(new Error(error.message), { source: "manual", operation: "pipeline_import" });
    await load();
  };

  if (loading) {
    return <div className="max-w-[1200px] mx-auto px-6 py-10"><div className="h-96 rounded-lg bg-rp-paper animate-pulse" /></div>;
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-10 pb-16">
      <PageHeader
        title="Pipeline"
        status="kanban · US search"
        description="Applied, Ghosted, Interviewing, Rejected, Offer. Import or export CSV. This is follow-up, not the cloud apply queue."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>Import CSV</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
              event.target.value = "";
            }} />
          </div>
        }
      />

      {cards.length === 0 ? (
        <div className="mt-8 border border-rp-rule bg-rp-paper p-10 text-center">
          <p className="text-sm font-medium text-rp-ink">No pipeline cards yet</p>
          <p className="mt-2 text-sm text-rp-ink-2">Submitted applications can be tracked here. Import a CSV or drag cards between columns after the first apply.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 overflow-x-auto pb-4 md:grid-cols-5">
          {PIPELINE_COLUMNS.map((column) => (
            <section
              key={column.key}
              className="min-w-[200px] border border-rp-rule bg-rp-paper p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (dragging) void move(dragging, column.key); setDragging(null); }}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-rp-ink">{column.label}</h2>
                <span className="text-xs tabular-nums text-rp-ink-3">{byStatus[column.key].length}</span>
              </div>
              <div className="space-y-2">
                {byStatus[column.key].map((card) => (
                  <article
                    key={card.id}
                    draggable
                    onDragStart={() => setDragging(card.id)}
                    className={cn("cursor-grab border border-rp-rule bg-rp-canvas p-3", dragging === card.id && "opacity-60")}
                  >
                    <p className="text-sm font-medium text-rp-ink">{card.title}</p>
                    <p className="mt-0.5 text-xs text-rp-ink-2">{card.company}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

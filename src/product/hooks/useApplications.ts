import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toBoardRow, type BoardDraft, type BoardRow, type BoardTask } from "@/lib/application-board";
import { db } from "@/product/lib/table";
import { productTabCounts, rowMatchesProductTab, type ProductAppTab } from "@/product/lib/application-tabs";

const PAGE_SIZE = 20;

export function useApplications() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProductAppTab>("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db()
      .from("draft_applications")
      .select(`id,status,error_message,submitted_at,created_at,updated_at,applypass_task_id,tailored_resume_id,tailored_cv_md,answers,
        evaluation:job_evaluations(scanned_job:scanned_jobs(title,company:scan_companies(name)))`)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(400);
    if (error) {
      setLoading(false);
      return;
    }
    const drafts = (data || []) as unknown as BoardDraft[];
    const taskIds = drafts.map((d) => d.applypass_task_id).filter(Boolean) as string[];
    const taskById = new Map<string, BoardTask>();
    if (taskIds.length) {
      const { data: tasks } = await db()
        .from("applypass_tasks")
        .select("id,status,error_message,result,created_at")
        .in("id", taskIds);
      for (const task of (tasks || []) as BoardTask[]) taskById.set(task.id, task);
    }
    setRows(drafts.map((draft) => toBoardRow(draft, taskById)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = db()
      .channel("product-applications")
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_applications" }, () => {
        void load();
      })
      .subscribe();
    const poll = window.setInterval(() => void load(), 12_000);
    return () => {
      window.clearInterval(poll);
      void db().removeChannel(channel);
    };
  }, [user, load]);

  const filtered = useMemo(() => rows.filter((row) => rowMatchesProductTab(row, tab)), [rows, tab]);
  const counts = useMemo(() => productTabCounts(rows), [rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  return { rows, filtered, paged, counts, tab, setTab, page, setPage, pageCount, pageSize: PAGE_SIZE, loading, reload: load };
}

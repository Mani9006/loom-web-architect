import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, invokeFunction, tableMissing } from "@/product/lib/table";
import { applyFromAddress } from "@/product/lib/format";

export type InboxCategory =
  | "all"
  | "verification"
  | "rejection"
  | "interview"
  | "assessment"
  | "reminder"
  | "offer"
  | "applied";

const CATEGORY_MAP: Record<string, InboxCategory> = {
  confirmation: "applied",
  interview_invite: "interview",
  take_home: "assessment",
  reject: "rejection",
  offer: "offer",
  other_recruiter: "reminder",
  verification: "verification",
  otp: "verification",
};

export interface InboxThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  category: InboxCategory;
  read: boolean;
  createdAt: string;
  applicationId: string | null;
  verificationCode: string | null;
}

export function useInbox() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<InboxCategory>("all");
  const [address, setAddress] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const fallback = applyFromAddress(user.email, user.id);
    setAddress(fallback);

    const mailbox = await db().from("apply_from_mailboxes").select("address").eq("user_id", user.id).maybeSingle();
    if (!mailbox.error && mailbox.data && (mailbox.data as { address?: string }).address) {
      setAddress((mailbox.data as { address: string }).address);
    } else if (tableMissing(mailbox.error) || !mailbox.data) {
      const insert = await db().from("apply_from_mailboxes").insert({
        user_id: user.id,
        local_part: fallback.split("@")[0],
        address: fallback,
      }).select("address").maybeSingle();
      if (!insert.error && insert.data) setAddress((insert.data as { address: string }).address);
    }

    const sessions = await db().from("mc_sessions").select("id").eq("user_id", user.id).limit(1);
    let sid = ((sessions.data || []) as Array<{ id: string }>)[0]?.id ?? null;
    if (!sid) {
      const created = await db().from("mc_sessions").insert({
        user_id: user.id,
        name: "Primary search",
      }).select("id").maybeSingle();
      sid = (created.data as { id?: string } | null)?.id ?? null;
    }
    setSessionId(sid);

    if (sid) {
      const conn = await db().from("mc_gmail_connections").select("id").eq("session_id", sid).maybeSingle();
      setGmailConnected(Boolean(conn.data));
    }

    const mail = await db()
      .from("mc_inbound_emails")
      .select("id,subject,from_address,snippet,classification,is_read,created_at,tracked_job_id,verification_code")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const mapped: InboxThread[] = ((mail.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      subject: String(row.subject || "(no subject)"),
      from: String(row.from_address || ""),
      snippet: String(row.snippet || ""),
      category: CATEGORY_MAP[String(row.classification || "")] || "reminder",
      read: Boolean(row.is_read),
      createdAt: String(row.created_at || ""),
      applicationId: (row.tracked_job_id as string | null) ?? null,
      verificationCode: (row.verification_code as string | null) ?? null,
    }));
    setThreads(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!gmailConnected) return;
    const poll = window.setInterval(() => {
      void invokeFunction("mc-gmail-poll", {});
      void load();
    }, 120_000);
    return () => window.clearInterval(poll);
  }, [gmailConnected, load]);

  const filtered = useMemo(
    () => (category === "all" ? threads : threads.filter((t) => t.category === category)),
    [threads, category],
  );

  const markRead = useCallback(async (id: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, read: true } : t)));
    await db().from("mc_inbound_emails").update({ is_read: true }).eq("id", id);
  }, []);

  const connectGmail = useCallback(async () => {
    if (!sessionId) return;
    const result = await invokeFunction<{ auth_url?: string }>("mc-gmail-connect", {
      session_id: sessionId,
      return_to: `${window.location.origin}/inbox`,
    });
    if (result.data?.auth_url) window.location.href = result.data.auth_url;
  }, [sessionId]);

  return {
    threads: filtered,
    allThreads: threads,
    loading,
    category,
    setCategory,
    address,
    gmailConnected,
    sessionId,
    markRead,
    connectGmail,
    reload: load,
  };
}

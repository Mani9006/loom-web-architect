/* eslint-disable @typescript-eslint/no-explicit-any -- user_mailboxes ships ahead of generated client types */
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface HostedMailbox {
  address: string;
  forward_to: string | null;
  forward_verified: boolean;
  forwarding_enabled: boolean;
  status: "active" | "paused";
}

export interface PendingForward {
  forward_to: string;
  expires_at: string;
}

export class MailboxActionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

function fromRow(row: any): HostedMailbox {
  return {
    address: `${row.local_part}@${row.domain}`,
    forward_to: row.forward_to ?? null,
    forward_verified: Boolean(row.forward_verified_at),
    forwarding_enabled: Boolean(row.forwarding_enabled),
    status: row.status === "paused" ? "paused" : "active",
  };
}

function fromResponse(value: any): HostedMailbox {
  return {
    address: String(value.address),
    forward_to: value.forward_to ?? null,
    forward_verified: Boolean(value.forward_verified),
    forwarding_enabled: Boolean(value.forwarding_enabled),
    status: value.status === "paused" ? "paused" : "active",
  };
}

const FALLBACK_MESSAGE = "That didn't work. Try again in a moment.";

// Edge functions in this feature return their own plain, user-safe copy in
// `error` (see supabase/functions/mailbox-*). Anything else gets a generic
// message so internal details never reach the UI.
async function invoke(name: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;
  let message = FALLBACK_MESSAGE;
  let code = "UNKNOWN";
  const context = (error as any)?.context;
  if (context && typeof context.json === "function") {
    const payload = await context.json().catch(() => null);
    if (payload && typeof payload.error === "string" && typeof payload.code === "string") {
      message = payload.error;
      code = payload.code;
    }
  }
  throw new MailboxActionError(message, code);
}

export function useHostedMailbox() {
  const { user } = useAuth();
  const [mailbox, setMailbox] = useState<HostedMailbox | null>(null);
  const [loading, setLoading] = useState(true);
  // False when the feature's table isn't deployed yet: the UI stays hidden.
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from("user_mailboxes")
      .select("local_part,domain,forward_to,forward_verified_at,forwarding_enabled,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      setAvailable(false);
      setMailbox(null);
    } else {
      setAvailable(true);
      setMailbox(data ? fromRow(data) : null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const provision = useCallback(async () => {
    const data = await invoke("mailbox-provision", {});
    const next = fromResponse(data.mailbox);
    setMailbox(next);
    return next;
  }, []);

  const setForwarding = useCallback(async (enabled: boolean) => {
    const data = await invoke("mailbox-settings", { action: "set_forwarding", enabled });
    setMailbox(fromResponse(data.mailbox));
  }, []);

  const requestForwardChange = useCallback(async (forwardTo: string): Promise<PendingForward | null> => {
    const data = await invoke("mailbox-settings", { action: "request_forward_change", forward_to: forwardTo });
    if (data.mailbox) setMailbox(fromResponse(data.mailbox));
    return data.pending ?? null;
  }, []);

  const confirmForwardChange = useCallback(async (forwardTo: string, code: string) => {
    const data = await invoke("mailbox-settings", { action: "confirm_forward_change", forward_to: forwardTo, code });
    setMailbox(fromResponse(data.mailbox));
  }, []);

  const sendReply = useCallback(async (input: { replyToEmailId: string; body: string; clientRequestId: string }) => {
    return invoke("mailbox-send", {
      reply_to_email_id: input.replyToEmailId,
      body: input.body,
      client_request_id: input.clientRequestId,
    });
  }, []);

  return {
    mailbox,
    loading,
    available,
    refresh,
    provision,
    setForwarding,
    requestForwardChange,
    confirmForwardChange,
    sendReply,
  };
}

export type HostedMailboxController = ReturnType<typeof useHostedMailbox>;

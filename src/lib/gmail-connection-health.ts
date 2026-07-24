export interface GmailConnectionHealthInput {
  enabled: boolean;
  status?: string | null;
  last_error_code?: string | null;
}

export type GmailConnectionPresentation =
  | {
      kind: "connected";
      badge: "Connected";
      detail: null;
      connected: true;
      canPoll: true;
    }
  | {
      kind: "degraded";
      badge: "Check delayed";
      detail: string;
      connected: true;
      canPoll: true;
    }
  | {
      kind: "disconnected";
      badge: "Reconnect needed";
      detail: string;
      connected: false;
      canPoll: false;
    };

export function presentGmailConnectionHealth(
  connection: GmailConnectionHealthInput,
): GmailConnectionPresentation {
  if (!connection.enabled || connection.status === "disconnected") {
    return {
      kind: "disconnected",
      badge: "Reconnect needed",
      detail: "Reconnect Google to resume automatic application inbox checks.",
      connected: false,
      canPoll: false,
    };
  }

  if (connection.status !== "connected") {
    const detail = connection.last_error_code === "INBOX_RATE_LIMITED"
      ? "Google asked us to pause briefly. Checks will retry automatically."
      : "Application inbox checks are temporarily delayed and will retry automatically.";
    return {
      kind: "degraded",
      badge: "Check delayed",
      detail,
      connected: true,
      canPoll: true,
    };
  }

  return {
    kind: "connected",
    badge: "Connected",
    detail: null,
    connected: true,
    canPoll: true,
  };
}

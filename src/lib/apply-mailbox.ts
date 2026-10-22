/** Dedicated apply-from mailbox. Inbound delivery is env-gated and may be stubbed. */

export function applyInboxDomain(): string {
  return String(import.meta.env.VITE_APPLY_INBOX_DOMAIN || "apply.resumepreps.com").trim() || "apply.resumepreps.com";
}

export function applyInboxInboundEnabled(): boolean {
  return String(import.meta.env.VITE_APPLY_INBOX_INBOUND_ENABLED || "").toLowerCase() === "true";
}

export function parseMailbox(raw: unknown): { address: string; domain: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const address = typeof row.address === "string" ? row.address.trim() : "";
  if (!address.includes("@")) return null;
  return { address, domain: typeof row.domain === "string" ? row.domain : address.split("@")[1] };
}

// Thin Resend REST client for the hosted application mailbox.
//
// Paths confirmed against resend-node (src/emails/receiving/receiving.ts and
// src/emails/receiving/attachments/attachments.ts):
//   GET  /emails/receiving/{email_id}               → html, text, headers, …
//   GET  /emails/receiving/{email_id}/attachments   → { data: [{ filename, download_url, size, content_type, … }] }
//   POST /emails                                    → { id }  (supports Idempotency-Key header)
//
// Raw fetch on purpose (no SDK) so it runs in Deno without npm resolution.
// No Deno globals here; the API key is passed in.

export const RESEND_API_BASE = "https://api.resend.com";

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc: string[] | null;
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
  message_id: string;
  created_at: string;
  reply_to: string[] | null;
}

export interface ReceivedAttachment {
  id: string;
  filename?: string;
  size: number;
  content_type: string;
  content_disposition?: "inline" | "attachment";
  content_id?: string;
  download_url: string;
  expires_at: string;
}

export class ResendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function resendFetch<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${RESEND_API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    // Resend error bodies are {name, message}; never include request content.
    const body = await response.json().catch(() => ({}));
    throw new ResendError(response.status, `resend_${response.status}_${String(body?.name || "error")}`);
  }
  return await response.json() as T;
}

export function getReceivedEmail(apiKey: string, emailId: string): Promise<ReceivedEmail> {
  return resendFetch<ReceivedEmail>(apiKey, `/emails/receiving/${encodeURIComponent(emailId)}`);
}

export async function listReceivedAttachments(apiKey: string, emailId: string): Promise<ReceivedAttachment[]> {
  const result = await resendFetch<{ data?: ReceivedAttachment[] }>(
    apiKey,
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
  );
  return Array.isArray(result?.data) ? result.data : [];
}

export interface OutgoingAttachment {
  filename: string;
  content: string; // base64
  content_type?: string;
}

export interface OutgoingEmail {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  headers?: Record<string, string>;
  attachments?: OutgoingAttachment[];
}

export function sendResendEmail(
  apiKey: string,
  email: OutgoingEmail,
  idempotencyKey?: string,
): Promise<{ id: string }> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return resendFetch<{ id: string }>(apiKey, "/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(email),
  });
}

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MailboxActionError } from "@/hooks/use-hosted-mailbox";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Reply to a message received on the hosted address, sent from that address. */
export function ReplyComposer({
  recipient,
  fromAddress,
  onSend,
  onClose,
}: {
  recipient: string;
  fromAddress: string;
  onSend: (body: string, clientRequestId: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const ids = useId();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per draft: a retry after a network blip can't send twice.
  const requestId = useRef(newRequestId());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      setError("Write a reply before sending.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(body, requestId.current);
      toast({ title: "Reply sent", description: `Sent to ${recipient} from ${fromAddress}.` });
      requestId.current = newRequestId();
      setBody("");
      onClose();
    } catch (sendError) {
      setError(sendError instanceof MailboxActionError ? sendError.message : "The reply wasn't sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 border-t border-rp-rule pt-3" noValidate>
      <label htmlFor={`${ids}-body`} className="text-xs text-rp-ink-2">
        Reply to <span className="break-all font-medium text-rp-ink">{recipient}</span>, from {fromAddress}
      </label>
      <Textarea
        ref={textareaRef}
        id={`${ids}-body`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !sending) onClose();
        }}
        rows={5}
        className="mt-1.5"
        aria-invalid={Boolean(error)}
        aria-describedby={`${ids}-error`}
        disabled={sending}
      />
      <p id={`${ids}-error`} role="alert" className="mt-1 min-h-[1rem] text-xs text-destructive">{error}</p>
      <div className="mt-1 flex gap-2">
        <Button type="submit" size="sm" disabled={sending} className="min-w-[92px]">
          {sending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label="Sending" />
            : <><Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />Send</>}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
      </div>
    </form>
  );
}

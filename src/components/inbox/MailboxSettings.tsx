import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { AtSign, Check, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { type HostedMailboxController, MailboxActionError } from "@/hooks/use-hosted-mailbox";
import { cn } from "@/lib/utils";

function messageFor(error: unknown): string {
  return error instanceof MailboxActionError ? error.message : "That didn't work. Try again in a moment.";
}

/** Copy button with a fixed footprint so the label swap never shifts layout. */
export function CopyAddressButton({ address, className }: { address: string; className?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy the address", description: "Select it and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      className={cn("w-[84px] justify-center", className)}
      aria-label={copied ? "Address copied" : `Copy ${address}`}
    >
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

/** Shown on the inbox when the user has no hosted address yet. */
export function GetAddressCard({ controller }: { controller: HostedMailboxController }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const mailbox = await controller.provision();
      toast({ title: "Your application address is ready", description: mailbox.address });
    } catch (error) {
      toast({ title: "Address wasn't created", description: messageFor(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex gap-3">
        <AtSign className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Get your application address</h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Applications go out with this address, and replies are stored here and forwarded to your email.
          </p>
          <Button className="mt-4 min-w-[156px]" size="sm" onClick={create} disabled={busy}>
            {busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />Creating…</> : "Get my address"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

type ForwardStep = "idle" | "editing" | "code";

/** Address, forwarding target (with code verification) and the on/off switch. */
export function MailboxSettings({ controller }: { controller: HostedMailboxController }) {
  const { toast } = useToast();
  const { mailbox } = controller;
  const ids = useId();
  const [step, setStep] = useState<ForwardStep>("idle");
  const [draft, setDraft] = useState("");
  const [pendingTarget, setPendingTarget] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "editing") emailRef.current?.focus();
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  if (!mailbox) return null;

  function startEditing() {
    setDraft("");
    setCode("");
    setFieldError(null);
    setStep("editing");
  }

  function cancel() {
    setStep("idle");
    setFieldError(null);
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    const target = draft.trim();
    if (!target) {
      setFieldError("Enter the email address to forward to.");
      return;
    }
    setBusy(true);
    setFieldError(null);
    try {
      const pending = await controller.requestForwardChange(target);
      if (!pending) {
        setStep("idle");
        toast({ title: "Mail already goes to that address" });
        return;
      }
      setPendingTarget(pending.forward_to);
      setCode("");
      setStep("code");
    } catch (error) {
      setFieldError(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFieldError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setFieldError(null);
    try {
      await controller.confirmForwardChange(pendingTarget, code);
      setStep("idle");
      toast({ title: "Forwarding address updated", description: `New mail goes to ${pendingTarget}.` });
    } catch (error) {
      setFieldError(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleForwarding(enabled: boolean) {
    setToggling(true);
    try {
      await controller.setForwarding(enabled);
    } catch (error) {
      toast({ title: "Forwarding wasn't changed", description: messageFor(error), variant: "destructive" });
    } finally {
      setToggling(false);
    }
  }

  const canForward = Boolean(mailbox.forward_to && mailbox.forward_verified);
  const errorId = `${ids}-error`;

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${ids}-address`}>
        <h3 id={`${ids}-address`} className="text-sm font-semibold text-rp-ink">Your application address</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-all text-[15px] font-medium text-rp-ink">{mailbox.address}</p>
          <CopyAddressButton address={mailbox.address} />
        </div>
        <p className="mt-1.5 text-xs text-rp-ink-2">Applications go out with this address.</p>
      </section>

      <section aria-labelledby={`${ids}-forward`} className="border-t border-rp-rule pt-5">
        <h3 id={`${ids}-forward`} className="text-sm font-semibold text-rp-ink">Forwarded to</h3>

        {step === "idle" && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-all text-sm text-rp-ink">
              {mailbox.forward_to && mailbox.forward_verified ? mailbox.forward_to : "No forwarding address yet"}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
              {mailbox.forward_to ? "Change" : "Add address"}
            </Button>
          </div>
        )}

        {step === "editing" && (
          <form className="mt-2 space-y-2" onSubmit={sendCode} noValidate>
            <label htmlFor={`${ids}-email`} className="text-xs text-rp-ink-2">New forwarding address</label>
            <Input
              ref={emailRef}
              id={`${ids}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? errorId : undefined}
              placeholder="you@example.com"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy} className="min-w-[104px]">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label="Sending code" /> : "Send code"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
            </div>
            <p className="text-xs text-rp-ink-2">We'll email a 6-digit code to confirm the address is yours.</p>
          </form>
        )}

        {step === "code" && (
          <form className="mt-2 space-y-2" onSubmit={verify} noValidate>
            <label htmlFor={`${ids}-code`} className="text-xs text-rp-ink-2">
              Code sent to <span className="break-all font-medium text-rp-ink">{pendingTarget}</span>
            </label>
            <Input
              ref={codeRef}
              id={`${ids}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? errorId : undefined}
              className="w-40 tracking-[0.3em] tabular-nums"
              placeholder="000000"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy} className="min-w-[104px]">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label="Verifying" /> : "Verify"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={startEditing} disabled={busy}>Use a different address</Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
            </div>
            <p className="text-xs text-rp-ink-2">The code expires in 10 minutes. Mail keeps going to your current address until you verify.</p>
          </form>
        )}

        {/* Reserved line so an error appearing never pushes content around. */}
        <p id={errorId} role="alert" className="mt-1 min-h-[1rem] text-xs text-destructive">{fieldError}</p>
      </section>

      <section className="border-t border-rp-rule pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor={`${ids}-switch`} className="cursor-pointer text-sm font-semibold text-rp-ink">Forward new mail</label>
            <p className="mt-1 text-xs text-rp-ink-2">
              {canForward
                ? "Copies of new messages go to your forwarding address. Replies go straight to the sender."
                : "Verify a forwarding address to turn this on. Mail is still saved in your inbox."}
            </p>
          </div>
          <Switch
            id={`${ids}-switch`}
            checked={mailbox.forwarding_enabled && canForward}
            onCheckedChange={toggleForwarding}
            disabled={toggling || !canForward}
          />
        </div>
      </section>
    </div>
  );
}

/** Settings sheet: bottom sheet on phones, side sheet on larger screens. */
export function MailboxSettingsSheet({
  controller,
  open,
  onOpenChange,
}: {
  controller: HostedMailboxController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "overflow-y-auto motion-reduce:transition-none motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none",
          isMobile ? "max-h-[88vh] rounded-t-xl" : "w-full sm:max-w-md",
        )}
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>Application address</SheetTitle>
          <SheetDescription>Where employers reach you, and where we forward their mail.</SheetDescription>
        </SheetHeader>
        <MailboxSettings controller={controller} />
      </SheetContent>
    </Sheet>
  );
}

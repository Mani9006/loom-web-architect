# Hosted application mailbox

Every user can get their own application address, for example
`manikanta3@<MAILBOX_DOMAIN>`. The Agent puts this address on job applications
instead of the user's login email. Mail sent to it is:

1. stored and classified in the in-app inbox (`mc_inbound_emails`, `source = 'hosted'`),
   through the same classifier, verification-code screening and job linking as Gmail
   (`supabase/functions/_shared/inbound-email.ts`), and
2. forwarded to the user's verified personal address, with `Reply-To` set to the original
   sender so a reply from Gmail goes straight to the recruiter.

Users can also reply from the inbox. Replies are sent from their hosted address, only to
people who have already emailed that address, with a limit of 30 a day.

The feature does nothing until it is configured. Until all four secrets below are set, the
four edge functions answer `503`. Until the migration is applied, the UI stays hidden.

## Pieces

| Piece | Purpose |
| --- | --- |
| `supabase/migrations/20261001120000_hosted_application_mailbox.sql` | `user_mailboxes`, `mailbox_outbound`, `mc_inbound_emails.source`, private forwarding codes, guard trigger |
| `mailbox-provision` (JWT) | Creates the caller's address from their first name |
| `mailbox-settings` (JWT) | Forwarding on/off, change and verify the forwarding address |
| `inbound-email-webhook` (no JWT, Svix-signed) | Receives Resend `email.received`, stores, classifies, forwards |
| `mailbox-send` (JWT) | Replies from the in-app inbox |
| `career-ops-submit` | Uses the hosted address first, then Gmail, then the profile email |

## Owner setup

### 1. Choose a separate domain for user addresses

Use a domain that is not the main product domain, for example `rp-apply.com` (Tsenta uses
`my-privatemail.com`). Inbound mail volume, recruiter spam and any abuse then cannot hurt the
sender reputation of the main domain that sends sign-in and product email.

This domain becomes `MAILBOX_DOMAIN`.

### 2. Add it to Resend as a receiving domain

In Resend, add the domain and enable receiving. Add the MX record Resend shows. If the domain
already has MX records, give Resend's record the lowest priority number (highest preference) so
it receives the mail; a dedicated domain normally has no other MX records.

Because `mailbox-send` sends replies **from** `name@MAILBOX_DOMAIN`, also verify the same domain
for sending in Resend (SPF and DKIM records, plus a DMARC record such as
`v=DMARC1; p=quarantine; rua=mailto:dmarc@<main-domain>`). Without it, inbound and forwarding
still work, but replies from the inbox fail.

### 3. Verify a sending domain for forwards

Forwards and forwarding-verification codes are sent from `MAILBOX_FORWARD_FROM`, for example
`inbox@mail.<main-domain>`. Verify that subdomain for sending in Resend with SPF, DKIM and
DMARC. Using a subdomain keeps forwarded recruiter mail apart from product mail.

Loop guards: mail from `MAILBOX_DOMAIN`, from the `MAILBOX_FORWARD_FROM` domain, or carrying
the `X-ResumePreps-Forwarded` header is stored but never forwarded. Every forward adds that header.

### 4. Create the webhook

In Resend, create a webhook for the `email.received` event pointing at:

```
https://<project-ref>.supabase.co/functions/v1/inbound-email-webhook
```

Copy its signing secret (it starts with `whsec_`).

`supabase/config.toml` already sets `verify_jwt = false` for this function; the handler
checks the Svix signature itself and rejects anything older than five minutes.

### 5. Set the secrets

```bash
supabase secrets set \
  MAILBOX_DOMAIN=rp-apply.com \
  MAILBOX_FORWARD_FROM=inbox@mail.<main-domain> \
  RESEND_API_KEY=re_xxx \
  RESEND_WEBHOOK_SECRET=whsec_xxx
```

`RESEND_API_KEY` may already be set for `send-email`; the key needs permission to send and
to read received email.

### 6. Apply the migration

```bash
supabase db push
```

The migration only adds objects. It is safe to run more than once.

### 7. Deploy the functions

```bash
supabase functions deploy mailbox-provision
supabase functions deploy mailbox-settings
supabase functions deploy mailbox-send
supabase functions deploy inbound-email-webhook --no-verify-jwt
supabase functions deploy mc-gmail-poll       # now imports _shared/inbound-email.ts
supabase functions deploy career-ops-submit   # hosted address priority
```

## Test checklist

- [ ] Inbox shows "Get your application address". Clicking "Get my address" shows an address
      based on your first name, with a copy button under the page title.
- [ ] A second account with the same first name gets the same name with `2` appended.
- [ ] Send an email from an outside account to the address. Within seconds it appears in the
      inbox, classified, and a copy arrives at your login email from
      `"<Sender> via ResumePreps" <MAILBOX_FORWARD_FROM>`.
- [ ] Reply to that copy in Gmail. The reply goes to the original sender, not to ResumePreps.
- [ ] Send to `yourname+test@MAILBOX_DOMAIN`. It lands in the same inbox.
- [ ] Send a message containing "Your verification code is 482913" from a Greenhouse-style
      sender. The inbox shows the code and the stored preview shows `[verification code]`.
- [ ] Send with a 2 MB attachment (forwarded with the attachment) and with 12 MB of attachments
      (forwarded without them, with a note at the top).
- [ ] Settings: change "Forwarded to" to another address. A 6-digit code arrives there, mail keeps
      going to the old address until you verify, five wrong codes discard the code, and an address
      on `MAILBOX_DOMAIN` is refused.
- [ ] Turn forwarding off. New mail still appears in the inbox but is not forwarded.
- [ ] Open a hosted message, choose Reply, send. The recipient sees it from your hosted address
      and it threads with the original. Replying to an address that never wrote to you is refused.
- [ ] Resend the same webhook from the Resend dashboard. No duplicate row or duplicate forward.
- [ ] Send to an unknown `nobody@MAILBOX_DOMAIN`. The webhook answers 200 and nothing is stored.
- [ ] Queue an Agent application. The submitted email is the hosted address.

## Operations

- Resend stores received mail even when the webhook is down or failing. Deliveries are retried
  on non-2xx responses, and you can replay events from the webhook's page in the Resend
  dashboard. Processing is idempotent (`message_id = 'resend:' + email_id`, forwards use
  `Idempotency-Key: fwd-<email_id>`), so replays are safe.
- The webhook returns `502` when the body cannot be fetched or a forward fails for a retryable
  reason (rate limit, Resend 5xx, network), so Resend retries. Permanent `4xx` forward errors
  are logged and not retried.
- Logs contain ids and status codes only, never bodies, subjects, addresses or verification codes.
- To pause an address, set `user_mailboxes.status = 'paused'`. Mail to it is then ignored with
  `200`, and the Agent falls back to Gmail or the profile email.

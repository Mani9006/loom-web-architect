// Stripe Webhook - Handles subscription lifecycle events
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Email helper ─────────────────────────────────────────────────────
async function sendEmailNotification(
  supabaseUrl: string,
  serviceKey: string,
  type: string,
  to: string,
  data: Record<string, string | undefined>,
) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ type, to, data }),
    });
    if (!res.ok) console.error(`Email send failed (${type}):`, await res.text());
    else console.log(`[StripeWebhook] Sent ${type} email to ${to}`);
  } catch (err) {
    console.error(`Email send error (${type}):`, err);
  }
}

async function getUserEmail(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

// ── Stripe signature verification ───────────────────────────────────────
// Without this, anyone who finds this endpoint's URL can POST a hand-crafted
// "checkout.session.completed" event with an arbitrary user_id in metadata
// and grant that account a free Premium subscription (or fake a
// subscription.deleted to downgrade someone else). Verifying the
// `stripe-signature` header against STRIPE_WEBHOOK_SECRET is what proves the
// event actually came from Stripe.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!sigHeader) return false;

  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k] = v;
  }
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const timestampNum = Number(timestamp);
  if (!Number.isFinite(timestampNum)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNum) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expectedHex, v1);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[StripeWebhook] STRIPE_WEBHOOK_SECRET is not configured — refusing to process");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await verifyStripeSignature(body, sig, webhookSecret))) {
      console.error("[StripeWebhook] Signature verification failed — rejecting request");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log(`[StripeWebhook] Event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const planType = session.metadata?.plan_type || "premium";

        if (userId) {
          await supabase.from("subscription_plans").upsert({
            user_id: userId,
            plan_type: planType,
            status: "active",
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

          await supabase.from("user_access_controls").upsert({
            user_id: userId,
            purchase_state: "active",
            subscription_plan: planType,
            ai_features_enabled: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

          console.log(`[StripeWebhook] Activated ${planType} for ${userId}`);

          // Send subscription confirmation email
          const email = session.customer_email || await getUserEmail(supabase, userId);
          if (email) {
            const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
            void sendEmailNotification(supabaseUrl, serviceKey, "subscription", email, {
              plan_name: planType === "premium" ? "Premium ($120/mo)" : planType,
              status: "active",
              period_end: periodEnd,
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const { data: plans } = await supabase
          .from("subscription_plans")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (plans) {
          await supabase.from("subscription_plans").update({
            status: subscription.status === "active" ? "active" : subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", subscription.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const { data: plans } = await supabase
          .from("subscription_plans")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (plans) {
          await supabase.from("subscription_plans").update({
            plan_type: "free",
            status: "canceled",
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", subscription.id);

          await supabase.from("user_access_controls").update({
            purchase_state: "canceled",
            subscription_plan: "free",
            ai_features_enabled: false,
            updated_at: new Date().toISOString(),
          }).eq("user_id", plans.user_id);

          console.log(`[StripeWebhook] Canceled subscription for ${plans.user_id}`);

          // Send cancellation email
          const cancelEmail = await getUserEmail(supabase, plans.user_id);
          if (cancelEmail) {
            void sendEmailNotification(supabaseUrl, serviceKey, "subscription", cancelEmail, {
              plan_name: "Free",
              status: "canceled",
            });
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const customerEmail = invoice.customer_email;
        if (customerEmail && invoice.amount_paid > 0) {
          const amount = `$${(invoice.amount_paid / 100).toFixed(2)}`;
          const invoiceDate = new Date(invoice.created * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          void sendEmailNotification(supabaseUrl, serviceKey, "billing-receipt", customerEmail, {
            amount,
            plan_name: "Premium",
            invoice_date: invoiceDate,
            invoice_url: invoice.hosted_invoice_url,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabase.from("subscription_plans").update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", invoice.subscription);

          // Send payment failed notification
          if (invoice.customer_email) {
            void sendEmailNotification(supabaseUrl, serviceKey, "account-change", invoice.customer_email, {
              change_type: "Payment Failed",
              details: "Your latest payment failed. Please update your payment method to keep your Premium subscription active.",
            });
          }
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

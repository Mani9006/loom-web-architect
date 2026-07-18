// Stripe Webhook - Handles subscription lifecycle events
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro ($39/mo)",
  autopilot: "Autopilot ($99/mo)",
  premium: "Legacy Premium",
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    // For now, parse the event directly (in production, verify signature)
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
              plan_name: PLAN_LABELS[planType] || planType,
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

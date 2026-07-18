// Create Checkout - Creates Stripe Checkout Session for premium subscription
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_CATALOG = {
  pro: {
    name: "ResumePreps Pro",
    description: "30 tailored application packets and 100 fit evaluations per month",
    amount: "3900",
  },
  autopilot: {
    name: "ResumePreps Autopilot",
    description: "100 supported-portal submissions with review and status receipts per month",
    amount: "9900",
  },
} as const;

type CheckoutPlan = keyof typeof PLAN_CATALOG;

function checkoutReturnOrigin(req: Request): string {
  const fallback = Deno.env.get("APP_URL") || "https://resumepreps.com";
  const requested = req.headers.get("origin");
  try {
    if (requested) {
      const url = new URL(requested);
      const host = url.hostname.toLocaleLowerCase();
      const trusted = host === "resumepreps.com" ||
        host === "www.resumepreps.com" ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        (host.startsWith("loom-web-architect-") && host.endsWith(".vercel.app"));
      if (trusted && ["https:", "http:"].includes(url.protocol)) return url.origin;
    }
    return new URL(fallback).origin;
  } catch {
    return "https://resumepreps.com";
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { planType: requestedPlan } = await req.json();
    if (typeof requestedPlan !== "string" || !(requestedPlan in PLAN_CATALOG)) {
      return new Response(JSON.stringify({ error: "Unknown subscription plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const planType = requestedPlan as CheckoutPlan;
    const plan = PLAN_CATALOG[planType];

    // Check for Stripe key
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeKey) {
      // Test grants must be explicitly enabled. A missing billing secret must
      // never turn into a free paid entitlement in production.
      if (Deno.env.get("ALLOW_TEST_SUBSCRIPTIONS") !== "true") {
        return new Response(JSON.stringify({ error: "Billing is not configured for this environment" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(supabaseUrl, serviceKey);

      await adminClient.from("subscription_plans").upsert({
        user_id: user.id,
        plan_type: planType,
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Update user_access_controls
      await adminClient.from("user_access_controls").upsert({
        user_id: user.id,
        purchase_state: "active",
        subscription_plan: planType,
        ai_features_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription activated for this test workspace",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stripe is configured - create real checkout session
    const returnOrigin = checkoutReturnOrigin(req);
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "subscription",
        "customer_email": user.email || "",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": plan.name,
        "line_items[0][price_data][product_data][description]": plan.description,
        "line_items[0][price_data][unit_amount]": plan.amount,
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][quantity]": "1",
        "success_url": `${returnOrigin}/job-search?checkout=success`,
        "cancel_url": `${returnOrigin}/pricing?checkout=canceled`,
        "metadata[user_id]": user.id,
        "metadata[plan_type]": planType,
      }),
    });

    if (!stripeResponse.ok) {
      const err = await stripeResponse.json();
      console.error("Stripe error:", err);
      return new Response(JSON.stringify({ error: "Failed to create checkout session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripeResponse.json();
    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: "Checkout is temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

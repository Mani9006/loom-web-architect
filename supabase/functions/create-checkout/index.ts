// Create Checkout - Creates Stripe Checkout Session for premium subscription
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { planType } = await req.json();

    // Check for Stripe key
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    // Test-mode bypass (grants a subscription without payment) must be
    // explicitly opted into. Previously this triggered whenever
    // STRIPE_SECRET_KEY was merely unset — including by accident in a
    // misconfigured production deploy — silently handing out free Premium
    // to anyone who hit "Upgrade".
    const allowTestCheckout = Deno.env.get("ALLOW_TEST_CHECKOUT") === "true";

    if (!stripeKey) {
      if (!allowTestCheckout) {
        console.error("[create-checkout] STRIPE_SECRET_KEY is not configured and ALLOW_TEST_CHECKOUT is not set — refusing to grant a subscription");
        return new Response(
          JSON.stringify({ error: "Checkout is not available right now. Please try again later." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // No Stripe configured, and test mode explicitly enabled — create
      // subscription record directly for local/staging testing.
      const adminClient = createClient(supabaseUrl, serviceKey);

      await adminClient.from("subscription_plans").upsert({
        user_id: user.id,
        plan_type: planType || "premium",
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Update user_access_controls
      await adminClient.from("user_access_controls").upsert({
        user_id: user.id,
        purchase_state: "active",
        subscription_plan: planType || "premium",
        ai_features_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription activated (Stripe not configured - test mode)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stripe is configured - create real checkout session
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
        "line_items[0][price_data][product_data][name]": "ResumePreps Premium",
        "line_items[0][price_data][product_data][description]": "AI-powered auto-apply, unlimited matches, priority support",
        "line_items[0][price_data][unit_amount]": "12000", // $120
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][quantity]": "1",
        "success_url": `${req.headers.get("origin") || "https://resumepreps.com"}/job-search?checkout=success`,
        "cancel_url": `${req.headers.get("origin") || "https://resumepreps.com"}/pricing?checkout=canceled`,
        "metadata[user_id]": user.id,
        "metadata[plan_type]": planType || "premium",
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
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

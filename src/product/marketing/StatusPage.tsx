import { useQuery } from "@tanstack/react-query";
import { MarketingLayout } from "./MarketingLayout";
import { supabase } from "@/integrations/supabase/client";

export default function StatusPage() {
  const health = useQuery({
    queryKey: ["public-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("platform-health");
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[720px] px-5 py-16 3xl:py-20">
        <p className="rp-kicker">Status</p>
        <h1 className="mt-3 font-display text-display-md">System status</h1>
        <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
          Public heartbeat for Supabase, Stripe configuration, mail, and the apply worker.
        </p>
        <div className="rp-panel-flush mt-10">
          <dl>
            {["supabase", "stripe", "email", "worker", "incidents_1h", "last_heartbeat"].map((key, index) => (
              <div key={key} className={`flex items-baseline justify-between px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}>
                <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                <dd className="font-mono text-[13px]">{String(health.data?.[key] ?? (health.isError ? "unavailable" : "…"))}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
    </MarketingLayout>
  );
}

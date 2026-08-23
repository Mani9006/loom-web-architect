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
      <main className="mx-auto max-w-3xl px-5 py-20">
        <p className="text-caption text-primary">Status</p>
        <h1 className="mt-4 font-display text-5xl">System status</h1>
        <p className="mt-5 text-body text-muted-foreground">
          Public heartbeat for Supabase, Stripe configuration, mail, and the apply worker.
        </p>
        <dl className="mt-12 divide-y divide-border border-y border-border">
          {["supabase", "stripe", "email", "worker", "incidents_1h", "last_heartbeat"].map((key) => (
            <div key={key} className="flex items-baseline justify-between py-5">
              <dt className="text-caption text-muted-foreground">{key.replace(/_/g, " ")}</dt>
              <dd className="font-display text-xl">{String(health.data?.[key] ?? (health.isError ? "unavailable" : "…"))}</dd>
            </div>
          ))}
        </dl>
      </main>
    </MarketingLayout>
  );
}

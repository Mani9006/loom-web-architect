import { useQuery } from "@tanstack/react-query";
import { MarketingLayout } from "./MarketingLayout";
import { DeskPreview } from "./DeskPreview";
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
      <main className="mx-auto grid max-w-[1440px] gap-4 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] 3xl:max-w-[1520px]">
        <div>
          <p className="rp-kicker">Status</p>
          <h1 className="mt-2 font-display text-display-md">System status</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted-foreground">
            Public heartbeat for Supabase, Stripe configuration, mail, and the apply worker.
          </p>
          <div className="rp-panel-flush mt-6">
            <dl>
              {["supabase", "stripe", "email", "worker", "incidents_1h", "last_heartbeat"].map((key, index) => (
                <div key={key} className={`flex items-baseline justify-between px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}>
                  <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                  <dd className="font-mono text-[13px]">{String(health.data?.[key] ?? (health.isError ? "unavailable" : "…"))}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <DeskPreview variant="receipt" />
          <div className="rp-well p-4">
            <p className="text-[12px] font-medium">Submitted still requires a worker receipt.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              A green worker heartbeat does not mark packets submitted. Only Greenhouse, Lever, Ashby, or Workable receipts do.
            </p>
          </div>
        </aside>
      </main>
    </MarketingLayout>
  );
}

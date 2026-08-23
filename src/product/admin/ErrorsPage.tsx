import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps } from "@/product/lib/company-ops";

export default function ErrorsPage() {
  const { data } = useQuery({
    queryKey: ["ops-incidents"],
    queryFn: async () => {
      const { data, error } = await companyOps<{ incidents: Array<Record<string, unknown>> }>("list_incidents");
      if (error) throw error;
      return data?.incidents || [];
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader kicker="Errors" title="First-party incident inbox" subtitle="Sourced from app_incidents. No Datadog required. SENTRY_DSN is optional." />
      <div className="divide-y divide-border border-y border-border">
        {(data || []).map((row) => (
          <article key={String(row.id)} className="py-4">
            <p className="text-caption text-primary">{String(row.severity || "error")} · {String(row.environment || "")}</p>
            <h2 className="mt-2 font-display text-xl">{String(row.message || "Incident")}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{String(row.route || "/")} · {String(row.last_seen_at || row.created_at || "")}</p>
          </article>
        ))}
        {(data || []).length === 0 && <p className="py-8 text-body text-muted-foreground">No incidents in the inbox.</p>}
      </div>
    </div>
  );
}

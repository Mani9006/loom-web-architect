import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps } from "@/product/lib/company-ops";
import { EmptyState } from "@/product/components/EmptyState";
import { Panel } from "@/product/ui/Panel";

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
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader kicker="Errors" title="First-party incident inbox" subtitle="Sourced from app_incidents. No Datadog required. SENTRY_DSN is optional." />
      <Panel flush>
        {(data || []).length === 0 ? (
          <div className="p-4"><EmptyState title="No incidents" body="The first-party inbox is empty." /></div>
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>Route</th>
                  <th>Seen</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map((row) => (
                  <tr key={String(row.id)}>
                    <td className="uppercase tracking-[0.08em] text-primary">{String(row.severity || "error")}</td>
                    <td className="font-medium">{String(row.message || "Incident")}</td>
                    <td className="text-muted-foreground">{String(row.route || "/")}</td>
                    <td className="text-muted-foreground">{String(row.last_seen_at || row.created_at || "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

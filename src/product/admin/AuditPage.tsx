import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps } from "@/product/lib/company-ops";
import { EmptyState } from "@/product/components/EmptyState";
import { Panel } from "@/product/ui/Panel";

export default function AuditPage() {
  const { data } = useQuery({
    queryKey: ["ops-audit"],
    queryFn: async () => {
      const { data, error } = await companyOps<{ entries: Array<Record<string, unknown>> }>("list_audit");
      if (error) throw error;
      return data?.entries || [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Audit" title="Privileged actions" subtitle="Every invite, credit grant, impersonation, replay, and flag write stores the actor user id." />
      <Panel flush>
        {(data || []).length === 0 ? (
          <div className="p-4"><EmptyState title="No audit entries" body="Privileged actions will land here with the actor user id." /></div>
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map((row) => (
                  <tr key={String(row.id)}>
                    <td className="text-muted-foreground">{String(row.created_at || "")}</td>
                    <td className="font-mono text-[12px]">{String(row.actor_id || "").slice(0, 8)}</td>
                    <td>{String(row.action || "")}</td>
                    <td className="text-muted-foreground">{String(row.resource || "")} {String(row.resource_id || "").slice(0, 8)}</td>
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

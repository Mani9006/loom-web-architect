import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps } from "@/product/lib/company-ops";

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
    <div className="space-y-8">
      <PageHeader kicker="Audit" title="Privileged actions" subtitle="Every invite, credit grant, impersonation, replay, and flag write stores the actor user id." />
      <table className="w-full text-left text-[13px]">
        <thead className="text-caption text-muted-foreground">
          <tr>
            <th className="py-2">When</th>
            <th className="py-2">Actor</th>
            <th className="py-2">Action</th>
            <th className="py-2">Resource</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((row) => (
            <tr key={String(row.id)} className="border-t border-border">
              <td className="py-3 text-muted-foreground">{String(row.created_at || "")}</td>
              <td className="py-3 font-mono text-[12px]">{String(row.actor_id || "").slice(0, 8)}</td>
              <td className="py-3">{String(row.action || "")}</td>
              <td className="py-3 text-muted-foreground">{String(row.resource || "")} {String(row.resource_id || "").slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

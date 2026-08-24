import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import { PERMISSION_LABELS } from "@/lib/operator-roles";
import { Panel } from "@/product/ui/Panel";

export default function AdminHome() {
  const session = useOutletContext<OperatorSession>();
  const health = useQuery({
    queryKey: ["ops-health"],
    queryFn: async () => {
      const { data, error } = await companyOps<{
        worker: string;
        stripe: string;
        incidents_1h: number;
        global_auto_apply: boolean;
      }>("health");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Company"
        title="ResumePreps operations"
        subtitle={`${session.org.used_seats} of ${session.org.seat_limit} seats. ${session.member.email} is ${session.member.role}.`}
      />
      <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-3">
        {[
          ["Worker", health.data?.worker || "…"],
          ["Stripe", health.data?.stripe || "…"],
          ["Incidents / 1h", String(health.data?.incidents_1h ?? "…")],
        ].map(([label, value], index) => (
          <div key={label} className={`bg-card p-5 ${index > 0 ? "border-t border-border md:border-l md:border-t-0" : ""}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-[22px] font-semibold capitalize tracking-tight">{value}</p>
          </div>
        ))}
      </section>
      <Panel title="Your permissions">
        <ul className="flex flex-wrap gap-2 p-4">
          {session.permissions.map((perm) => (
            <li key={perm} className="rounded-md border border-border px-2.5 py-1 text-[12px]">
              {PERMISSION_LABELS[perm]}
            </li>
          ))}
        </ul>
      </Panel>
      <div className="flex gap-2">
        <Link to="/admin/team" className="rp-btn rp-btn-primary no-underline">
          Manage team
        </Link>
        <Link to="/admin/users" className="rp-btn rp-btn-outline no-underline">
          Look up a user
        </Link>
      </div>
    </div>
  );
}

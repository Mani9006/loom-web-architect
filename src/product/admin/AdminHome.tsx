import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import { PERMISSION_LABELS } from "@/lib/operator-roles";

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
    <div className="space-y-10">
      <PageHeader
        kicker="Company"
        title="ResumePreps operations"
        subtitle={`${session.org.used_seats} of ${session.org.seat_limit} seats. ${session.member.email} is ${session.member.role}.`}
      />
      <section className="grid gap-px bg-border md:grid-cols-3">
        {[
          ["Worker", health.data?.worker || "…"],
          ["Stripe", health.data?.stripe || "…"],
          ["Incidents / 1h", String(health.data?.incidents_1h ?? "…")],
        ].map(([label, value]) => (
          <div key={label} className="bg-background p-6">
            <p className="text-caption text-muted-foreground">{label}</p>
            <p className="mt-3 font-display text-3xl capitalize">{value}</p>
          </div>
        ))}
      </section>
      <section>
        <p className="text-caption text-primary">Your permissions</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {session.permissions.map((perm) => (
            <li key={perm} className="border border-border px-3 py-1 text-caption">
              {PERMISSION_LABELS[perm]}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex gap-4">
        <Link to="/admin/team" className="bg-primary px-4 py-2 text-caption text-primary-foreground no-underline">
          Manage team
        </Link>
        <Link to="/admin/users" className="border border-border px-4 py-2 text-caption no-underline">
          Look up a user
        </Link>
      </div>
    </div>
  );
}

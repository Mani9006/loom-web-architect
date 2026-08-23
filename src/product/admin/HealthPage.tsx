import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import { can } from "@/lib/operator-roles";

export default function HealthPage() {
  const session = useOutletContext<OperatorSession>();
  const health = useQuery({
    queryKey: ["ops-health-detail"],
    queryFn: async () => {
      const { data, error } = await companyOps<Record<string, unknown>>("health");
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-8">
      <PageHeader kicker="Health" title="Worker, Stripe, mail, incidents" />
      <dl className="grid gap-6 md:grid-cols-2">
        {["supabase", "stripe", "email", "worker", "incidents_1h", "last_heartbeat", "global_auto_apply"].map((key) => (
          <div key={key}>
            <dt className="text-caption text-muted-foreground">{key.replace(/_/g, " ")}</dt>
            <dd className="mt-2 font-display text-2xl">{String(health.data?.[key] ?? "…")}</dd>
          </div>
        ))}
      </dl>
      {can(session.member.role, "feature_flags") && (
        <button
          type="button"
          className="border border-border px-4 py-2 text-caption"
          onClick={() => {
            const enabled = !health.data?.global_auto_apply;
            void companyOps("set_kill_switch", { enabled }).then(({ error }) => {
              if (error) toast.error(error.message);
              else {
                toast.success(enabled ? "Hands-off globally on" : "Hands-off globally off");
                void health.refetch();
              }
            });
          }}
        >
          Toggle global auto-apply
        </button>
      )}
      <section>
        <h2 className="font-display text-2xl">Failed apply tasks</h2>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {((health.data?.failed_tasks as Array<Record<string, unknown>>) || []).map((task) => (
            <li key={String(task.id)} className="flex items-center justify-between py-3 text-[13px]">
              <span className="font-mono">{String(task.id).slice(0, 8)} · {String(task.error_message || "failed")}</span>
              {can(session.member.role, "worker_replay") && (
                <button
                  type="button"
                  className="text-caption text-primary"
                  onClick={() => {
                    void companyOps("replay_task", { taskId: task.id }).then(({ error }) => {
                      if (error) toast.error(error.message);
                      else {
                        toast.success("Requeued. Submitted still requires a receipt.");
                        void health.refetch();
                      }
                    });
                  }}
                >
                  Replay
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

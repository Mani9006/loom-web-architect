import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import { can } from "@/lib/operator-roles";
import { Panel } from "@/product/ui/Panel";
import { EmptyState } from "@/product/components/EmptyState";

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

  const failed = ((health.data?.failed_tasks as Array<Record<string, unknown>>) || []);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Health" title="Worker, Stripe, mail, incidents" />
      <dl className="grid overflow-hidden rounded-lg border border-border sm:grid-cols-2 lg:grid-cols-4">
        {["supabase", "stripe", "email", "worker", "incidents_1h", "last_heartbeat", "global_auto_apply"].map((key, index) => (
          <div key={key} className={`bg-card p-4 ${index > 0 ? "border-t border-border sm:border-l" : ""}`}>
            <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{key.replace(/_/g, " ")}</dt>
            <dd className="mt-2 text-[18px] font-semibold tracking-tight">{String(health.data?.[key] ?? "…")}</dd>
          </div>
        ))}
      </dl>
      {can(session.member.role, "feature_flags") && (
        <button
          type="button"
          className="rp-btn rp-btn-outline"
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
      <Panel title="Failed apply tasks">
        {failed.length === 0 ? (
          <div className="p-4"><EmptyState title="No failed tasks" body="Replays still require a worker receipt before Submitted." /></div>
        ) : (
          <ul>
            {failed.map((task) => (
              <li key={String(task.id)} className="rp-row text-[13px]">
                <span className="font-mono">{String(task.id).slice(0, 8)} · {String(task.error_message || "failed")}</span>
                {can(session.member.role, "worker_replay") && (
                  <button
                    type="button"
                    className="rp-btn rp-btn-ghost rp-btn-sm"
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
        )}
      </Panel>
    </div>
  );
}

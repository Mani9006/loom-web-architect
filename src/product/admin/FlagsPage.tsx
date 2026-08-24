import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { FLAG_SPECS, useFlagsStore, useResolvedFlag, type FlagName } from "@/lib/feature-flags";
import { getEnv } from "@/lib/env";
import type { OperatorSession } from "@/product/lib/company-ops";
import { can } from "@/lib/operator-roles";
import { Panel } from "@/product/ui/Panel";

export default function FlagsPage() {
  const session = useOutletContext<OperatorSession>();
  const env = getEnv();
  const allowed = can(session.member.role, "feature_flags");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Flags" title="Runtime switches" subtitle={`Environment ${env}. Local overrides stay in this browser. Permanent rollout uses VITE_ENABLE_*.`} />
      {!allowed && <p className="text-[13px] text-muted-foreground">Engineer and Viewer can inspect health, not flip flags.</p>}
      <Panel flush>
        {FLAG_SPECS.map((spec) => (
          <FlagRow key={spec.name} name={spec.name} label={spec.label} description={spec.description} disabled={!allowed} />
        ))}
      </Panel>
    </div>
  );
}

function FlagRow({ name, label, description, disabled }: { name: FlagName; label: string; description: string; disabled: boolean }) {
  const resolved = useResolvedFlag(name);
  const setLocal = useFlagsStore((state) => state.setLocal);

  return (
    <div className="rp-row">
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold">{label}</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{resolved.enabled ? "On" : "Off"} · {resolved.source}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="rp-btn rp-btn-outline"
        onClick={() => {
          setLocal(name, !resolved.enabled);
          toast.success(`${label} ${!resolved.enabled ? "forced on" : "forced off"} in this browser`);
        }}
      >
        Toggle local
      </button>
    </div>
  );
}

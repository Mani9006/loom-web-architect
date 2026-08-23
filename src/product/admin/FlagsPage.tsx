import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { FLAG_SPECS, useFlagsStore, useResolvedFlag, type FlagName } from "@/lib/feature-flags";
import { getEnv } from "@/lib/env";
import type { OperatorSession } from "@/product/lib/company-ops";
import { can } from "@/lib/operator-roles";

export default function FlagsPage() {
  const session = useOutletContext<OperatorSession>();
  const env = getEnv();
  const allowed = can(session.member.role, "feature_flags");

  return (
    <div className="space-y-8">
      <PageHeader kicker="Flags" title="Runtime switches" subtitle={`Environment ${env}. Local overrides stay in this browser. Permanent rollout uses VITE_ENABLE_*.`} />
      {!allowed && <p className="text-body text-muted-foreground">Engineer and Viewer can inspect health, not flip flags.</p>}
      <ul className="divide-y divide-border border-y border-border">
        {FLAG_SPECS.map((spec) => (
          <FlagRow key={spec.name} name={spec.name} label={spec.label} description={spec.description} disabled={!allowed} />
        ))}
      </ul>
    </div>
  );
}

function FlagRow({ name, label, description, disabled }: { name: FlagName; label: string; description: string; disabled: boolean }) {
  const resolved = useResolvedFlag(name);
  const setLocal = useFlagsStore((state) => state.setLocal);

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div>
        <h2 className="font-display text-xl">{label}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        <p className="mt-1 text-caption text-muted-foreground">{resolved.enabled ? "On" : "Off"} · {resolved.source}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="border border-border px-3 py-2 text-caption disabled:opacity-40"
        onClick={() => {
          setLocal(name, !resolved.enabled);
          toast.success(`${label} ${!resolved.enabled ? "forced on" : "forced off"} in this browser`);
        }}
      >
        Toggle local
      </button>
    </li>
  );
}

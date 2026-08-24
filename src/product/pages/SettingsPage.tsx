import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { useHandsOff } from "@/product/hooks/useHandsOff";
import { useCredits } from "@/product/hooks/useCredits";
import { PageHeader } from "@/product/components/PageHeader";
import { Field } from "@/product/ui/Field";
import { Panel } from "@/product/ui/Panel";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { plan } = useSubscription();
  const { balance } = useCredits();
  const { state, setState, persist, recipes } = useHandsOff();
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <PageHeader kicker="Settings" title="Apply policy, vaults, and account" />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Apply settings">
          <div className="space-y-3 p-4">
            <label className="flex items-center justify-between text-[13px]">
              Review before submit
              <input type="checkbox" checked={state.reviewBeforeSubmit} onChange={(e) => setState({ ...state, reviewBeforeSubmit: e.target.checked })} />
            </label>
            <Field label="Daily cap">
              <input type="number" className="rp-input" value={state.dailyCap} onChange={(e) => setState({ ...state, dailyCap: Number(e.target.value) })} />
            </Field>
            <button type="button" className="rp-btn rp-btn-primary" onClick={() => void persist(state, recipes, state.enabled)}>Save apply settings</button>
          </div>
        </Panel>

        <Panel title="Memory">
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-muted-foreground">Standing instructions the assistant and tailor may read. They cannot invent work history from this box.</p>
            <textarea className="rp-textarea" value={state.excludeInstructions} onChange={(e) => setState({ ...state, excludeInstructions: e.target.value })} />
            <button type="button" className="rp-btn rp-btn-outline" onClick={() => void persist(state, recipes, state.enabled)}>Save memory</button>
          </div>
        </Panel>

        <Panel title="Workday password vault">
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-muted-foreground">Store a Workday login only in the worker vault. The browser never sees the secret. Without WORKDAY_VAULT_KEY the form stays local and never submits.</p>
            <Field label="Username"><input className="rp-input" autoComplete="username" /></Field>
            <Field label="Password"><input type="password" className="rp-input" autoComplete="current-password" /></Field>
            <button type="button" className="rp-btn rp-btn-outline" onClick={() => toast.message("Vault UI ready", { description: "Set WORKDAY_VAULT_KEY on the worker to persist. We still will not mark Workday as submitted without a receipt." })}>
              Save to vault
            </button>
          </div>
        </Panel>

        <Panel title="Job boards">
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-muted-foreground">Connect Indeed or Naukri for sourcing. These buttons do not submit applications.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rp-btn rp-btn-outline" onClick={() => toast.message("Indeed", { description: "Set INDEED_CLIENT_ID / INDEED_CLIENT_SECRET to enable OAuth. No fake submit." })}>Connect Indeed</button>
              <button type="button" className="rp-btn rp-btn-outline" onClick={() => toast.message("Naukri", { description: "US product. Naukri is connect-only and never auto-submits." })}>Connect Naukri</button>
            </div>
          </div>
        </Panel>

        <Panel title="Plans & billing">
          <div className="space-y-3 p-4">
            <p className="text-[13px]">Plan <span className="font-medium capitalize">{plan}</span> · <span className="tabular-nums">{balance ?? "—"}</span> credits</p>
            <p className="text-[12px] text-muted-foreground">One successful submit = one credit. Stripe promo codes create an invoice only — they never mark an application submitted.</p>
            <button type="button" className="rp-btn rp-btn-primary" onClick={() => navigate("/plans")}>Manage plan</button>
          </div>
        </Panel>

        <Panel title="Referrals">
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-muted-foreground">Referral credits ship after billing is live. Your stub link:</p>
            <code className="block rounded-md bg-muted px-2 py-1.5 font-mono text-[12px]">https://resumepreps.com/r/{user?.id?.slice(0, 8)}</code>
          </div>
        </Panel>
      </div>

      <Panel title="Email integrations">
        <div className="p-4">
          <button type="button" className="rp-btn rp-btn-outline" onClick={() => navigate("/inbox")}>Open Recruiter inbox</button>
        </div>
      </Panel>

      <ApplicationProfileCard />

      <Panel title="Account">
        <div className="space-y-3 p-4">
          <p className="text-[13px]">{user?.email}</p>
          <button
            type="button"
            className="rp-btn rp-btn-destructive"
            onClick={async () => { await signOut(); navigate("/auth"); }}
          >
            Sign out
          </button>
        </div>
      </Panel>
    </div>
  );
}

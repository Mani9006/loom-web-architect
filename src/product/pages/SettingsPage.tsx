import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/SubscriptionGate";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { useHandsOff } from "@/product/hooks/useHandsOff";
import { useCredits } from "@/product/hooks/useCredits";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { plan } = useSubscription();
  const { balance } = useCredits();
  const { state, setState, persist, recipes } = useHandsOff();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 space-y-6">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Settings</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Apply policy, vaults, and account</h1>
      </header>

      <Card title="Apply settings">
        <label className="flex items-center justify-between text-[13px]">
          Review before submit
          <input type="checkbox" checked={state.reviewBeforeSubmit} onChange={(e) => setState({ ...state, reviewBeforeSubmit: e.target.checked })} />
        </label>
        <label className="mt-3 block text-[12px] text-muted-foreground">Daily cap
          <input type="number" className="mt-1 h-10 w-full rounded-md border border-input px-3 text-[13px] text-foreground" value={state.dailyCap} onChange={(e) => setState({ ...state, dailyCap: Number(e.target.value) })} />
        </label>
        <button type="button" className="mt-3 h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => void persist(state, recipes, state.enabled)}>Save apply settings</button>
      </Card>

      <Card title="Memory">
        <p className="text-[13px] text-muted-foreground">Standing instructions the assistant and tailor may read. They cannot invent work history from this box.</p>
        <textarea className="mt-2 min-h-[100px] w-full rounded-md border border-input p-3 text-[13px]" value={state.excludeInstructions} onChange={(e) => setState({ ...state, excludeInstructions: e.target.value })} />
        <button type="button" className="mt-3 h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => void persist(state, recipes, state.enabled)}>Save memory</button>
      </Card>

      <Card title="Workday password vault">
        <p className="text-[13px] text-muted-foreground">Store a Workday login only in the worker vault. The browser never sees the secret. Without WORKDAY_VAULT_KEY the form stays local and never submits.</p>
        <input className="mt-2 h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Workday username" />
        <input type="password" className="mt-2 h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Workday password" />
        <button type="button" className="mt-3 h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => toast.message("Vault UI ready", { description: "Set WORKDAY_VAULT_KEY on the worker to persist. We still will not mark Workday as submitted without a receipt." })}>
          Save to vault
        </button>
      </Card>

      <Card title="Job boards">
        <p className="text-[13px] text-muted-foreground">Connect Indeed or Naukri for sourcing. These buttons do not submit applications.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => toast.message("Indeed", { description: "Set INDEED_CLIENT_ID / INDEED_CLIENT_SECRET to enable OAuth. No fake submit." })}>Connect Indeed</button>
          <button type="button" className="h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => toast.message("Naukri", { description: "US product. Naukri is connect-only and never auto-submits." })}>Connect Naukri</button>
        </div>
      </Card>

      <Card title="Plans & billing">
        <p className="text-[13px]">Plan <span className="font-medium capitalize">{plan}</span> · <span className="tabular-nums">{balance ?? "—"}</span> credits</p>
        <p className="mt-1 text-[12px] text-muted-foreground">One successful submit = one credit. Stripe promo codes create an invoice only — they never mark an application submitted.</p>
        <button type="button" className="mt-3 h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => navigate("/plans")}>Manage plan</button>
      </Card>

      <Card title="Referrals">
        <p className="text-[13px] text-muted-foreground">Referral credits ship after billing is live. Your stub link:</p>
        <code className="mt-2 block rounded-md bg-muted px-2 py-1 text-[12px]">https://resumepreps.com/r/{user?.id?.slice(0, 8)}</code>
      </Card>

      <Card title="Email integrations">
        <button type="button" className="h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => navigate("/inbox")}>Open Recruiter inbox</button>
      </Card>

      <ApplicationProfileCard />

      <Card title="Account">
        <p className="text-[13px]">{user?.email}</p>
        <button
          type="button"
          className="mt-3 h-9 rounded-md border border-rose-500/30 px-3 text-[13px] text-rose-700"
          onClick={async () => { await signOut(); navigate("/auth"); }}
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

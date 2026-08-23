import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { CreditBalance } from "@/components/apply/CreditBalance";
import { GhostButton, Panel, PrimaryButton } from "@/components/brand/ui";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { useSubscription } from "@/components/SubscriptionGate";
import { useAuth } from "@/contexts/AuthContext";
import { useApplyCredits } from "@/hooks/use-apply-credits";
import { creditPlanLabel } from "@/lib/apply-credits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { plan } = useSubscription();
  const { snapshot: credits } = useApplyCredits();
  const navigate = useNavigate();
  const [vaultUser, setVaultUser] = useState("");
  const [vaultSecret, setVaultSecret] = useState("");
  const [vaultOn, setVaultOn] = useState(false);
  const [notify, setNotify] = useState(true);

  const loadVault = useCallback(async () => {
    const { data } = await (supabase as never as { rpc: (n: string, a?: object) => Promise<{ data: { configured?: boolean; username?: string } | null }> }).rpc("ats_vault_status", { p_ats: "workday" });
    setVaultOn(Boolean(data?.configured));
    setVaultUser(data?.username || "");
  }, []);

  useEffect(() => { void loadVault(); }, [loadVault]);

  const saveVault = async () => {
    const { error } = await (supabase as never as { rpc: (n: string, a: object) => Promise<{ error: { message: string } | null }> }).rpc("ats_vault_upsert", {
      p_ats: "workday",
      p_username: vaultUser,
      p_secret: vaultSecret,
    });
    if (error) {
      toast.error("Password was not stored.");
      return;
    }
    setVaultSecret("");
    toast.success("Workday secret saved. It is never shown again.");
    await loadVault();
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        status={`${creditPlanLabel(plan)} desk`}
        description="Credits, billing, Workday vault, job boards, and notifications."
        action={<CreditBalance snapshot={credits} />}
      />

      <div className="space-y-5">
        <Panel className="p-5">
          <h2 className="font-display text-[22px] italic">Credits and billing</h2>
          <p className="mt-2 text-[14px] text-rp-ink-2">1 successful submit = 1 credit. Failures are free. Promo codes discount the Stripe invoice only.</p>
          {credits && (
            <p className="mt-3 font-mono text-[13px]">{credits.remaining} / {credits.granted} this month · {credits.daily_remaining} live left today</p>
          )}
          <GhostButton className="mt-4" onClick={() => navigate("/pricing")}>Open billing</GhostButton>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-[22px] italic">Workday password</h2>
          <p className="mt-2 text-[13px] text-rp-ink-2">Stored in a private vault. The worker can use it; the browser never reads it back.</p>
          <p className="mt-2 text-[12px] text-rp-ink-3">{vaultOn ? `Configured${vaultUser ? ` as ${vaultUser}` : ""}` : "Not configured"}</p>
          <input value={vaultUser} onChange={(e) => setVaultUser(e.target.value)} placeholder="Username" className="mt-3 h-10 w-full rounded-md border border-rp-ink/15 px-3 text-[13px]" />
          <input type="password" value={vaultSecret} onChange={(e) => setVaultSecret(e.target.value)} placeholder="New password" className="mt-2 h-10 w-full rounded-md border border-rp-ink/15 px-3 text-[13px]" />
          <div className="mt-3 flex gap-2">
            <PrimaryButton onClick={() => void saveVault()}>Save vault</PrimaryButton>
            <GhostButton onClick={async () => {
              await (supabase as never as { rpc: (n: string, a: object) => Promise<unknown> }).rpc("ats_vault_clear", { p_ats: "workday" });
              await loadVault();
            }}>Clear</GhostButton>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-[22px] italic">Job boards</h2>
          <p className="mt-2 text-[14px] text-rp-ink-2">Indeed and Naukri are user-owned logins. We do not fake an API submit. Connect the account you already have; unsupported boards stay in Needs you.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-rp-ink/10 p-4">
              <p className="font-medium">Indeed</p>
              <p className="mt-1 text-[13px] text-rp-ink-2">Sign in on Indeed in your own browser. We will never claim a submit we did not make.</p>
              <GhostButton className="mt-3" onClick={() => window.open("https://secure.indeed.com/account/login", "_blank", "noopener")}>Connect Indeed account</GhostButton>
            </div>
            <div className="rounded-md border border-rp-ink/10 p-4">
              <p className="font-medium">Naukri</p>
              <p className="mt-1 text-[13px] text-rp-ink-2">Same rule. Account-owned. No fake API submit from this desk.</p>
              <GhostButton className="mt-3" onClick={() => window.open("https://www.naukri.com/nlogin/login", "_blank", "noopener")}>Connect Naukri account</GhostButton>
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-[22px] italic">Notifications</h2>
          <label className="mt-3 flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email me when a cloud job needs me or lands a receipt
          </label>
        </Panel>

        <ApplicationProfileCard />

        <Panel className="p-5">
          <p className="text-[13px] text-rp-ink-2">Signed in as {user?.email}</p>
          <GhostButton className="mt-3 text-destructive" onClick={async () => { await signOut(); navigate("/auth"); }}>Sign out</GhostButton>
        </Panel>
      </div>
    </div>
  );
}

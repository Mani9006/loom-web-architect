import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { companyOps } from "@/product/lib/company-ops";
import { Mark } from "@/product/components/Mark";
import { SkipLink } from "@/product/ui/SkipLink";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!token) return;
    setBusy(true);
    const { error } = await companyOps("accept_invite", { token });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("You joined the company desk");
    navigate("/admin/team");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink href="#invite" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-5">
          <Mark href="/" />
        </div>
      </header>
      <main id="invite" className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-24">
        <div className="max-w-lg">
          <p className="rp-kicker">Company invite</p>
          <h1 className="mt-3 font-display text-display-md">Join ResumePreps</h1>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            Sign in with the invited email, then accept. Roles are Owner, Admin, Support, Billing, Engineer, or Viewer.
          </p>
        </div>
        <div className="rp-panel space-y-4 p-6">
          <p className="text-[13px] text-muted-foreground">
            Accepting attaches this account to the company org. Privileged actions stay audited.
          </p>
          {!user ? (
            <Link to={`/auth?next=/invite/${token}`} className="rp-btn rp-btn-primary rp-btn-lg w-full no-underline">
              Sign in to accept
            </Link>
          ) : (
            <button type="button" disabled={busy} onClick={() => void accept()} className="rp-btn rp-btn-primary rp-btn-lg w-full">
              {busy ? "Accepting…" : `Accept as ${user.email}`}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

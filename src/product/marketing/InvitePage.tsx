import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { companyOps } from "@/product/lib/company-ops";
import { AuthChrome } from "@/product/marketing/AuthChrome";

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
    <AuthChrome
      kicker="Company invite"
      title="Join ResumePreps"
      body="Sign in with the invited email, then accept. Roles are Owner, Admin, Support, Billing, Engineer, or Viewer."
      formId="invite"
    >
      <div id="invite" className="rp-panel space-y-4 p-6">
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
    </AuthChrome>
  );
}

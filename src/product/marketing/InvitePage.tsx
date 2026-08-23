import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { companyOps } from "@/product/lib/company-ops";
import { Mark } from "@/product/components/Mark";

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
    <div className="min-h-screen bg-background px-5 py-16 text-foreground">
      <Mark href="/" />
      <main className="mx-auto mt-16 max-w-lg">
        <p className="text-caption text-primary">Company invite</p>
        <h1 className="mt-4 font-display text-5xl">Join ResumePreps</h1>
        <p className="mt-5 text-body text-muted-foreground">
          Sign in with the invited email, then accept. Roles are Owner, Admin, Support, Billing, Engineer, or Viewer.
        </p>
        {!user ? (
          <Link to={`/auth?next=/invite/${token}`} className="mt-8 inline-block bg-primary px-4 py-3 text-caption text-primary-foreground no-underline">
            Sign in to accept
          </Link>
        ) : (
          <button type="button" disabled={busy} onClick={() => void accept()} className="mt-8 bg-primary px-4 py-3 text-caption text-primary-foreground">
            {busy ? "Accepting…" : `Accept as ${user.email}`}
          </button>
        )}
      </main>
    </div>
  );
}

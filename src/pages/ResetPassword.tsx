import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { PublicFrame } from "@/components/brand/PublicFrame";
import { PrimaryButton } from "@/components/brand/ui";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordSchema.safeParse(password).success) {
      toast({ title: "Password too short", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Could not update password", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated" });
    navigate("/home");
  };

  return (
    <PublicFrame>
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">Account</p>
        <h1 className="mt-2 font-display text-[36px] italic">Set a new password</h1>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-rp-ink/10 bg-rp-paper p-6">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="h-11 w-full rounded-md border border-rp-ink/15 px-3" />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm" className="h-11 w-full rounded-md border border-rp-ink/15 px-3" />
          <PrimaryButton type="submit" disabled={loading} className="w-full">{loading ? "Saving…" : "Update password"}</PrimaryButton>
        </form>
      </main>
    </PublicFrame>
  );
}

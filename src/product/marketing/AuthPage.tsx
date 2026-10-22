import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field } from "@/product/ui/Field";
import { AuthChrome } from "./AuthChrome";

type Mode = "signin" | "signup" | "forgot";

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial: Mode = params.get("mode") === "signup" ? "signup" : params.get("mode") === "forgot" ? "forgot" : "signin";
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const next = params.get("next") || "/home";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Reset email sent if that account exists.");
        setMode("signin");
        return;
      }
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created. Check email if confirmation is required.");
        navigate(next);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${next}` },
    });
    if (error) toast.error(error.message);
  };

  const copy =
    mode === "signin"
      ? { kicker: "Welcome back", title: "Sign in", body: "Same company on both sides of the door. Credits, applications, and inbox live on the other side." }
      : mode === "signup"
        ? { kicker: "New account", title: "Start applying", body: "US jobs only. Submitted still waits for a worker receipt." }
        : { kicker: "Account recovery", title: "Forgot password", body: "We send a reset link to the email on the account. The new password is set on the next screen." };

  return (
    <AuthChrome kicker={copy.kicker} title={copy.title} body={copy.body}>
      <form id="auth-form" onSubmit={submit} className="rp-panel space-y-4 p-6">
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rp-input"
          />
        </Field>
        {mode !== "forgot" && (
          <Field label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rp-input"
            />
          </Field>
        )}
        <button type="submit" disabled={busy} className="rp-btn rp-btn-primary rp-btn-lg w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
        {mode !== "forgot" && (
          <button type="button" onClick={() => void google()} className="rp-btn rp-btn-outline rp-btn-lg w-full">
            Continue with Google
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px] text-muted-foreground">
          <button type="button" className="hover:text-foreground" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
            {mode === "signup" ? "Already have one?" : "Need an account?"}
          </button>
          {mode === "signin" ? (
            <button type="button" className="hover:text-foreground" onClick={() => setMode("forgot")}>
              Forgot password
            </button>
          ) : (
            <Link to="/reset-password" className="hover:text-foreground">
              Have a reset link?
            </Link>
          )}
        </div>
      </form>
    </AuthChrome>
  );
}

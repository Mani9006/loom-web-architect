import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";
import { Mark } from "@/product/components/Mark";

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/home");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created. Check email if confirmation is required.");
        navigate("/home");
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
      options: { redirectTo: `${window.location.origin}/home` },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Mark href="/" />
        <button type="button" onClick={toggleTheme} className="border border-border p-2" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>
      <main className="mx-auto grid max-w-6xl gap-16 px-5 py-16 md:grid-cols-2 md:py-24">
        <div className="max-w-md">
          <p className="text-caption text-primary">{mode === "signin" ? "Welcome back" : "New account"}</p>
          <h1 className="mt-4 font-display text-5xl">{mode === "signin" ? "Sign in" : "Start applying"}</h1>
          <p className="mt-5 text-body text-muted-foreground">
            Same company on both sides of the door. Your credits, applications, and inbox live on the other side.
          </p>
        </div>
        <form onSubmit={submit} className="max-w-md space-y-4 border-t border-border pt-8 md:border-l md:border-t-0 md:pl-12 md:pt-0">
          <label className="block text-caption text-muted-foreground">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full border border-border bg-background px-3 py-3 text-body outline-none"
            />
          </label>
          <label className="block text-caption text-muted-foreground">
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full border border-border bg-background px-3 py-3 text-body outline-none"
            />
          </label>
          <button type="submit" disabled={busy} className="w-full bg-primary py-3 text-caption text-primary-foreground">
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button type="button" onClick={() => void google()} className="w-full border border-border py-3 text-caption">
            Continue with Google
          </button>
          <div className="flex items-center justify-between text-caption text-muted-foreground">
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Need an account?" : "Already have one?"}
            </button>
            <Link to="/reset-password">Forgot password</Link>
          </div>
        </form>
      </main>
    </div>
  );
}

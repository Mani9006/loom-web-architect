import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import { Wordmark } from "@/product/components/Mark";
import { trackProductEvent } from "@/lib/product-analytics";
import { sendWelcomeEmail } from "@/lib/email";
import { Moon, Sun } from "lucide-react";

const emailSchema = z.string().email("Enter a valid email");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
type Mode = "login" | "signup" | "forgot";

export default function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = mode === "signup" ? "Create account · ResumePreps" : "Sign in · ResumePreps";
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) navigate("/home");
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password");
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session?.user) navigate("/home"); });
    return () => subscription.unsubscribe();
  }, [navigate, mode]);

  function validate() {
    const next: typeof errors = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) next.email = emailResult.error.errors[0].message;
    if (mode !== "forgot") {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) next.password = passwordResult.error.errors[0].message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) setErrors({ email: error.message });
        else setResetSent(true);
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErrors({ password: "Invalid email or password." });
        else void trackProductEvent("auth_login_success", { provider: "email" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/home`, data: { full_name: fullName } } });
        if (error) setErrors({ email: error.message });
        else {
          void trackProductEvent("auth_signup_success", { provider: "email" });
          void sendWelcomeEmail(email, fullName);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/home` } });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <aside className="hidden lg:flex flex-col justify-between bg-[hsl(222_28%_7%)] p-10 text-[hsl(210_20%_94%)]">
        <Wordmark />
        <div>
          <p className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">US jobs. Real receipts. One credit per submit.</p>
          <p className="mt-3 max-w-sm text-[14px] text-white/60">The signed-in desk and this auth screen share the same graphite system. No cream brochure, no leftover indigo 404.</p>
        </div>
        <p className="text-[12px] text-white/40">resumepreps.com</p>
      </aside>
      <div className="flex flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="lg:invisible"><Wordmark /></Link>
          <button type="button" onClick={toggleTheme} className="h-9 w-9 rounded-md hover:bg-muted" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <form onSubmit={onSubmit} className="mx-auto my-auto w-full max-w-sm space-y-3" role="form">
          <h1 className="text-[24px] font-semibold tracking-tight">{mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in"}</h1>
          {mode === "signup" && <input className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />}
          <div>
            <input className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p className="mt-1 text-[12px] text-rose-600">{errors.email}</p>}
          </div>
          {mode !== "forgot" && (
            <div>
              <input type="password" className="h-10 w-full rounded-md border border-input px-3 text-[13px]" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {errors.password && <p className="mt-1 text-[12px] text-rose-600">{errors.password}</p>}
            </div>
          )}
          {resetSent && <p className="text-[13px] text-primary">Check your email for a reset link.</p>}
          <button type="submit" disabled={loading} className="h-10 w-full rounded-md bg-primary text-[13px] font-medium text-primary-foreground">
            {mode === "login" ? "Login" : mode === "signup" ? "Sign Up" : "Send reset"}
          </button>
          <button type="button" onClick={() => void google()} className="h-10 w-full rounded-md border border-border text-[13px]">Continue with Google</button>
          <div className="flex justify-between text-[12px]">
            {mode !== "login" && <button type="button" onClick={() => setMode("login")}>Login</button>}
            {mode !== "signup" && <button type="button" onClick={() => setMode("signup")}>Sign Up</button>}
            {mode !== "forgot" && <button type="button" onClick={() => setMode("forgot")}>Forgot</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

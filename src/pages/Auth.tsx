import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { PublicFrame } from "@/components/brand/PublicFrame";
import Logo from "@/components/shared/Logo";
import { useToast } from "@/hooks/use-toast";
import { sendWelcomeEmail } from "@/lib/email";
import { trackProductEvent } from "@/lib/product-analytics";
import { supabase } from "@/integrations/supabase/client";

const emailSchema = z.string().email("Enter a valid email");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

type AuthMode = "login" | "signup" | "forgot";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initial = searchParams.get("mode") as AuthMode | null;
  const [mode, setMode] = useState<AuthMode>(initial === "signup" || initial === "forgot" ? initial : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    document.title = mode === "signup" ? "Open a desk — ResumePreps" : "Sign in — ResumePreps";
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) navigate("/home");
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate("/home");
    });
    return () => subscription.unsubscribe();
  }, [mode, navigate]);

  const validate = () => {
    const next: { email?: string; password?: string } = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) next.email = emailResult.error.errors[0].message;
    if (mode !== "forgot") {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) next.password = passwordResult.error.errors[0].message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) toast({ title: "Could not send reset", description: error.message, variant: "destructive" });
        else {
          setResetSent(true);
          void trackProductEvent("auth_password_reset_requested", { provider: "email" });
        }
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast({ title: "Sign in failed", description: "Check the email and password.", variant: "destructive" });
        else void trackProductEvent("auth_login_success", { provider: "email" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/home`, data: { full_name: fullName } },
        });
        if (error) {
          toast({
            title: error.message.includes("already registered") ? "Account exists" : "Could not create desk",
            description: error.message.includes("already registered") ? "Sign in with this email instead." : error.message,
            variant: "destructive",
          });
        } else {
          toast({ title: "Desk opened", description: "You can upload a US resume next." });
          void trackProductEvent("auth_signup_success", { provider: "email" });
          void sendWelcomeEmail(email, fullName);
        }
      }
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setGoogleLoading(true);
    void trackProductEvent("auth_oauth_start", { provider: "google" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/home`, queryParams: { access_type: "offline", prompt: "consent" } },
    });
    if (error) {
      toast({ title: "Google sign-in failed", description: error.message, variant: "destructive" });
      setGoogleLoading(false);
    }
  };

  return (
    <PublicFrame>
      <div className="mx-auto grid w-full max-w-[1100px] gap-12 px-6 py-12 lg:grid-cols-[1fr_420px] lg:items-start lg:py-16">
        <div className="hidden lg:block">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">United States desk</p>
          <h2 className="mt-3 max-w-[14ch] font-display text-[48px] italic leading-[0.95]">Same product after you sign in.</h2>
          <ul className="mt-8 space-y-4 text-[15px] leading-relaxed text-rp-ink-2">
            <li>Email or Google. No leftover purple chrome.</li>
            <li>The chat rail can call tools. It will not invent work history or mark submitted without a receipt.</li>
            <li>Live adapters: Greenhouse, Lever, Ashby, Workable, Workday. Everything else stays honest.</li>
            <li>1 credit = 1 successful portal submit. Promo codes discount the invoice only.</li>
          </ul>
        </div>
        <div className="mx-auto w-full max-w-md">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rp-accent-2">
          {mode === "signup" ? "New desk" : mode === "forgot" ? "Reset" : "Return"}
        </p>
        <h1 className="mt-2 font-display text-[36px] italic leading-none">
          {mode === "signup" ? "Open a desk" : mode === "forgot" ? "Reset password" : "Sign in"}
        </h1>
        <p className="mt-3 text-[14px] text-rp-ink-2">
          {mode === "signup" ? "Email or Google. United States applications only for now." : "Same account you used to open the desk."}
        </p>

        {resetSent ? (
          <div className="mt-8 border-[1.5px] border-rp-ink/15 bg-rp-paper p-5 text-[14px] leading-relaxed">
            A reset link is on its way to <strong>{email}</strong>.
            <button type="button" className="mt-4 block text-rp-accent" onClick={() => { setMode("login"); setResetSent(false); }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="mt-8 border-[1.5px] border-rp-ink/15 bg-rp-paper p-6 shadow-[4px_4px_0_0_hsl(var(--rp-ink)/0.12)]">
            {mode !== "forgot" && (
              <button
                type="button"
                onClick={() => void google()}
                disabled={googleLoading}
                className="flex h-11 w-full items-center justify-center gap-2 border-[1.5px] border-rp-ink/20 bg-rp-canvas text-[14px] font-medium"
              >
                {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                Continue with Google
              </button>
            )}
            {mode !== "forgot" && (
              <p className="my-5 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-rp-ink-3">or email</p>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "signup" && (
                <label className="block text-[13px]">
                  Full name
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 h-11 w-full border-[1.5px] border-rp-ink/20 bg-rp-canvas px-3" />
                </label>
              )}
              <label className="block text-[13px]">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 w-full border-[1.5px] border-rp-ink/20 bg-rp-canvas px-3" />
                {errors.email && <span className="text-destructive">{errors.email}</span>}
              </label>
              {mode !== "forgot" && (
                <label className="block text-[13px]">
                  Password
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11 w-full border-[1.5px] border-rp-ink/20 bg-rp-canvas px-3" />
                  {errors.password && <span className="text-destructive">{errors.password}</span>}
                </label>
              )}
              {mode === "signup" && (
                <p className="text-[12px] text-rp-ink-3">
                  By opening a desk you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
                </p>
              )}
              <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center bg-primary text-[14px] font-medium text-primary-foreground">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Sign in" : mode === "signup" ? "Create desk" : "Send reset link"}
              </button>
            </form>
            <div className="mt-5 text-[13px] text-rp-ink-2">
              {mode === "login" && (
                <>
                  <button type="button" className="text-rp-accent" onClick={() => setMode("forgot")}>Forgot password?</button>
                  <span className="mx-2">·</span>
                  <button type="button" onClick={() => setMode("signup")}>Need a desk?</button>
                </>
              )}
              {mode === "signup" && <button type="button" onClick={() => setMode("login")}>I already have one</button>}
              {mode === "forgot" && <button type="button" onClick={() => setMode("login")}>Back to sign in</button>}
            </div>
          </div>
        )}
        </div>
      </div>
    </PublicFrame>
  );
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

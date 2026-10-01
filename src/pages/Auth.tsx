import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, ArrowLeft, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { z } from "zod";
import Logo from "@/components/shared/Logo";
import { trackProductEvent } from "@/lib/product-analytics";
import { sendWelcomeEmail } from "@/lib/email";
import { useTheme } from "@/hooks/use-theme";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

type Provider = "google";
type AuthMode = "login" | "signup" | "forgot";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") as AuthMode | null;

  const [mode, setMode] = useState<AuthMode>(initialMode || "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<Provider | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) navigate("/home");
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate("/home");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
    if (mode !== "forgot") {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
        else {
          setResetSent(true);
          toast({ title: "Check your email", description: "We've sent you a password reset link." });
          void trackProductEvent("auth_password_reset_requested", { provider: "email" });
        }
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast({ title: "Login failed", description: error.message.includes("Invalid login credentials") ? "Invalid email or password." : error.message, variant: "destructive" });
        else void trackProductEvent("auth_login_success", { provider: "email" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/home`, data: { full_name: fullName } } });
        if (error) toast({ title: error.message.includes("already registered") ? "Account exists" : "Sign up failed", description: error.message.includes("already registered") ? "This email is already registered." : error.message, variant: "destructive" });
        else {
          toast({ title: "Welcome!", description: "Account created successfully." });
          void trackProductEvent("auth_signup_success", { provider: "email" });
          void sendWelcomeEmail(email, fullName);
        }
      }
    } catch { toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleSocialLogin = async (provider: Provider) => {
    setSocialLoading(provider);
    try {
      void trackProductEvent("auth_oauth_start", { provider });
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/home`, queryParams: { access_type: 'offline', prompt: 'consent' } } });
      if (error) { toast({ title: "Login failed", description: error.message, variant: "destructive" }); setSocialLoading(null); }
    } catch { toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" }); setSocialLoading(null); }
  };

  const switchMode = (newMode: AuthMode) => { setMode(newMode); setErrors({}); setResetSent(false); };

  if (mode === "forgot" && resetSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-6 text-center">
          <div className="w-12 h-12 rounded-lg border border-border bg-card flex items-center justify-center mx-auto">
            <Mail className="w-5 h-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
          <p className="text-muted-foreground">We've sent a password reset link to <strong className="text-foreground">{email}</strong></p>
          <Button variant="outline" onClick={() => switchMode("login")} className="w-full h-10 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      <button
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      {/* Decorative side */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12 border-r border-border">
        <div className="relative max-w-md">
          <Logo size="lg" className="mb-10" />
          <h2 className="text-5xl font-semibold text-foreground mb-4 text-balance">
            Every application, tracked and tailored.
          </h2>
          <p className="text-muted-foreground text-base">
            Résumé building, evidence-based job matching, application preparation, and verified tracking in one workspace.
          </p>
        </div>
      </div>

      {/* Auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <Logo size="lg" className="justify-center" />
          </div>

          {/* Card */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {mode !== "forgot" && (
              <div className="flex border-b border-border">
                {(["login", "signup"] as AuthMode[]).map((m) => (
                  <button key={m} onClick={() => switchMode(m)}
                    className={`flex-1 py-4 text-center text-sm font-semibold transition-colors relative ${
                      mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {m === "login" ? "Log In" : "Sign Up"}
                    {mode === m && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />}
                  </button>
                ))}
              </div>
            )}

            <div className="p-6 sm:p-8 space-y-5">
              {mode === "forgot" && (
                <div className="text-center mb-2">
                  <h2 className="text-base font-semibold text-foreground">Reset Password</h2>
                  <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => switchMode("login")} className="mt-2 gap-1 text-muted-foreground">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to login
                  </Button>
                </div>
              )}

              {mode !== "forgot" && (
                <>
                  <Button type="button" variant="outline" onClick={() => handleSocialLogin("google")} disabled={socialLoading !== null}
                    className="w-full h-10 gap-2.5 font-medium">
                    {socialLoading === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                    Continue with Google
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                    <div className="relative flex justify-center text-xs font-medium"><span className="px-3 text-muted-foreground bg-card">or</span></div>
                  </div>
                </>
              )}

              <form onSubmit={handleAuth} className="space-y-4">
                {mode === "signup" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">First Name</Label>
                      <Input placeholder="First" value={fullName.split(" ")[0] || ""} onChange={(e) => {
                        const last = fullName.split(" ").slice(1).join(" ");
                        setFullName(last ? `${e.target.value} ${last}` : e.target.value);
                      }} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Last Name</Label>
                      <Input placeholder="Last" value={fullName.split(" ").slice(1).join(" ") || ""} onChange={(e) => {
                        const first = fullName.split(" ")[0] || "";
                        setFullName(e.target.value ? `${first} ${e.target.value}` : first);
                      }} className="h-10" />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                    className="h-10" />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Password</Label>
                      {mode === "login" && (
                        <button type="button" onClick={() => switchMode("forgot")} className="text-xs text-primary hover:underline font-medium">Forgot?</button>
                      )}
                    </div>
                    <Input type="password" placeholder="••••••••" value={password}
                      onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                      className="h-10" />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                )}
                {mode === "signup" && (
                  <div className="flex items-start gap-2.5">
                    <input type="checkbox" id="terms" className="mt-0.5 rounded border-border" defaultChecked />
                    <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed">
                      I agree to the <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                    </label>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full h-10">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Log In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
                </Button>
              </form>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Mail, Lock, User, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { z } from "zod";

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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) navigate("/chat");
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate("/chat");
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
        else { setResetSent(true); toast({ title: "Check your email", description: "We've sent you a password reset link." }); }
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast({ title: "Login failed", description: error.message.includes("Invalid login credentials") ? "Invalid email or password." : error.message, variant: "destructive" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/chat`, data: { full_name: fullName } } });
        if (error) toast({ title: error.message.includes("already registered") ? "Account exists" : "Sign up failed", description: error.message.includes("already registered") ? "This email is already registered." : error.message, variant: "destructive" });
        else toast({ title: "Welcome!", description: "Account created successfully." });
      }
    } catch { toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleSocialLogin = async (provider: Provider) => {
    setSocialLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/chat`, queryParams: { access_type: 'offline', prompt: 'consent' } } });
      if (error) { toast({ title: "Login failed", description: error.message, variant: "destructive" }); setSocialLoading(null); }
    } catch { toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" }); setSocialLoading(null); }
  };

  const switchMode = (newMode: AuthMode) => { setMode(newMode); setErrors({}); setResetSent(false); };

  if (mode === "forgot" && resetSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10" />
        <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full bg-primary/8" />
        <div className="w-full max-w-md space-y-6 text-center relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground">We've sent a password reset link to <strong className="text-foreground">{email}</strong></p>
          <Button variant="outline" onClick={() => switchMode("login")} className="w-full h-12 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* CareerFlow-style decorative blue circles */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10" />
      <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full bg-primary/8" />
      <div className="absolute top-1/2 -right-20 w-40 h-40 rounded-full bg-primary/5" />

      <div className="w-full max-w-lg relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-xl font-bold">CareerPrep<span className="text-primary">.ai</span></h1>
          <p className="text-muted-foreground text-sm mt-1">Job Seeker Portal</p>
        </div>

        {/* Card with tabs */}
        <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
          {/* Tab header - CareerFlow style */}
          {mode !== "forgot" && (
            <div className="flex border-b border-border">
              <button
                onClick={() => switchMode("login")}
                className={`flex-1 py-4 text-center text-sm font-semibold transition-colors relative ${
                  mode === "login" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Login
                {mode === "login" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
              <button
                onClick={() => switchMode("signup")}
                className={`flex-1 py-4 text-center text-sm font-semibold transition-colors relative ${
                  mode === "signup" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
                {mode === "signup" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
            </div>
          )}

          <div className="p-8 space-y-6">
            {mode === "forgot" && (
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold">Reset Password</h2>
                <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => switchMode("login")} className="mt-2 gap-1 text-muted-foreground">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to login
                </Button>
              </div>
            )}

            {/* Social Login */}
            {mode !== "forgot" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSocialLogin("google")}
                  disabled={socialLoading !== null}
                  className="w-full h-12 gap-3 font-medium rounded-xl"
                >
                  {socialLoading === "google" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  {mode === "login" ? "Continue with Google" : "Sign up with Google"}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div>
                </div>
              </>
            )}

            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">First Name <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="First Name"
                        value={fullName.split(" ")[0] || ""}
                        onChange={(e) => {
                          const last = fullName.split(" ").slice(1).join(" ");
                          setFullName(last ? `${e.target.value} ${last}` : e.target.value);
                        }}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Last Name <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="Last Name"
                        value={fullName.split(" ").slice(1).join(" ") || ""}
                        onChange={(e) => {
                          const first = fullName.split(" ")[0] || "";
                          setFullName(e.target.value ? `${first} ${e.target.value}` : first);
                        }}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                  className="h-11 rounded-xl"
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Password <span className="text-destructive">*</span></Label>
                    {mode === "login" && (
                      <button type="button" onClick={() => switchMode("forgot")} className="text-xs text-primary hover:underline font-medium">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                    className="h-11 rounded-xl"
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
              )}

              {mode === "signup" && (
                <div className="flex items-start gap-2">
                  <input type="checkbox" id="terms" className="mt-1 rounded border-border" defaultChecked />
                  <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed">
                    By signing up, I agree to the <a href="#" className="text-primary hover:underline">Terms of Service</a> and <a href="#" className="text-primary hover:underline">Privacy Policy</a>
                  </label>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-12 font-semibold text-base rounded-xl">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === "login" ? "Login" : mode === "signup" ? "Sign Up" : "Send Reset Link"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

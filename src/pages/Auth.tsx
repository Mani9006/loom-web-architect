import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Loader2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import logoImg from "@/assets/logo-new.png";

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
        else { setResetSent(true); toast({ title: "Check your email", description: "We've sent you a password reset link." }); }
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast({ title: "Login failed", description: error.message.includes("Invalid login credentials") ? "Invalid email or password." : error.message, variant: "destructive" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/home`, data: { full_name: fullName } } });
        if (error) toast({ title: error.message.includes("already registered") ? "Account exists" : "Sign up failed", description: error.message.includes("already registered") ? "This email is already registered." : error.message, variant: "destructive" });
        else toast({ title: "Welcome!", description: "Account created successfully." });
      }
    } catch { toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleSocialLogin = async (provider: Provider) => {
    setSocialLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/home`, queryParams: { access_type: 'offline', prompt: 'consent' } } });
      if (error) { toast({ title: "Login failed", description: error.message, variant: "destructive" }); setSocialLoading(null); }
    } catch { toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" }); setSocialLoading(null); }
  };

  const switchMode = (newMode: AuthMode) => { setMode(newMode); setErrors({}); setResetSent(false); };

  if (mode === "forgot" && resetSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Check your email</h1>
          <p className="text-muted-foreground text-sm">We've sent a password reset link to <strong className="text-foreground">{email}</strong></p>
          <Button variant="outline" onClick={() => switchMode("login")} className="w-full h-10 gap-2 text-[13px]">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <img src={logoImg} alt="ResumePrep" className="w-9 h-9 rounded-lg object-contain" />
          </div>
          <h1 className="text-lg font-bold text-foreground">ResumePrep</h1>
          <p className="text-muted-foreground text-[13px] mt-0.5">AI-powered career platform</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
          {/* Tabs */}
          {mode !== "forgot" && (
            <div className="flex border-b border-border">
              <button
                onClick={() => switchMode("login")}
                className={`flex-1 py-3 text-center text-[13px] font-semibold transition-colors relative ${
                  mode === "login" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log In
                {mode === "login" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
              </button>
              <button
                onClick={() => switchMode("signup")}
                className={`flex-1 py-3 text-center text-[13px] font-semibold transition-colors relative ${
                  mode === "signup" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
                {mode === "signup" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
              </button>
            </div>
          )}

          <div className="p-6 space-y-5">
            {mode === "forgot" && (
              <div className="text-center mb-1">
                <h2 className="text-[15px] font-bold text-foreground">Reset Password</h2>
                <p className="text-[12px] text-muted-foreground mt-1">Enter your email to receive a reset link</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => switchMode("login")} className="mt-1.5 gap-1 text-muted-foreground text-[12px]">
                  <ArrowLeft className="w-3 h-3" /> Back to login
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
                  className="w-full h-10 gap-2.5 font-medium text-[13px]"
                >
                  {socialLoading === "google" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
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
                  <div className="relative flex justify-center text-[11px] uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div>
                </div>
              </>
            )}

            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-3.5">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[12px] font-medium">First Name</Label>
                    <Input
                      placeholder="First Name"
                      value={fullName.split(" ")[0] || ""}
                      onChange={(e) => {
                        const last = fullName.split(" ").slice(1).join(" ");
                        setFullName(last ? `${e.target.value} ${last}` : e.target.value);
                      }}
                      className="h-9 text-[13px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px] font-medium">Last Name</Label>
                    <Input
                      placeholder="Last Name"
                      value={fullName.split(" ").slice(1).join(" ") || ""}
                      onChange={(e) => {
                        const first = fullName.split(" ")[0] || "";
                        setFullName(e.target.value ? `${first} ${e.target.value}` : first);
                      }}
                      className="h-9 text-[13px]"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[12px] font-medium">Email</Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                  className="h-9 text-[13px]"
                />
                {errors.email && <p className="text-[12px] text-destructive">{errors.email}</p>}
              </div>

              {mode !== "forgot" && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-medium">Password</Label>
                    {mode === "login" && (
                      <button type="button" onClick={() => switchMode("forgot")} className="text-[11px] text-primary hover:underline font-medium">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                    className="h-9 text-[13px]"
                  />
                  {errors.password && <p className="text-[12px] text-destructive">{errors.password}</p>}
                </div>
              )}

              {mode === "signup" && (
                <div className="flex items-start gap-2">
                  <input type="checkbox" id="terms" className="mt-0.5 rounded border-border" defaultChecked />
                  <label htmlFor="terms" className="text-[11px] text-muted-foreground leading-relaxed">
                    I agree to the <a href="#" className="text-primary hover:underline">Terms</a> and <a href="#" className="text-primary hover:underline">Privacy Policy</a>
                  </label>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-10 font-semibold text-[13px]">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Log In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

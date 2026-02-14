import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Mail, Lock, User, Loader2, ArrowLeft, CheckCircle, FileText, Target, Search } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

type Provider = "google";
type AuthMode = "login" | "signup" | "forgot";

const highlights = [
  { icon: FileText, text: "AI Resume Builder" },
  { icon: Target, text: "ATS Score Checker" },
  { icon: Search, text: "Smart Job Search" },
  { icon: Mail, text: "Cover Letter Generator" },
];

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
      if (event === "SIGNED_IN" && session?.user) {
        navigate("/chat");
      }
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate("/chat");
      }
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
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        } else {
          setResetSent(true);
          toast({ title: "Check your email", description: "We've sent you a password reset link." });
        }
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast({
            title: "Login failed",
            description: error.message.includes("Invalid login credentials")
              ? "Invalid email or password. Please try again."
              : error.message,
            variant: "destructive",
          });
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/chat`,
            data: { full_name: fullName },
          },
        });
        if (error) {
          toast({
            title: error.message.includes("already registered") ? "Account exists" : "Sign up failed",
            description: error.message.includes("already registered")
              ? "This email is already registered. Please sign in instead."
              : error.message,
            variant: "destructive",
          });
        } else {
          toast({ title: "Welcome!", description: "Account created successfully." });
        }
      }
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: Provider) => {
    setSocialLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/chat`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
        setSocialLoading(null);
      }
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
      setSocialLoading(null);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrors({});
    setResetSent(false);
  };

  if (mode === "forgot" && resetSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground">
            We've sent a password reset link to <strong className="text-foreground">{email}</strong>
          </p>
          <Button variant="outline" onClick={() => switchMode("login")} className="w-full h-12 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/70 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">CareerPrep.ai</span>
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold leading-tight mb-3">
                Land your dream job<br />with AI-powered tools
              </h2>
              <p className="text-primary-foreground/70 text-lg">
                Join thousands of professionals who've accelerated their career with our intelligent toolkit.
              </p>
            </div>

            <div className="space-y-4">
              {highlights.map((item) => (
                <div key={item.text} className="flex items-center gap-3 bg-white/10 backdrop-blur rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="font-medium">{item.text}</span>
                  <CheckCircle className="w-4 h-4 ml-auto text-green-300" />
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-primary-foreground/50">
            © {new Date().getFullYear()} CareerPrep AI. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2.5 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">CareerPrep<span className="text-primary">.ai</span></span>
            </div>
            <h1 className="text-2xl font-bold">
              {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {mode === "login"
                ? "Sign in to continue to your dashboard"
                : mode === "signup"
                ? "Start your career journey today — it's free"
                : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {/* Social Login */}
          {mode !== "forgot" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSocialLogin("google")}
                disabled={socialLoading !== null}
                className="w-full h-12 gap-3 font-medium"
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
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">or continue with email</span>
                </div>
              </div>
            </>
          )}

          {mode === "forgot" && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => switchMode("login")}
              className="justify-start text-muted-foreground hover:text-foreground gap-2 -ml-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Button>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                  className="pl-10 h-12"
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button type="button" onClick={() => switchMode("forgot")} className="text-sm text-primary hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                    className="pl-10 h-12"
                  />
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-12 font-semibold text-base">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
            </Button>
          </form>

          {mode !== "forgot" && (
            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")} className="text-primary hover:underline font-semibold">
                {mode === "login" ? "Sign up for free" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

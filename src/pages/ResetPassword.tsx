import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/product/ui/Field";
import { AuthChrome } from "@/product/marketing/AuthChrome";

const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        /* ready */
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const validateForm = () => {
    const newErrors: { password?: string; confirm?: string } = {};
    const result = passwordSchema.safeParse(password);
    if (!result.success) newErrors.password = result.error.errors[0].message;
    if (password !== confirmPassword) newErrors.confirm = "Passwords do not match";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setSuccess(true);
        toast({ title: "Password updated", description: "Your password has been successfully reset." });
        setTimeout(() => navigate("/home"), 2000);
      }
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthChrome
      kicker="Account recovery"
      title={success ? "Password updated" : "Create a new password"}
      body={success ? "Redirecting you to the desk." : "Your new password must be at least 6 characters. This screen uses the same chrome as sign in."}
      formId="reset-form"
    >
      {success ? (
        <div className="rp-panel p-6 text-[13px] text-muted-foreground">You can close this tab if the desk already opened.</div>
      ) : (
        <form id="reset-form" onSubmit={handleSubmit} className="rp-panel space-y-4 p-6">
          <Field label="New password" htmlFor="password">
            <input
              id="password"
              type="password"
              className="rp-input"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((p) => ({ ...p, password: undefined }));
              }}
            />
            {errors.password && <span className="text-[12px] text-destructive">{errors.password}</span>}
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword">
            <input
              id="confirmPassword"
              type="password"
              className="rp-input"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrors((p) => ({ ...p, confirm: undefined }));
              }}
            />
            {errors.confirm && <span className="text-[12px] text-destructive">{errors.confirm}</span>}
          </Field>
          <button type="submit" disabled={loading} className="rp-btn rp-btn-primary rp-btn-lg w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
          </button>
        </form>
      )}
    </AuthChrome>
  );
}

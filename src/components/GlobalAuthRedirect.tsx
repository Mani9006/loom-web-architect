import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global auth event listener that catches PASSWORD_RECOVERY events
 * from any page and redirects to the reset-password page.
 *
 * This is needed because Supabase may redirect the user to the site
 * root (/) after verifying the reset token, rather than /reset-password,
 * if the redirect URL is not in the allowlist. This component ensures
 * the PASSWORD_RECOVERY event is always caught regardless of which
 * page the user lands on.
 */
export default function GlobalAuthRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    });

    // Also check the URL hash on mount for recovery tokens
    // Supabase redirects with hash: #access_token=...&type=recovery
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery") && location.pathname !== "/reset-password") {
      navigate("/reset-password", { replace: true });
    }

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  return null;
}

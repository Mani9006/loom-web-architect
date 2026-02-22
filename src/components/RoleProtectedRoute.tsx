import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface RoleProtectedRouteProps {
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export default function RoleProtectedRoute({
  allowedRoles,
  redirectTo = "/home",
}: RoleProtectedRouteProps) {
  const { user, loading, roles } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const hasAccess = allowedRoles.some((role) => roles.includes(role));
  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}

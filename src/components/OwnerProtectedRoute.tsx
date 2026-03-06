import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { isOwnerEmail } from "@/lib/admin";

interface OwnerProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

export default function OwnerProtectedRoute({
  children,
  redirectTo = "/home",
}: OwnerProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isOwnerEmail(user.email)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

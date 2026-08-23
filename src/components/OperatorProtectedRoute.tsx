import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";

export default function OperatorProtectedRoute() {
  const { user, loading } = useAuth();
  const session = useQuery({
    queryKey: ["operator-session", user?.id],
    queryFn: async () => {
      const { data, error } = await companyOps<OperatorSession>("session");
      if (error || !data) throw error || new Error("Not an operator");
      return data;
    },
    enabled: Boolean(user?.id),
    retry: false,
  });

  if (loading || (user && session.isLoading)) {
    return <LoadingSpinner fullScreen message="Opening company…" />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (session.error || !session.data) return <Navigate to="/home" replace />;
  return <Outlet context={session.data} />;
}

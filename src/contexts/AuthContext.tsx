import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  roles: [],
  isAdmin: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const initializedRef = useRef(false);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles(data ? data.map((r) => r.role) : []);
  }, []);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setRoles([]);
        }
        if (newSession?.user) {
          void fetchRoles(newSession.user.id);
        }
        setLoading(false);
      }
    );

    // Then check initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          void fetchRoles(initialSession.user.id);
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const isAdmin = roles.includes("admin");

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

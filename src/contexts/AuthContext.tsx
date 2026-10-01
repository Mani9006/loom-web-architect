import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { clearUserDrafts } from "@/lib/clear-user-drafts";
import { clearPersistedState } from "@/hooks/use-persisted-state";

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
  const [authReady, setAuthReady] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const initializedRef = useRef(false);
  const fetchedRolesForUserRef = useRef<string | null>(null);

  const fetchRoles = useCallback(async (userId: string) => {
    fetchedRolesForUserRef.current = userId;
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      setRoles(data ? data.map((r) => r.role) : []);
    } catch {
      setRoles([]);
    } finally {
      setRolesReady(true);
    }
  }, []);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Deduplicate state updates. supabase fires TOKEN_REFRESHED on every
        // tab visibility change with a freshly-allocated session object ,
        // if we naively setSession()/setUser() each time, downstream consumers
        // that depend on session/user identity (useEffect deps, react-query
        // keys) see "changes" and re-run, which is exactly what was causing
        // pages to "reload to wherever they stopped" on tab switch. Only
        // commit a state change when something actually differs.
        setSession((prev) => {
          if (prev?.access_token === newSession?.access_token &&
              prev?.user?.id === newSession?.user?.id) {
            return prev;
          }
          return newSession;
        });
        setUser((prev) => {
          const next = newSession?.user ?? null;
          if (prev?.id === next?.id && prev?.email === next?.email) {
            return prev;
          }
          return next;
        });
        if (event === "SIGNED_OUT") {
          clearUserDrafts();
          setSession(null);
          setUser(null);
          setRoles([]);
          setRolesReady(true);
          fetchedRolesForUserRef.current = null;
          // Drop page drafts (resume text, job descriptions, etc.) so they
          // are not pre-filled for the next user on this browser.
          clearPersistedState();
        }
        setAuthReady(true);
        // Only refetch roles when this is genuinely a *new* user signing in.
        // Supabase v2 sometimes re-fires SIGNED_IN on session re-validation
        // (tab visibility change, focus, manual getSession call) with the
        // SAME user, refetching there flips `rolesReady` to false, which
        // flips `loading` to true, which makes ProtectedRoute swap to a
        // spinner. That spinner unmounts every page below it, blowing away
        // dialog state, scroll position, in-progress forms, etc., the
        // "pages disappear when I switch apps" symptom.
        if (event === "SIGNED_IN" && newSession?.user &&
            fetchedRolesForUserRef.current !== newSession.user.id) {
          setRolesReady(false);
          void fetchRoles(newSession.user.id);
        }
      }
    );

    // Then check initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setAuthReady(true);
        if (initialSession?.user &&
            fetchedRolesForUserRef.current !== initialSession.user.id) {
          void fetchRoles(initialSession.user.id);
        } else {
          setRolesReady(true);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signOut = useCallback(async () => {
    clearUserDrafts();
    try {
      await supabase.auth.signOut();
    } finally {
      clearPersistedState();
    }
  }, []);

  const isAdmin = roles.includes("admin");
  // loading stays true until BOTH auth state and roles are resolved
  const loading = !authReady || !rolesReady;

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

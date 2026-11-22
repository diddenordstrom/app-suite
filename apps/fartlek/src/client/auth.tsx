import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@/shared/types";

/** `demoMode`: served by the demo instance (throwaway account in its own database); with no user, the demo has expired. */
interface AuthState { user: User | null; loading: boolean; devMode: boolean; demoMode: boolean; /** Dev mode, or a member of the admin group at the identity provider. */ isAdmin: boolean; logout: () => Promise<void> }
const Ctx = createContext<AuthState>({ user: null, loading: true, devMode: false, demoMode: false, isAdmin: false, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; loading: boolean; devMode: boolean; demoMode: boolean; isAdmin: boolean }>({ user: null, loading: true, devMode: false, demoMode: false, isAdmin: false });
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json())
      .then((d: { user: User | null; authMode: string; isAdmin?: boolean }) => setState({ user: d.user, loading: false, devMode: d.authMode === "dev", demoMode: d.authMode === "demo", isAdmin: !!d.isAdmin }))
      .catch(() => setState({ user: null, loading: false, devMode: false, demoMode: false, isAdmin: false }));
  }, []);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // Ending a demo clears its cookie, so reload to land on the real app's sign-in.
    if (state.demoMode) return location.assign("/");
    setState((s) => ({ ...s, user: null }));
  };
  return <Ctx.Provider value={{ ...state, logout }}>{children}</Ctx.Provider>;
}
